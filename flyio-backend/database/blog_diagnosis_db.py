# -*- coding: utf-8 -*-
"""문제진단이 읽는 측정 결과 저장소.

검색 노출 진단(`/search-health`)은 글 10개를 실제로 검색하므로 약 6초가 걸린다.
대시보드 첫 화면이 그걸 매번 기다리게 할 수는 없다. 그래서 잰 결과를 남겨 두고
대시보드는 남은 것만 읽는다 — 없으면 '아직 확인 안 함' 이지 '정상' 이 아니다.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def _conn():
    from database.blog_index_history_db import _connect
    conn = _connect()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS search_health_result (
            blog_id       TEXT PRIMARY KEY,
            grade         TEXT,
            index_rate    REAL,
            checked_posts INTEGER,
            indexed_posts INTEGER,
            missing_posts INTEGER,
            measured_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    return conn


def write_search_health(blog_id: str, result: Dict[str, Any]) -> None:
    """진단이 돌 때마다 남긴다. 실패해도 원래 응답을 막지 않는다."""
    try:
        conn = _conn()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO search_health_result "
                "(blog_id, grade, index_rate, checked_posts, indexed_posts, "
                " missing_posts, measured_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)",
                (blog_id, result.get("grade"), result.get("index_rate"),
                 result.get("checked_posts"), result.get("indexed_posts"),
                 result.get("missing_posts")),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        logger.debug(f"[diagnosis] search health write failed for {blog_id}: {e}")


def read_search_health(blog_id: str, max_age_hours: int = 72) -> Optional[Dict[str, Any]]:
    """너무 오래된 측정은 없는 것으로 친다 — 낡은 값을 현재라고 말하지 않는다."""
    try:
        conn = _conn()
        try:
            row = conn.execute(
                "SELECT * FROM search_health_result WHERE blog_id = ?", (blog_id,)
            ).fetchone()
        finally:
            conn.close()
        if not row:
            return None
        d = dict(row)
        measured = datetime.fromisoformat(str(d["measured_at"]).replace("Z", ""))
        if datetime.now() - measured > timedelta(hours=max_age_hours):
            return None
        return d
    except Exception as e:
        logger.debug(f"[diagnosis] search health read failed for {blog_id}: {e}")
        return None
