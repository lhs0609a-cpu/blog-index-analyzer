"""
SERP 추적 — 정기 측정 스크립트 (cron용).

등록된 모든 활성 블로그를 순회하며 SERP 순위를 측정하고 rank_history에
스냅샷 저장. 시계열 데이터가 누적되면 lifecycle 분석 가능 (인덱싱 지연,
노출 유지일수, 누락율 등).

배경: B 검증(n=436)에서 단일 시점 SERP 순위가 ρ≈0.04로 noisy함을 확인.
시계열 기반 robust 메트릭이 더 신뢰 가능.

사용법:
  python measure_tracked_serps.py              # 모든 활성 블로그 측정
  python measure_tracked_serps.py --user 42    # 특정 사용자만
  python measure_tracked_serps.py --dry-run    # 측정 없이 대상만 출력

권장 cron 설정 (하루 1회):
  0 4 * * * cd /app && python scripts/measure_tracked_serps.py >> /var/log/serp.log 2>&1
"""
import argparse
import asyncio
import os
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_ROOT))

# Windows cp949 콘솔에서 한글 출력
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from database.rank_tracker_db import get_rank_tracker_db


async def list_active_blogs(user_id: Optional[int] = None) -> List[Dict]:
    """활성 추적 블로그 목록"""
    db = get_rank_tracker_db()
    with db.get_connection() as conn:
        cursor = conn.cursor()
        if user_id:
            cursor.execute("""
                SELECT id, user_id, blog_id, blog_name
                FROM tracked_blogs
                WHERE is_active = 1 AND user_id = ?
            """, (user_id,))
        else:
            cursor.execute("""
                SELECT id, user_id, blog_id, blog_name
                FROM tracked_blogs
                WHERE is_active = 1
            """)
        return [dict(r) for r in cursor.fetchall()]


async def measure_blog(tracked_blog_id: int, blog_id: str, user_id: int) -> Dict:
    """한 블로그의 모든 등록 키워드 SERP 측정"""
    from routers.rank_tracker import run_rank_check

    db = get_rank_tracker_db()
    task_id = f"cron-{uuid.uuid4().hex[:12]}"

    # check_task 생성
    db.create_check_task(task_id, user_id, tracked_blog_id)

    t0 = time.time()
    try:
        # 기존 백엔드 측정 함수 직접 호출
        await run_rank_check(
            task_id=task_id,
            tracked_blog_id=tracked_blog_id,
            blog_id=blog_id,
            max_posts=50,           # cron이므로 충분히 크게
            force_refresh=True,
        )
        return {
            "blog_id": blog_id,
            "task_id": task_id,
            "status": "ok",
            "elapsed_s": round(time.time() - t0, 1),
        }
    except Exception as e:
        return {
            "blog_id": blog_id,
            "task_id": task_id,
            "status": "error",
            "error": str(e)[:200],
            "elapsed_s": round(time.time() - t0, 1),
        }


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--user", type=int, help="특정 사용자만 측정", default=None)
    parser.add_argument("--dry-run", action="store_true", help="측정 없이 대상만 출력")
    parser.add_argument("--concurrency", type=int, default=2, help="동시 측정 블로그 수")
    args = parser.parse_args()

    blogs = await list_active_blogs(args.user)
    print(f"활성 추적 블로그: {len(blogs)}개")

    if args.dry_run:
        for b in blogs:
            print(f"  user={b['user_id']:>5}  blog={b['blog_id']:<25}  ({b.get('blog_name') or '-'})")
        return

    if not blogs:
        print("측정할 블로그가 없습니다.")
        return

    semaphore = asyncio.Semaphore(args.concurrency)

    async def run_one(b: Dict):
        async with semaphore:
            print(f"  ⏱ {b['blog_id']} 측정 시작...")
            r = await measure_blog(b["id"], b["blog_id"], b["user_id"])
            tag = "✅" if r["status"] == "ok" else "❌"
            print(f"  {tag} {r['blog_id']:<25} {r['elapsed_s']:>6}s  task={r['task_id']}")
            if r["status"] != "ok":
                print(f"     error: {r.get('error')}")
            return r

    t0 = time.time()
    results = await asyncio.gather(*[run_one(b) for b in blogs])

    ok = sum(1 for r in results if r["status"] == "ok")
    err = sum(1 for r in results if r["status"] != "ok")
    print()
    print(f"완료: 성공 {ok} / 실패 {err} / 총 {len(results)}, 소요 {time.time() - t0:.1f}s")
    print(f"실행 시각: {datetime.now().isoformat(timespec='seconds')}")


if __name__ == "__main__":
    asyncio.run(main())
