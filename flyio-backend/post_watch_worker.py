"""Dedicated, lightweight post watch process; independent of CPU-heavy cron tasks."""
import asyncio
import logging
import os
import sys

logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                    format='%(asctime)s %(name)s %(levelname)s %(message)s')


async def main():
    from database import post_watch_db as db
    from services.post_watch_scheduler import post_watch_scheduler, is_enabled
    if not is_enabled():
        logging.warning('[post-watch] dedicated worker disabled')
        return
    db.init_post_watch_db()
    logging.warning('[post-watch] dedicated worker pid=%s', os.getpid())
    post_watch_scheduler.start()
    try:
        await asyncio.Event().wait()
    finally:
        post_watch_scheduler.stop()


if __name__ == '__main__':
    asyncio.run(main())
