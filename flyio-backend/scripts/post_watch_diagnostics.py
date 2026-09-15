"""Run inside the deployed image: python scripts/post_watch_diagnostics.py [--run] [--sample 24]."""
import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from database import post_watch_db as db
from services import post_watch as pw


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--sample', type=int, default=0)
    args = parser.parse_args()
    db.init_post_watch_db()
    now = datetime.now(timezone.utc)
    result = {'utc': db._iso(now), 'kst': now.astimezone(db.KST).isoformat(),
              'enabled': os.getenv('POST_WATCH') == '1', 'runtime': db.runtime_status(),
              'summary': db.status_summary(), 'due_count': len(db.due_posts(now, 10000))}
    conn = db._connect()
    try:
        row = conn.execute("SELECT MIN(next_check_at) AS next_at FROM watched_posts WHERE status IN ('pending','delayed')").fetchone()
        result['next_check_at_utc'] = row['next_at']
        # Round-robin sample across registered blogs, including baseline posts.
        rows = [dict(r) for r in conn.execute('SELECT p.*, ROW_NUMBER() OVER (PARTITION BY blog_id ORDER BY published_at DESC) AS n FROM watched_posts p WHERE EXISTS (SELECT 1 FROM watched_blogs b WHERE b.blog_id=p.blog_id AND b.is_active=1) ORDER BY n, blog_id LIMIT ?', (max(0, min(args.sample, 100)),))]
    finally:
        conn.close()
    if args.run:
        result['requeued_legacy'] = db.repair_legacy_verdicts()
        result['cycle'] = await pw.check_due()
    print(json.dumps(result, ensure_ascii=False), flush=True)
    async with httpx.AsyncClient(timeout=15) as client:
        for post in rows:
            api = await pw.check_post_api(post['title'], post['blog_id'], post['log_no'], client)
            serp = await pw.check_post_indexed(post['title'], post['blog_id'], post['log_no'], client)
            print(json.dumps({'blog_id': post['blog_id'], 'log_no': post['log_no'],
                              'api': api, 'serp': serp, 'api_false_negative': api[0] is False and serp[0] is True}, ensure_ascii=False), flush=True)
            await asyncio.sleep(1)


if __name__ == '__main__':
    asyncio.run(main())
