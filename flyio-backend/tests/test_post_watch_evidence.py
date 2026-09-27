"""Regression tests for false missing verdicts and shared-worker safety."""
import asyncio
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import httpx
from database import post_watch_db as db
from services import post_watch as pw


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = patch.object(db, 'POST_WATCH_DB_PATH', os.path.join(self.tmp.name, 'test.db'))
        self.path.start()
        db.init_post_watch_db()

    def tearDown(self):
        self.path.stop()
        self.tmp.cleanup()

    def test_only_result_links(self):
        html = '''<script>https://blog.naver.com/abc/123</script>
        <a href="https://blog.naver.com/abc/123">outside</a>
        <div id="main_pack"><a href="https://blog.naver.com/abc/999">old</a></div>'''
        self.assertIsNone(pw.find_post_rank(pw.search_result_links(html), 'abc', '123'))
        self.assertIsNone(pw.extract_log_no('https://evil.test/blog.naver.com/abc/123', 'abc'))
        self.assertIsNone(pw.extract_log_no('https://evil.test/?blogId=abc&logNo=123', 'abc'))

    def test_api_miss_serp_hit_and_failures(self):
        async def run(html, status=200):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(status, text=html))) as client:
                return await pw.check_post_indexed('a sufficiently long title', 'abc', '123', client)
        hit = '<div id="main_pack"><a href="https://blog.naver.com/abc/123">post title</a></div>'
        self.assertEqual(asyncio.run(run(hit)), (True, None, None))
        for html, code in [('<html>captcha</html>', 200), ('error', 429), ('<div id="main_pack"></div>', 200)]:
            self.assertIsNone(asyncio.run(run(html, code))[0])

    def test_lease_and_migration_idempotency(self):
        owner = db.acquire_check_lease()
        self.assertIsNotNone(owner)
        self.assertIsNone(db.acquire_check_lease())
        db.release_check_lease('wrong-owner')
        self.assertIsNone(db.acquire_check_lease())
        db.release_check_lease(owner)
        self.assertIsNotNone(db.acquire_check_lease())
        now = datetime.now(timezone.utc)
        db.insert_post('abc', '123', 'old false missing', 'https://blog.naver.com/abc/123', now, 'missing', None)
        self.assertEqual(db.repair_legacy_verdicts(), 1)
        self.assertEqual(db.repair_legacy_verdicts(), 0)
        self.assertIn('serp_v2_migration', db.runtime_status())
        self.assertEqual(db.posts_for_blog('abc')[0]['status'], 'pending')
        self.assertEqual(db.due_posts(now + timedelta(seconds=1)), [])
        db.add_watch(1, 'abc')
        self.assertEqual(len(db.due_posts(now + timedelta(seconds=1))), 1)

    def test_kst_is_utc_not_a_nine_hour_delay(self):
        pub = datetime(2026, 9, 14, 7, 33, tzinfo=db.KST)
        self.assertEqual(db._iso(pub), '2026-09-13T22:33:00Z')
        status, due = pw.first_check_at(pub, pub + timedelta(minutes=57))
        self.assertEqual(status, 'pending')
        self.assertEqual(db._iso(due), '2026-09-13T23:33:00Z')


if __name__ == '__main__':
    unittest.main()
