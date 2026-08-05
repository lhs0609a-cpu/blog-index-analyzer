# -*- coding: utf-8 -*-
"""seed-explode 실행요청 큐 — app→worker 제어를 공유 볼륨으로 넘긴다.

**왜 필요한가 (2026-07-30 실측)**: `POST /keyword-pool/seed-explode-register` 는
`_WORKER_OFFLOAD_PATHS` 에 있어 app→worker HTTP 프록시를 탔는데, 이 프록시는 8s
ReadTimeout 후 httpx 를 닫는다. 그러면 **worker 의 요청이 끊겨 핸들러가 아예 실행되지
않고** 합성 ack(`{"queued":true}`)만 돌아온다. 실측: 4회 연속 + 드라이버 90회(30분)
전부 정확히 8.1~8.2초에 실패, pool 불변·seed_explode run 0건.

- 워커 프로세스는 살아있다(register 크론이 45~90초마다 정상 동작).
- 핸들러는 `background_tasks.add_task` 후 즉시 return 이라 정상이면 0.3s 에 응답한다.
- 즉 원인은 **워커 uvicorn 루프의 장시간 블로킹**(자동완성 마이닝 틱이 계정당 3~4분 점유).
- `flyctl apps restart` 로는 안 고쳐진다(2026-07-27 실측).

`ceiling-backtest`·`backfill-creative`·`extension/image-backfill` 이 같은 이유로 이미
오프로드에서 빠졌고 파일트리거 방식을 쓴다. 이 모듈은 그 패턴을 seed-explode 에 적용하되,
**단발 요청이 아니라 큐**로 만든다 — 등록 마라톤이 150시드씩 수십 배치를 연속으로 던지기
때문이다. 워커는 한 번에 하나씩 꺼내 실행하므로 큐 자체가 직렬화 역할도 한다.
"""
import json
import logging
import os
import time
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

_DATA_DIR = os.environ.get("DATA_DIR", "/data")
MAX_QUEUE = int(os.environ.get("SEED_EXPLODE_MAX_QUEUE", "200"))
WATCHDOG_EVERY = float(os.environ.get("SEED_EXPLODE_WATCHDOG_EVERY", "20"))

# ⛔ **좀비 job 이 큐를 영구히 막는 결함 수정 (2026-08-04 실측)**
#
# 증상: `POST /keyword-pool/seed-explode-register` 가 3회 연속 0.2초 만에
#       `503 {"detail":"실행 큐 적재 실패: queue_full"}`. 시간이 지나도 안 풀린다.
#
# 원인: `claim()` 은 `claimed_at` 이 찍힌 job 을 건너뛰고, `done_at` 은 `finish()` 만 찍는다.
#       그래서 **claim 직후 워커가 죽으면(재배포·OOM·머신 재시작) 그 job 은 영원히
#       claim 도 finish 도 안 되면서 큐 자리를 차지한다.** `enqueue()` 는 `done_at` 이
#       없는 job 을 전부 세므로, 이런 좀비가 200개 쌓이면 큐는 **영구 포화**가 된다.
#       (워커·스케줄러 자체는 정상이었다 — 큐 '회계'가 막힌 것이다.)
#
# 수정: ① claim 후 STALE_AFTER 가 지나면 미claim 으로 되돌려 재실행 대상으로 삼는다.
#       ② 그래도 MAX_ATTEMPTS 를 넘기면 죽은 job 으로 확정(done)해 자리를 비운다.
#       ③ enqueue 의 큐 길이 계산에서 좀비/노후 job 을 제외한다.
STALE_AFTER = float(os.environ.get("SEED_EXPLODE_STALE_AFTER", "1800"))   # 30분
MAX_ATTEMPTS = int(os.environ.get("SEED_EXPLODE_MAX_ATTEMPTS", "3"))
MAX_AGE = float(os.environ.get("SEED_EXPLODE_MAX_AGE", "86400"))          # 24시간


def _is_zombie(job: Dict, now: float) -> bool:
    """claim 된 채 STALE_AFTER 를 넘겼거나, 아예 MAX_AGE 를 넘긴 job."""
    if job.get("done_at"):
        return False
    if now - float(job.get("requested_at") or now) > MAX_AGE:
        return True
    ca = job.get("claimed_at")
    return bool(ca and now - float(ca) > STALE_AFTER)


def _reap(q: List[Dict], now: float) -> List[Dict]:
    """좀비 회수 — 재시도 여력이 있으면 미claim 으로 되돌리고, 없으면 done 처리."""
    for job in q:
        if not _is_zombie(job, now):
            continue
        att = int(job.get("attempts") or 0)
        aged = now - float(job.get("requested_at") or now) > MAX_AGE
        if aged or att >= MAX_ATTEMPTS:
            job["done_at"] = now
            job.setdefault("error", "stale_reaped" if not aged else "expired")
        else:
            job["claimed_at"] = None          # 다시 집어갈 수 있게
    # done 이 오래된 것은 청소
    return [j for j in q if not (j.get("done_at") and now - j["done_at"] > 3600)]


def _q_path() -> str:
    return os.path.join(_DATA_DIR, "_seed_explode_queue.json")


def _load() -> List[Dict]:
    try:
        with open(_q_path(), "r", encoding="utf-8") as f:
            q = json.load(f)
        return q if isinstance(q, list) else []
    except Exception:
        return []


def _save(q: List[Dict]) -> bool:
    """원자적 교체 — 워치독이 읽는 중에 반쪽 파일을 보지 않게."""
    try:
        os.makedirs(_DATA_DIR, exist_ok=True)
        tmp = _q_path() + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(q, f, ensure_ascii=False)
        os.replace(tmp, _q_path())
        return True
    except Exception as e:
        logger.warning(f"[seed-explode-q] 큐 기록 실패: {e}")
        return False


def enqueue(user_id: int, customer_id: int, seeds: List[str],
            min_volume: int, per_seed_cap: int, min_score: int) -> Dict:
    """실행요청을 디스크 큐에 남긴다. 워커 워치독이 집어간다."""
    now = time.time()
    # ⚠️ 좀비를 먼저 회수해야 한다 — 안 그러면 죽은 job 200개가 큐를 영구히 막는다.
    q = _reap(_load(), now)
    live = [j for j in q if not j.get("done_at")]
    if len(live) >= MAX_QUEUE:
        return {"queued": False, "reason": "queue_full", "queue_len": len(live)}
    job = {
        "id": f"{int(now*1000)}_{customer_id}",
        "user_id": int(user_id), "customer_id": int(customer_id),
        "seeds": list(seeds), "min_volume": int(min_volume),
        "per_seed_cap": int(per_seed_cap), "min_score": int(min_score),
        "requested_at": now,
        "requested_at_str": time.strftime("%Y-%m-%d %H:%M:%S"),
        "claimed_at": None, "done_at": None, "attempts": 0,
    }
    q.append(job)
    if not _save(q):
        return {"queued": False, "reason": "write_failed"}
    return {"queued": True, "job_id": job["id"], "queue_len": len(q),
            "seeds": len(seeds)}


def claim() -> Optional[Dict]:
    """미처리 job 하나를 원자적으로 claim. 없으면 None.

    ⚠️ 단일 워커 전제(현재 배포 구조). 여러 워커가 붙으면 파일락이 필요하다.
    ⚠️ 매번 좀비를 먼저 회수한다 — 워커가 죽어 claim 상태로 남은 job 을 되살리는
       유일한 경로다(워치독이 20초마다 부르므로 사실상 상시 회수기 역할을 한다).
    """
    now = time.time()
    q = _reap(_load(), now)
    picked = None
    for job in q:
        if not job.get("claimed_at") and not job.get("done_at"):
            job["claimed_at"] = now
            job["attempts"] = int(job.get("attempts") or 0) + 1
            picked = dict(job)
            break
    if not _save(q):
        return None
    return picked


def finish(job_id: str, added: Optional[int] = None, error: Optional[str] = None) -> None:
    """완료 표시 + 오래된 항목 청소(큐가 무한히 자라지 않게)."""
    q = _load()
    now = time.time()
    for job in q:
        if job.get("id") == job_id:
            job["done_at"] = now
            if added is not None:
                job["added"] = added
            if error:
                job["error"] = str(error)[:300]
            break
    q = [j for j in q if not (j.get("done_at") and now - j["done_at"] > 3600)]
    _save(q)


def status() -> Dict:
    """큐 관측. ⚠️ 이게 없어서 `queue_full` 의 원인을 코드로 역추적해야 했다(2026-08-04)."""
    now = time.time()
    q = _load()
    return {
        "queue_len": len(q),
        "max_queue": MAX_QUEUE,
        "pending": sum(1 for j in q if not j.get("claimed_at") and not j.get("done_at")),
        "running": sum(1 for j in q if j.get("claimed_at") and not j.get("done_at")),
        "zombie": sum(1 for j in q if _is_zombie(j, now)),
        "done": sum(1 for j in q if j.get("done_at")),
        "oldest_age_sec": int(now - min(
            (float(j.get("requested_at") or now) for j in q if not j.get("done_at")),
            default=now)),
        "recent_done": [
            {k: j.get(k) for k in ("id", "added", "error", "attempts", "requested_at_str")}
            for j in q if j.get("done_at")
        ][-5:],
    }


def reap_now() -> Dict:
    """좀비 즉시 회수(수동). 배포 없이 막힌 큐를 푸는 탈출구."""
    now = time.time()
    before = _load()
    n_zombie = sum(1 for j in before if _is_zombie(j, now))
    q = _reap(before, now)
    _save(q)
    return {"reaped": n_zombie, "queue_len": len(q),
            "live": sum(1 for j in q if not j.get("done_at"))}


def purge_all() -> Dict:
    """큐 전체 비우기 — 최후 수단. 대기 중이던 배치는 사라지므로 드라이버로 재발사해야 한다."""
    n = len(_load())
    _save([])
    return {"purged": n}


async def seed_explode_watchdog_loop():
    """워커 상주 루프 — 큐에서 하나씩 꺼내 실행한다.

    HTTP 로 worker 를 직접 부르는 경로는 신뢰할 수 없으므로(위 주석), **이게 worker 쪽
    유일한 실행 트리거다**. 한 번에 하나만 돌려 keywordstool 쿼터·이벤트루프를 보호한다.
    """
    import asyncio
    while True:
        try:
            await asyncio.sleep(WATCHDOG_EVERY)
            job = claim()
            if not job:
                continue
            from routers.naver_ad import _resolve_account, _run_seed_explode
            account = _resolve_account(job["user_id"], str(job["customer_id"]))
            if not account or not account.get("is_connected"):
                finish(job["id"], error="account_not_connected")
                logger.warning(f"[seed-explode-q] 계정 미연결로 skip: {job['id']}")
                continue
            logger.warning(f"[seed-explode-q] claim→실행 {job['id']} "
                           f"seeds={len(job['seeds'])} min_vol={job['min_volume']}")
            try:
                await _run_seed_explode(
                    job["user_id"], job["customer_id"], account, job["seeds"],
                    job["min_volume"], job["per_seed_cap"], job["min_score"])
                finish(job["id"])
                logger.warning(f"[seed-explode-q] 완료 {job['id']}")
            except Exception as e:
                finish(job["id"], error=str(e))
                logger.error(f"[seed-explode-q] 실행 실패 {job['id']}: {e}", exc_info=True)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"[seed-explode-q] 워치독 오류(계속): {e}")
