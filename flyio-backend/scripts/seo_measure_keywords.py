# -*- coding: utf-8 -*-
"""지정한 키워드를 **먼저** 측정한다.

왜 필요한가: 크론은 큐를 검색량 순으로만 꺼낸다(take_pending). 그건 평소엔
옳지만, 특정 축의 가이드를 쓰려고 그 축 실측치가 필요할 때는 쓸 수 없다 —
파워링크 축은 수요 1위(월 299,125)인데 큐에서 차례가 오길 기다리면
10만 개 뒤에 선다.

이 스크립트는 큐 순서를 건드리지 않고(우선순위 컬럼 같은 스키마 변경 없이)
받은 키워드만 골라 같은 측정 경로를 태운다. 결과는 크론이 만든 것과
완전히 같은 행이 되고, 큐에서는 done 으로 빠진다.

⚠️ 1 CPU 머신이다. 키워드당 실측 155초이고 배치가 도는 동안 /health 가 밀린다.
그래서 크론 배치와 겹치지 않게, 한 번에 조금씩만 돌린다.

  python scripts/seo_measure_keywords.py --match 파워링크,검색광고 --limit 6
  python scripts/seo_measure_keywords.py --keywords 네이버검색광고,파워링크
"""
import argparse
import asyncio
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import seo_keyword_pages_db as seo_db
from services.seo_page_builder import PER_KEYWORD_TIMEOUT_S, YIELD_BETWEEN_S, _measure_one


def pick(match_tokens, limit):
    """큐의 pending 중 토큰이 들어간 것을 검색량 순으로 고른다."""
    conn = seo_db._connect()
    try:
        cur = conn.execute(
            "SELECT keyword, search_volume FROM seo_keyword_queue "
            "WHERE state = 'pending' AND search_volume IS NOT NULL "
            "ORDER BY search_volume DESC"
        )
        rows = cur.fetchall()
    finally:
        conn.close()
    out = []
    for r in rows:
        kw = r["keyword"]
        if any(t in kw for t in match_tokens):
            out.append((kw, r["search_volume"]))
            if len(out) >= limit:
                break
    return out


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--match", default="", help="쉼표로 구분한 토큰. 큐에서 이게 들어간 키워드를 고른다.")
    ap.add_argument("--keywords", default="", help="쉼표로 구분한 키워드를 그대로 측정한다.")
    ap.add_argument("--limit", type=int, default=6)
    args = ap.parse_args()

    seo_db.init_seo_pages_db()

    if args.keywords:
        targets = [(k.strip(), None) for k in args.keywords.split(",") if k.strip()]
    else:
        tokens = [t.strip() for t in args.match.split(",") if t.strip()]
        if not tokens:
            print("--match 또는 --keywords 가 필요하다")
            return
        targets = pick(tokens, args.limit)

    if not targets:
        print("대상 없음")
        return

    print(f"[대상 {len(targets)}개] " + ", ".join(f"{k}({v})" for k, v in targets), flush=True)

    ok = failed = 0
    t0 = time.time()
    for kw, _vol in targets:
        s = time.time()
        try:
            data = await asyncio.wait_for(_measure_one(kw), timeout=PER_KEYWORD_TIMEOUT_S)
            if not data:
                raise RuntimeError("no data")
            seo_db.upsert_page(data)
            seo_db.mark_queue(kw, "done")
            ok += 1
            print(
                f"  OK {kw} {round(time.time()-s)}s "
                f"난이도={data.get('difficulty_label')} 진입선={data.get('top10_min_score')}",
                flush=True,
            )
        except asyncio.TimeoutError:
            failed += 1
            seo_db.mark_queue(kw, "pending", "timeout")
            print(f"  TIMEOUT {kw}", flush=True)
        except Exception as e:
            failed += 1
            seo_db.mark_queue(kw, "pending", str(e))
            print(f"  FAIL {kw}: {str(e)[:120]}", flush=True)
        # 이벤트루프 양보 — 이게 없으면 도는 동안 서비스가 멈춘다
        await asyncio.sleep(YIELD_BETWEEN_S)

    print(
        "RESULT " + json.dumps(
            {"ok": ok, "failed": failed, "elapsed_s": round(time.time() - t0, 1),
             "published": seo_db.stats()["pages_published"]},
            ensure_ascii=False,
        ),
        flush=True,
    )


asyncio.run(main())
