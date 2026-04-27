"""
키워드 풀 워커 — 24시간 자동 키워드 수집·등록 cron 진입점.

서브커맨드:
  collect : keywordstool로 새 키워드 수집해 풀에 추가
  register: 풀의 pending 키워드를 네이버 광고에 batch 등록
  status  : 사용자별 풀 상태 출력

실행 예:
  python keyword_pool_worker.py collect --user 1 --max-new 5000 --min-volume 30
  python keyword_pool_worker.py register --user 1 --batch 1000 --bid 100
  python keyword_pool_worker.py status --user 1

cron 권장:
  */15 * * * *  python keyword_pool_worker.py collect --user 1
  */5  * * * *  python keyword_pool_worker.py register --user 1
"""
import argparse
import asyncio
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_ROOT))

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from database.keyword_pool_db import get_keyword_pool_db
from database.registered_keywords_db import get_registered_keywords_db
from database.naver_ad_db import get_ad_account


# ─────────────────────────────────────────
# 수집 워커
# ─────────────────────────────────────────
async def cmd_collect(args):
    """keywordstool로 연관 키워드 BFS 확장해 풀에 추가."""
    from services.naver_ad_service import NaverAdApiClient

    account = get_ad_account(args.user)
    if not account or not account.get("is_connected"):
        print(f"[collect] 사용자 {args.user} 광고 계정 미연결")
        return

    customer_id = int(account.get("customer_id"))
    pool = get_keyword_pool_db()
    reg = get_registered_keywords_db()

    # 현재 풀 + 등록 합산이 한도(10만) 근처면 수집 정지
    pool_stats = pool.stats(customer_id)
    pool_pending = (pool_stats.get("by_status") or {}).get("pending", 0)
    reg_stats = reg.stats(customer_id) or {}
    active_registered = int(reg_stats.get("active") or 0)

    HARD_CAP = 100_000
    headroom = HARD_CAP - active_registered - pool_pending
    if headroom <= 0:
        print(
            f"[collect] 사용자 {args.user} 한도 도달 — 등록 {active_registered:,} + "
            f"pending {pool_pending:,} ≥ {HARD_CAP:,}. 수집 skip."
        )
        return
    target = min(args.max_new, headroom)
    print(f"[collect] 사용자 {args.user} 목표 {target:,}개 (headroom {headroom:,})")

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    # 시드: 최근 사용된 seed에서 골라 새 BFS 라운드. 비어있으면 args.seeds 사용.
    seeds = pool.get_recent_seeds(customer_id, limit=20) or (args.seeds or [])
    if not seeds:
        print("[collect] 시드 없음 — --seeds로 초기 시드 제공 필요")
        return

    added = 0
    api_calls = 0
    for seed in seeds:
        if added >= target:
            break
        if api_calls >= args.max_calls:
            print(f"[collect] API 호출 한도 {args.max_calls} 도달")
            break
        try:
            related = await client.get_related_keywords(seed, show_detail=True)
            api_calls += 1
        except Exception as e:
            print(f"  [{seed}] API 실패: {e}")
            continue

        items = related.get("keywordList", []) if isinstance(related, dict) else []
        candidates = []
        for item in items:
            kw = (item.get("relKeyword") or "").strip()
            if not kw:
                continue
            mt = int(item.get("monthlyPcQcCnt") or 0) + int(item.get("monthlyMobileQcCnt") or 0)
            if mt < args.min_volume:
                continue
            candidates.append({
                "keyword": kw,
                "monthly_total": mt,
                "monthly_pc": int(item.get("monthlyPcQcCnt") or 0),
                "monthly_mobile": int(item.get("monthlyMobileQcCnt") or 0),
                "comp_idx": item.get("compIdx"),
                "seed": seed,
                "source": "keywordstool",
            })

        n = pool.add_candidates(args.user, customer_id, candidates)
        added += n
        print(f"  [{seed}] +{n}개 (누적 {added}/{target})")

        # rate limit 안전 간격
        await asyncio.sleep(0.4)

    print(f"[collect] 완료 — 새로 추가 {added}개, API {api_calls}회 호출")


# ─────────────────────────────────────────
# 등록 워커
# ─────────────────────────────────────────
async def cmd_register(args):
    """풀의 pending → 네이버 광고에 batch 등록."""
    from services.bulk_upload_orchestrator import BulkUploadOrchestrator, BulkJobConfig
    from services.naver_ad_service import NaverAdApiClient
    from database.naver_ad_db import create_bulk_upload_job

    account = get_ad_account(args.user)
    if not account or not account.get("is_connected"):
        print(f"[register] 사용자 {args.user} 광고 계정 미연결")
        return

    customer_id = int(account.get("customer_id"))
    pool = get_keyword_pool_db()
    pending = pool.claim_pending(customer_id, limit=args.batch, min_volume=args.min_volume)
    if not pending:
        print(f"[register] 사용자 {args.user} pending 없음")
        return

    print(f"[register] 사용자 {args.user} {len(pending)}개 등록 시도")
    keywords = [p["keyword"] for p in pending]

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    register_job_id = create_bulk_upload_job(
        user_id=args.user,
        filename=f"pool_auto_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
        campaign_prefix=args.prefix,
        keywords_per_group=1000,
        bid=args.bid,
        daily_budget=args.daily_budget,
        total_keywords=len(keywords),
    )

    cfg = BulkJobConfig(
        job_id=register_job_id, user_id=args.user,
        campaign_prefix=args.prefix,
        keywords_per_group=1000,
        bid=args.bid,
        daily_budget=args.daily_budget,
        campaign_tp="WEB_SITE",
    )
    orchestrator = BulkUploadOrchestrator(client)
    result = await orchestrator.run(cfg, keywords)

    # orchestrator가 dedup 처리하므로 등록 성공 키워드는 registered_keywords DB에 들어가있음.
    # 풀에서도 status 갱신 — 등록된 keyword 만 registered, 나머지는 failed
    if result.get("success"):
        kw_ids = [p["id"] for p in pending]
        # registered_keywords DB에 들어간 키워드만 success
        reg = get_registered_keywords_db()
        existing = reg.get_existing_set(customer_id, keywords)
        succeeded_ids = [p["id"] for p in pending if p["keyword"] in existing]
        failed_ids = [p["id"] for p in pending if p["keyword"] not in existing]
        pool.mark_status(succeeded_ids, "registered")
        pool.mark_status(failed_ids, "failed", error_message="orchestrator did not register")
        print(f"[register] 완료 — registered {len(succeeded_ids)}, failed {len(failed_ids)}")
    else:
        print(f"[register] 작업 실패: {result.get('error')}")
        pool.mark_status([p["id"] for p in pending], "failed",
                         error_message=str(result.get("error"))[:300])


# ─────────────────────────────────────────
# 상태
# ─────────────────────────────────────────
def cmd_status(args):
    from database.naver_ad_db import get_ad_account

    account = get_ad_account(args.user)
    if not account:
        print(f"[status] 사용자 {args.user} 광고 계정 없음")
        return
    customer_id = int(account.get("customer_id"))
    pool = get_keyword_pool_db()
    reg = get_registered_keywords_db()

    p_stats = pool.stats(customer_id)
    r_stats = reg.stats(customer_id) or {}

    print(f"━━━ 사용자 {args.user} (customer_id={customer_id}) ━━━")
    print(f"풀 상태:")
    for status, n in (p_stats.get("by_status") or {}).items():
        print(f"  {status:<12} {n:>8,}")
    print(f"  최초 발견: {p_stats.get('first_discovered')}")
    print(f"  최근 발견: {p_stats.get('last_discovered')}")
    print()
    print(f"등록 키워드 (네이버):")
    print(f"  total: {r_stats.get('total', 0):,}")
    print(f"  active: {r_stats.get('active', 0):,}")
    print(f"  ad_groups: {r_stats.get('ad_groups', 0)}")
    print(f"  campaigns: {r_stats.get('campaigns', 0)}")
    cap = 100_000
    used = int(r_stats.get('active') or 0)
    print(f"  잔여 가용 (10만 한도): {cap - used:,}")


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    c1 = sub.add_parser("collect")
    c1.add_argument("--user", type=int, required=True)
    c1.add_argument("--max-new", type=int, default=5000)
    c1.add_argument("--max-calls", type=int, default=200)
    c1.add_argument("--min-volume", type=int, default=30)
    c1.add_argument("--seeds", nargs="*")

    c2 = sub.add_parser("register")
    c2.add_argument("--user", type=int, required=True)
    c2.add_argument("--batch", type=int, default=1000)
    c2.add_argument("--min-volume", type=int, default=30)
    c2.add_argument("--bid", type=int, default=100)
    c2.add_argument("--daily-budget", type=int, default=10000)
    c2.add_argument("--prefix", type=str, default="auto")

    c3 = sub.add_parser("status")
    c3.add_argument("--user", type=int, required=True)

    args = p.parse_args()

    if args.cmd == "collect":
        asyncio.run(cmd_collect(args))
    elif args.cmd == "register":
        asyncio.run(cmd_register(args))
    elif args.cmd == "status":
        cmd_status(args)


if __name__ == "__main__":
    main()
