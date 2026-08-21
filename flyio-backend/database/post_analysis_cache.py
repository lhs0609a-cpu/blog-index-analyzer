# -*- coding: utf-8 -*-
"""글 단위 분석 캐시.

**발행된 글은 변하지 않는다.** 한 번 파싱한 본문 길이·문단 수·소제목 수는
다음에 읽어도 같은 값이다. 그런데 예전에는 분석할 때마다 매번 다시 긁었고,
그 비용 때문에 표본을 최신 글 3개로 묶어 둘 수밖에 없었다.

    for item in items[:3]:   # 처음 3개만 (성능 제약)

3개는 너무 적다. 하루 6~7개씩 올리는 블로그라면 **매일 표본이 통째로 갈린다.**
그러면 지수는 '블로그의 상태' 가 아니라 '오늘 올라온 글 3개가 얼마나 길었나'
를 재게 된다. 실제로 그 블로그는 글 수·방문자·이웃이 모두 일정한데 점수만
하루걸러 ±8~11 씩 튀었다.

캐시가 그 제약을 없앤다. 첫 분석만 비용이 들고, 그 뒤로는 새로 올라온 글만
읽으면 되므로 표본을 크게 잡아도 사실상 공짜다.

⚠️ 공감·댓글 수는 시간이 지나며 늘어난다. 구조 지표(길이·문단·소제목·이미지)
   만 영구 캐시로 쓰고, 참여 지표는 TTL 을 짧게 둔다.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# 구조 지표는 사실상 안 변한다. 그래도 파서를 고칠 수 있으니 무한은 피한다.
STRUCT_TTL_DAYS = 180


def _conn():
    from database.blog_index_history_db import _connect
    conn = _connect()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS post_analysis_cache (
            url         TEXT PRIMARY KEY,
            blog_id     TEXT,
            payload     TEXT NOT NULL,
            fetched_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_pac_blog ON post_analysis_cache(blog_id)"
    )
    conn.commit()
    return conn


def get_many(urls: List[str], max_age_days: int = STRUCT_TTL_DAYS) -> Dict[str, Dict[str, Any]]:
    """캐시된 글 분석을 한 번에 꺼낸다. 없는 URL 은 결과에 없다."""
    if not urls:
        return {}
    out: Dict[str, Dict[str, Any]] = {}
    try:
        conn = _conn()
        try:
            cutoff = datetime.now() - timedelta(days=max_age_days)
            qmarks = ",".join("?" * len(urls))
            rows = conn.execute(
                f"SELECT url, payload, fetched_at FROM post_analysis_cache WHERE url IN ({qmarks})",
                urls,
            ).fetchall()
            for r in rows:
                try:
                    fetched = datetime.fromisoformat(str(r["fetched_at"]).replace("Z", ""))
                except Exception:
                    continue
                if fetched < cutoff:
                    continue
                try:
                    out[r["url"]] = json.loads(r["payload"])
                except Exception:
                    continue
        finally:
            conn.close()
    except Exception as e:
        logger.debug(f"[post-cache] read failed: {e}")
    return out


def put_many(blog_id: str, items: Dict[str, Dict[str, Any]]) -> int:
    """새로 읽은 글을 저장한다. 실패해도 분석 자체를 막지 않는다."""
    if not items:
        return 0
    try:
        conn = _conn()
        try:
            conn.executemany(
                "INSERT OR REPLACE INTO post_analysis_cache (url, blog_id, payload, fetched_at) "
                "VALUES (?,?,?,CURRENT_TIMESTAMP)",
                [(u, blog_id, json.dumps(v, ensure_ascii=False)) for u, v in items.items()],
            )
            conn.commit()
            return len(items)
        finally:
            conn.close()
    except Exception as e:
        logger.debug(f"[post-cache] write failed for {blog_id}: {e}")
        return 0
