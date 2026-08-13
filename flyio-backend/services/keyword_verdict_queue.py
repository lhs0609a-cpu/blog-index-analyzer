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
STALE_AFTER = float(os.environ.get("KWV_STALE_AFTER", "180"))     # 3분
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
    """STAGE 2 실행 후 결과를 job 파일에 기록. 예외는 error 로 남긴다."""
    from services.keyword_verdict import stage2_deep

    job_id = job["job_id"]
    try:
        result = await stage2_deep(job["blog_id"], job["keyword"])
        cur = _read(job_id) or job
        cur.update(status="done", done_at=time.time(), result=result, error=None)
        _write(cur)
        logger.info(f"[kwv-q] done {job_id} {job['blog_id']}/{job['keyword']!r} "
                    f"→ {result.get('verdict')} p={result.get('probability')} "
                    f"({result.get('elapsed')}s)")
        _record_prediction(result)
    except Exception as e:
        logger.exception(f"[kwv-q] job failed {job_id}: {e}")
        cur = _read(job_id) or job
        cur.update(status="error", done_at=time.time(), error=str(e))
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


async def watchdog_loop() -> None:
    """worker 프로세스에서만 기동 (main.py lifespan, RUN_SCHEDULERS)."""
    logger.info(f"[kwv-q] watchdog started (every {WATCHDOG_EVERY}s)")
    while True:
        try:
            job = claim()
            if job:
                await run_job(job)
                continue  # 큐가 밀렸으면 즉시 다음 job
        except Exception as e:
            logger.warning(f"[kwv-q] watchdog tick failed: {e}")
        await asyncio.sleep(WATCHDOG_EVERY)
