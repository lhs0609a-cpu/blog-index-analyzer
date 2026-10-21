# -*- coding: utf-8 -*-
"""블로그 분석 결과 캐시 (DB).

메모리 캐시(BLOG_ANALYSIS_CACHE)는 100개·1시간이고 배포·재시작 때마다 비었다.
키워드 1회가 블로그 20개를 읽으니 키워드 다섯 개면 이미 밀려나고, 배포가 잦은
날에는 매번 처음부터 네이버를 다시 긁었다 — 본문 요청은 동시 4개로 묶여 있어
그게 곧 대기 시간이다(2026-10-21 운영 실측: 캐시가 빈 키워드 40~280초).

여기 남기는 건 '측정 완료'로 판정된 결과뿐이다(호출부가 measured 일 때만 저장).
채점 버전이 바뀌면 예전 결과는 쓰지 않는다.
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# 글 수·이웃·방문자는 하루 안에 크게 안 변한다. 등급은 일 단위로 보는 지표다.
TTL_S = float(os.getenv("BLOG_ANALYSIS_DB_TTL_S", str(6 * 3600)))


def _scoring_version() -> int:
    try:
        from database.blog_percentile_db import SCORING_VERSION
        return int(SCORING_VERSION)
    except Exception:
        return 0


def _conn():
    from database.blog_index_history_db import _connect
    conn = _connect()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS blog_analysis_cache (
            blog_id          TEXT PRIMARY KEY,
            payload          TEXT NOT NULL,
            scoring_version  INTEGER NOT NULL,
            saved_at         REAL NOT NULL
        )
    """)
    return conn


def get(blog_id: str) -> Optional[Dict[str, Any]]:
    try:
        conn = _conn()
        try:
            row = conn.execute(
                "SELECT payload, scoring_version, saved_at FROM blog_analysis_cache WHERE blog_id = ?",
                (blog_id,),
            ).fetchone()
        finally:
            conn.close()
    except Exception as e:
        logger.debug(f"[blog-cache] read failed {blog_id}: {e}")
        return None
    if not row:
        return None
    if row["scoring_version"] != _scoring_version() or time.time() - row["saved_at"] > TTL_S:
        return None
    try:
        return json.loads(row["payload"])
    except Exception:
        return None


def put(blog_id: str, data: Dict[str, Any]) -> None:
    try:
        payload = json.dumps(data, ensure_ascii=False, default=str)
        conn = _conn()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO blog_analysis_cache (blog_id, payload, scoring_version, saved_at) "
                "VALUES (?, ?, ?, ?)",
                (blog_id, payload, _scoring_version(), time.time()),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        logger.debug(f"[blog-cache] write failed {blog_id}: {e}")
