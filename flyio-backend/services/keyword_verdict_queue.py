"""
키워드 판정 STAGE 2 실행 큐 (app → worker)
==========================================

왜 큐인가:
  STAGE 2 는 블로그 11개 채점(HTTP 수십 회 + HTML 파싱)이다. 이걸 public API
  프로세스(:8000)에서 돌리면 이벤트루프/GIL 을 점유해 로그인·/health 까지 밀린다 —
  '1위 가능 키워드'가 정확히 그렇게 전 서비스를 마비시켰다(2026-08-05).

왜 HTTP 오프로드가 아니라 파일 큐인가:
  app→worker HTTP 프록시(`_WORKER_OFFLOAD_PATHS`)는 8s ReadTimeout 후 httpx 를 닫아
  **worker 요청이 끊겨 핸들러가 아예 안 도는** 함정이 있다(2026-07-30 실측).
  seed-explode·ceiling-backtest 가 같은 이유로 파일 큐로 옮겼고 이 모듈도 그 패턴이다.

구조 (같은 머신 2프로세스, /data 공유):
  app(:8000)   — enqueue(job 파일 쓰기) / get_job(결과 파일 읽기). 무거운 일 안 함.
  worker(:8001, nice 19) — 2초 워치독이 집어 실행 → 결과를 같은 파일에 기록.

좀비 처리: claim 된 채 STALE_AFTER 를 넘기면 재실행 대상으로 되돌리고,
MAX_ATTEMPTS 를 넘기면 error 로 확정한다(재배포·OOM 로 죽은 job 이 영원히 pending
으로 남지 않게 — seed-explode 에서 실제로 겪은 결함).
"""

import asyncio
import json
import logging
import os
import time
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

_DATA_DIR = os.environ.get("DATA_DIR", "/data")
_JOB_DIR = os.path.join(_DATA_DIR, "_kwverdict_jobs")

WATCHDOG_EVERY = float(os.environ.get("KWV_WATCHDOG_EVERY", "2"))
# SERP 조회. 프로덕션 worker 는 브라우저를 띄워야 하고(HTTP 는 Fly IP 에서 빈 페이지),
# 크론과 CPU 를 나눠 쓰므로 90초로는 모자랐다(2026-08-13 timeout_at_serp 실측).
STAGE1_TIMEOUT = float(os.environ.get("KWV_STAGE1_TIMEOUT", "210"))
# 프로덕션 실측(2026-08-13): 캐시 없는 첫 조회가 249초(worker 는 nice 19 + 공유 2vCPU).
# 캐시가 도는 두 번째 조회부터는 수 초. 첫 조회를 자르면 아무 결과도 못 주므로 넉넉히 둔다.
STAGE2_TIMEOUT = float(os.environ.get("KWV_STAGE2_TIMEOUT", "330"))   # 경쟁자 채점
# 좀비 판정은 두 단계 타임아웃 합보다 넉넉해야 한다 — 정상 job 을 회수하면 무한 재시도가 된다.
STALE_AFTER = float(os.environ.get("KWV_STALE_AFTER", "540"))     # 9분
MAX_ATTEMPTS = int(os.environ.get("KWV_MAX_ATTEMPTS", "2"))
KEEP_DONE = float(os.environ.get("KWV_KEEP_DONE", "3600"))        # 완료 job 보관 1시간
MAX_PENDING = int(os.environ.get("KWV_MAX_PENDING", "40"))
DEDUPE_WINDOW = 90.0   # 같은 (블로그,키워드) 요청이 이 안에 또 오면 기존 job 재사용


def _path(job_id: str) -> str:
    return os.path.join(_JOB_DIR, f"{job_id}.json")


def _read(job_id: str) -> Optional[Dict]:
    try:
        with open(_path(job_id), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _write(job: Dict) -> bool:
    """원자적 교체 — 워치독이 반쪽 파일을 읽지 않게."""
    try:
        os.makedirs(_JOB_DIR, exist_ok=True)
        tmp = _path(job["job_id"]) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(job, f, ensure_ascii=False)
        os.replace(tmp, _path(job["job_id"]))
        return True
    except Exception as e:
        logger.warning(f"[kwv-q] job write failed: {e}")
        return False


def _all_jobs() -> List[Dict]:
    out = []
    try:
        for name in os.listdir(_JOB_DIR):
            if not name.endswith(".json"):
                continue
            j = _read(name[:-5])
            if j:
                out.append(j)
    except FileNotFoundError:
        pass
    except Exception as e:
        logger.debug(f"[kwv-q] listdir failed: {e}")
    return out


def _sweep(jobs: List[Dict], now: float) -> None:
    """좀비 회수 + 완료 job 청소."""
    for j in jobs:
        if j.get("status") == "running" and now - float(j.get("claimed_at") or now) > STALE_AFTER:
            if int(j.get("attempts") or 0) >= MAX_ATTEMPTS:
                j.update(status="error", error="stale_reaped", done_at=now)
            else:
                j.update(status="queued", claimed_at=None)
            _write(j)
        elif j.get("status") in ("done", "error") and now - float(j.get("done_at") or now) > KEEP_DONE:
            try:
                os.remove(_path(j["job_id"]))
            except Exception:
                pass


def enqueue(blog_id: str, keyword: str, user_id: Optional[int] = None) -> Dict:
    """STAGE 2 실행요청을 큐에 남긴다. 워커 워치독이 2초 내 집어간다."""
    now = time.time()
    jobs = _all_jobs()
    _sweep(jobs, now)

    # 같은 요청이 방금 들어왔으면 재사용 (새로고침·중복 클릭 방어)
    for j in jobs:
        if (j.get("blog_id") == blog_id and j.get("keyword") == keyword
                and j.get("status") in ("queued", "running")
                and now - float(j.get("requested_at") or 0) < DEDUPE_WINDOW):
            return {"queued": True, "job_id": j["job_id"], "reused": True,
                    "status": j["status"]}

    pending = [j for j in jobs if j.get("status") in ("queued", "running")]
    if len(pending) >= MAX_PENDING:
        return {"queued": False, "reason": "queue_full", "queue_len": len(pending)}

    job = {
        "job_id": f"{int(now * 1000)}_{abs(hash((blog_id, keyword))) % 100000}",
        "blog_id": blog_id, "keyword": keyword, "user_id": user_id,
        "status": "queued", "requested_at": now, "claimed_at": None,
        "done_at": None, "attempts": 0, "result": None, "error": None,
    }
    if not _write(job):
        return {"queued": False, "reason": "write_failed"}
    return {"queued": True, "job_id": job["job_id"], "reused": False,
            "status": "queued", "queue_len": len(pending) + 1}


def has_pending() -> bool:
    """아직 워치독이 집지 않은 사용자 job 이 있는가 (우선순위 게이트 probe).

    STALE_AFTER 를 넘긴 것은 세지 않는다 — 워커가 죽어 남은 좀비 job 이 크론을 영구히
    굶기면 안 된다(그 좀비는 _sweep 이 따로 회수한다).
    """
    now = time.time()
    return any(j.get("status") == "queued"
               and now - float(j.get("requested_at") or 0) < STALE_AFTER
               for j in _all_jobs())


def get_job(job_id: str) -> Optional[Dict]:
    return _read(job_id)


def claim() -> Optional[Dict]:
    """가장 오래된 queued job 을 claim. 단일 워커 전제(현재 배포 구조)."""
    now = time.time()
    jobs = _all_jobs()
    _sweep(jobs, now)
    queued = sorted([j for j in jobs if j.get("status") == "queued"],
                    key=lambda x: x.get("requested_at") or 0)
    if not queued:
        return None
    job = queued[0]
    job.update(status="running", claimed_at=now,
               attempts=int(job.get("attempts") or 0) + 1)
    if not _write(job):
        return None
    return job


async def run_job(job: Dict) -> None:
    """STAGE 1 → (중간 발행) → STAGE 2 실행 후 결과를 job 파일에 기록.

    사실(stage1)을 먼저 job 파일에 실어 두는 이유: 프로덕션에서는 SERP 조회조차
    브라우저 경로라 API 프로세스에서 못 돈다. 그래서 두 단계 모두 워커에서 돌리되,
    사실이 나오는 즉시 발행해 화면이 먼저 채워지게 한다(2단 응답 유지).

    실행하는 동안 우선순위 게이트를 잡는다 — 같은 worker 의 키워드 풀 크론이 CPU 를
    점유하면 여기 타임아웃이 전부 4~6배로 늘어나 판정이 통째로 실패한다(2026-08-13 실측).
    """
    from services.priority_gate import with_user_job

    with with_user_job(f"kwv:{job['job_id']}"):
        await _run_job(job)


async def _run_job(job: Dict) -> None:
    from services.keyword_verdict import stage1_facts, stage2_deep

    job_id = job["job_id"]

    def _phase(name: str) -> None:
        """어디까지 갔는지 job 에 남긴다 — 안 남기면 '멈췄다'만 보이고 원인을 못 잡는다."""
        cur = _read(job_id) or job
        cur["phase"] = name
        _write(cur)
        _beat(f"{name}:{job_id}")

    try:
        _phase("serp")
        # 단계별 하드 타임아웃. 사용자가 기다리는 job 이 무한정 매달리면 안 되고,
        # 어느 단계에서 죽었는지가 그대로 에러 메시지가 돼야 진단이 된다.
        facts = await asyncio.wait_for(
            stage1_facts(job["blog_id"], job["keyword"]), timeout=STAGE1_TIMEOUT)
        cur = _read(job_id) or job
        cur["facts"] = facts
        cur["phase"] = "scoring"
        _write(cur)
        _beat(f"scoring:{job_id}")

        result = await asyncio.wait_for(
            stage2_deep(job["blog_id"], job["keyword"], facts=facts),
            timeout=STAGE2_TIMEOUT)
        cur = _read(job_id) or job
        cur.update(status="done", done_at=time.time(), result=result, error=None)
        _write(cur)
        logger.info(f"[kwv-q] done {job_id} {job['blog_id']}/{job['keyword']!r} "
                    f"→ {result.get('verdict')} p={result.get('probability')} "
                    f"({result.get('elapsed')}s)")
        _record_prediction(result)
    except asyncio.TimeoutError:
        cur = _read(job_id) or job
        phase = cur.get("phase") or "?"
        logger.warning(f"[kwv-q] job timeout {job_id} at phase={phase}")
        cur.update(status="error", done_at=time.time(),
                   error=f"timeout_at_{phase}")
        _write(cur)
    except Exception as e:
        logger.exception(f"[kwv-q] job failed {job_id}: {e}")
        cur = _read(job_id) or job
        cur.update(status="error", done_at=time.time(),
                   error=f"{type(e).__name__}: {e}")
        _write(cur)


def _record_prediction(result: Dict) -> None:
    """판정을 정답지 원장에 기록 — 나중에 실측 순위로 채점된다(calibration).

    확률이 없는 판정(unknown/already_ranked)은 기록하지 않는다. 채점 대상이 아닌 것을
    원장에 넣으면 정확도 수치가 오염된다.
    """
    if not result.get("ok") or result.get("probability") is None:
        return
    if result.get("verdict") in ("unknown", "already_ranked"):
        return
    try:
        from database.rank_tracker_db import get_rank_tracker_db
        facts = result.get("facts") or {}
        get_rank_tracker_db().add_keyword_prediction(
            blog_id=result["blog_id"],
            keyword=result["keyword"],
            target_volume=facts.get("volume") or 0,
            predicted_verdict=result["verdict"],
            ceiling_volume=(result.get("ceiling") or {}).get("ceiling_volume"),
            ceiling_p50=(result.get("ceiling") or {}).get("ceiling_p50"),
            serp_difficulty_label=None,
            confidence=result.get("confidence"),
            predicted_prob=result.get("probability"),
        )
    except Exception as e:
        logger.warning(f"[kwv-q] prediction ledger write failed: {e}")


def _hb_path() -> str:
    return os.path.join(_JOB_DIR, "_heartbeat.json")


def _beat(state: str) -> None:
    """워치독 생존 신호. **워커 이벤트루프가 크론에 수분씩 막히는 게 이 코드베이스의
    고질병**이라(문서화된 실측), '워치독이 안 도는 것'과 '큐 경로가 틀린 것'을 구분할
    수단이 없으면 진단이 불가능하다. 틱마다 파일 하나를 갱신해 app 이 읽게 한다."""
    try:
        os.makedirs(_JOB_DIR, exist_ok=True)
        tmp = _hb_path() + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"ts": time.time(), "pid": os.getpid(), "state": state}, f)
        os.replace(tmp, _hb_path())
    except Exception:
        pass


def read_heartbeat() -> Optional[Dict]:
    try:
        with open(_hb_path(), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


async def watchdog_loop() -> None:
    """worker 프로세스에서만 기동 (main.py lifespan, RUN_SCHEDULERS)."""
    logger.warning(f"[kwv-q] watchdog started (every {WATCHDOG_EVERY}s) pid={os.getpid()}")
    # 집기 전 대기 구간도 크론이 양보하게 한다 — 실측에서 2초 틱이 87초 만에 집었다.
    try:
        from services.priority_gate import register_probe
        register_probe(has_pending)
    except Exception as e:
        logger.warning(f"[kwv-q] priority probe 등록 실패: {e}")
    _beat("started")
    while True:
        try:
            job = claim()
            if job:
                _beat(f"running:{job['job_id']}")
                await run_job(job)
                _beat("idle")
                continue  # 큐가 밀렸으면 즉시 다음 job
            _beat("idle")
        except Exception as e:
            logger.warning(f"[kwv-q] watchdog tick failed: {e}")
        await asyncio.sleep(WATCHDOG_EVERY)
