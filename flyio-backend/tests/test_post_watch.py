# -*- coding: utf-8 -*-
"""
새 글 누락 감시 판정 테스트 — docs/POST_EXPOSURE_WATCH_SPEC.md.

누락 오탐이 제일 큰 신뢰 손실이다. 여기 있는 건 오탐으로 이어지는 길목들이다.

실행: python flyio-backend/tests/test_post_watch.py
"""
import asyncio
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
os.environ["POST_WATCH_DB_PATH"] = os.path.join(tempfile.mkdtemp(), "post_watch_test.db")

from database import post_watch_db as db  # noqa: E402
from services import post_watch as pw  # noqa: E402

failures = []


def check(name, cond, detail=''):
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f'  — {detail}' if detail else ''))
    if not cond:
        failures.append(name)


H = timedelta(hours=1)
PUB = datetime(2026, 9, 10, 9, 0, tzinfo=timezone.utc)

print("\n[logNo 추출]")
check("RSS 링크", pw.extract_log_no("https://blog.naver.com/abc_1/223456789012?fromRss=true&trackingCode=rss", "abc_1") == "223456789012")
check("모바일 링크", pw.extract_log_no("https://m.blog.naver.com/abc_1/223456789012", "abc_1") == "223456789012")
check("PostView 쿼리형", pw.extract_log_no("https://blog.naver.com/PostView.naver?blogId=abc_1&logNo=2234", "abc_1") == "2234")
check("대소문자 다른 블로그 ID 는 같은 블로그", pw.extract_log_no("https://blog.naver.com/ABC_1/99", "abc_1") == "99")
check("다른 블로그의 글은 None", pw.extract_log_no("https://blog.naver.com/other/223456789012", "abc_1") is None)
check("쿼리형 다른 블로그 None", pw.extract_log_no("https://blog.naver.com/PostView.naver?blogId=other&logNo=2234", "abc_1") is None)
check("빈 URL", pw.extract_log_no("", "abc_1") is None)

print("\n[검색 결과 매칭 — 글 단위]")
items = [
    {"link": "https://blog.naver.com/abc_1/111"},   # 같은 블로그의 옛 글 (제목 비슷)
    {"link": "https://blog.naver.com/other/222"},
    {"link": "https://blog.naver.com/abc_1/333"},
]
check("같은 블로그 옛 글은 찾은 것으로 치지 않는다", pw.find_post_rank(items, "abc_1", "999") is None)
check("그 글이면 순위", pw.find_post_rank(items, "abc_1", "333") == 3)

print("\n[첫 확인 시점]")
s, n = pw.first_check_at(PUB, PUB + 10 * 60 * timedelta(seconds=1))
check("게시 10분 뒤 발견 → 1시간 시점", s == "pending" and n == PUB + H, f"{s} {n}")
s, n = pw.first_check_at(PUB, PUB + 3 * H)
check("게시 3시간 뒤 발견 → 6시간 시점", s == "pending" and n == PUB + 6 * H)
s, n = pw.first_check_at(PUB, PUB + 30 * H)
check("게시 30시간 뒤 발견 → 72시간 시점", s == "pending" and n == PUB + 72 * H)
s, n = pw.first_check_at(PUB, PUB + 73 * H)
check("72시간 지난 글은 baseline", s == "baseline" and n is None)

print("\n[상태 전이]")
post = {"checks_done": 0, "fail_count": 0}
u = pw.transition(post, PUB, PUB + H, True, 4)
check("찾으면 indexed, 확인 종료", u["status"] == "indexed" and u["next_check_at"] is None and u["first_rank"] == 4)
u = pw.transition(post, PUB, PUB + H, False, None)
check("1시간에 못 찾으면 pending, 6시간 시점", u["status"] == "pending" and u["next_check_at"] == PUB + 6 * H)
u = pw.transition(post, PUB, PUB + 24 * H, False, None)
check("24시간에 못 찾으면 delayed, 72시간 시점", u["status"] == "delayed" and u["next_check_at"] == PUB + 72 * H)
u = pw.transition(post, PUB, PUB + 72 * H, False, None)
check("72시간 미발견은 누락 확정 불가", u["status"] == "unmeasurable" and u["next_check_at"] is None)
u = pw.transition({"fail_count": 0}, PUB, PUB + 72 * H, None, None)
check("API 오류는 누락으로 세지 않는다", "status" not in u and u["next_check_at"] == PUB + 72 * H + pw.RETRY_AFTER)
u = pw.transition({"fail_count": 2}, PUB, PUB + 72 * H, None, None)
check("오류 3회 연속이면 unmeasurable", u["status"] == "unmeasurable")
u = pw.transition({"fail_count": 2, "checks_done": 1}, PUB, PUB + 6 * H, False, None)
check("정상 확인되면 오류 카운터 초기화", u["fail_count"] == 0)

print("\n[RSS 순회 — 가짜 RSS]")
db.init_post_watch_db()
db.add_watch(1, "abc_1")
db.add_watch(2, "abc_1")
check("두 사용자가 같은 블로그 → RSS 대상 1개", db.list_active_blog_ids() == ["abc_1"])

NOW = PUB + 2 * H
FEED = [
    {"title": "새 글 제목 충분히 긴 것", "link": "https://blog.naver.com/abc_1/300?fromRss=true", "pubDate": PUB},
    {"title": "짧음", "link": "https://blog.naver.com/abc_1/299", "pubDate": PUB - H},
    {"title": "옛날 글 제목입니다요", "link": "https://blog.naver.com/abc_1/200", "pubDate": PUB - 100 * H},
]


async def fake_rss(blog_id):
    return list(FEED)

import routers.content_lifespan as cl  # noqa: E402
cl.fetch_blog_posts_via_rss = fake_rss

r = asyncio.run(pw.poll_blog("abc_1", now=NOW))
posts = {p["log_no"]: p for p in db.posts_for_blog("abc_1")}
check("새 글 1개만 감시 대상", r["new"] == 1, str(r))
check("새 글 pending, 6시간 시점", posts["300"]["status"] == "pending" and posts["300"]["next_check_at"] == "2026-09-10T15:00:00Z")
check("짧은 제목은 unmeasurable", posts["299"]["status"] == "unmeasurable")
check("옛 글은 baseline (목록에서 숨김)", "200" not in posts and "200" in db.known_log_nos("abc_1"))
r = asyncio.run(pw.poll_blog("abc_1", now=NOW))
check("두 번 돌려도 중복 없음", r["new"] == 0)

FEED.pop(0)  # 새 글이 피드에서 사라짐 (피드의 가장 오래된 글보다 새 글)
r = asyncio.run(pw.poll_blog("abc_1", now=NOW))
check("RSS에서 빠져도 삭제 확정 금지", r["removed"] == 0 and db.posts_for_blog("abc_1")[0]["status"] == "pending", str(r))

print("\n[예산]")
before = db.budget_used_today()
db.budget_add(3)
check("예산 누적", db.budget_used_today() == before + 3)

print()
if failures:
    print(f"FAILED {len(failures)}: {failures}")
    sys.exit(1)
print("ALL PASS")
