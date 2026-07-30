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
    q = [j for j in _load() if not j.get("done_at")]
    if len(q) >= MAX_QUEUE:
        return {"queued": False, "reason": "queue_full", "queue_len": len(q)}
    job = {
        "id": f"{int(time.time()*1000)}_{customer_id}",
        "user_id": int(user_id), "customer_id": int(customer_id),
        "seeds": list(seeds), "min_volume": int(min_volume),
        "per_seed_cap": int(per_seed_cap), "min_score": int(min_score),
        "requested_at": time.time(),
        "requested_at_str": time.strftime("%Y-%m-%d %H:%M:%S"),
        "claimed_at": None, "done_at": None,
    }
    q.append(job)
    if not _save(q):
        return {"queued": False, "reason": "write_failed"}
    return {"queued": True, "job_id": job["id"], "queue_len": len(q),
            "seeds": len(seeds)}


def claim() -> Optional[Dict]:
    """미처리 job 하나를 원자적으로 claim. 없으면 None.

    ⚠️ 단일 워커 전제(현재 배포 구조). 여러 워커가 붙으면 파일락이 필요하다.
    """
    q = _load()
    for job in q:
        if not job.get("claimed_at") and not job.get("done_at"):
            job["claimed_at"] = time.time()
            if not _save(q):
                return None
            return dict(job)
    return None


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
    q = _load()
    return {
        "queue_len": len(q),
        "pending": sum(1 for j in q if not j.get("claimed_at") and not j.get("done_at")),
        "running": sum(1 for j in q if j.get("claimed_at") and not j.get("done_at")),
        "recent_done": [
            {k: j.get(k) for k in ("id", "added", "error", "requested_at_str")}
            for j in q if j.get("done_at")
        ][-5:],
    }


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
