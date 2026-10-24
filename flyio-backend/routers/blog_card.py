# -*- coding: utf-8 -*-
"""블로그 등급 증명 카드 — 공개 요약.

체험단 모집 글이 "준최3 이상" 같은 조건을 거는 탓에, 블로거는 자기 등급을
캡처해서 보낸다. 이 엔드포인트는 그 카드(페이지·OG 이미지)에 들어갈 숫자만 준다.

원칙:
- **이미 저장된 결과만 읽는다.** 네이버를 새로 긁지 않는다. 공개 URL 이라
  아무나 아무 아이디로 부를 수 있고, 여기서 수집을 트리거하면 그대로 남용 경로가 된다.
- 읽는 곳: DB 분석 캐시(blog_analysis_cache, 측정 완료분만 저장됨) →
  없으면 지수 시계열의 최신 완전 측정 스냅샷(blog_index_snapshots).
- 개인 정보·원시 수치(방문자·이웃 수 등)는 내보내지 않는다. 등급·점수·측정 시각뿐.
- 등급은 블스피 자체 모델의 추정치다. 추정(부분 측정) 여부를 그대로 내보내
  카드가 '추정' 표시를 하게 한다.
"""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Response

logger = logging.getLogger(__name__)

router = APIRouter()

BLOG_ID_RE = re.compile(r"^[A-Za-z0-9_-]{3,50}$")

# 카드는 공유돼 여러 번 열린다. CDN/브라우저가 잠깐 들고 있어도 된다.
_CACHE_CONTROL = "public, max-age=300, s-maxage=600"


def _from_cache(blog_id: str) -> Optional[Dict[str, Any]]:
    from database import blog_analysis_cache as BAC

    data = BAC.get(blog_id)
    if not data:
        return None
    index = data.get("index") or {}
    if index.get("level") is None or index.get("total_score") is None:
        return None

    measured_at: Optional[str] = None
    try:
        conn = BAC._conn()
        try:
            row = conn.execute(
                "SELECT saved_at FROM blog_analysis_cache WHERE blog_id = ?", (blog_id,)
            ).fetchone()
        finally:
            conn.close()
        if row:
            from database.blog_index_history_db import KST
            measured_at = datetime.fromtimestamp(float(row["saved_at"]), KST).isoformat()
    except Exception as e:  # 시각을 못 읽어도 카드는 낸다
        logger.debug(f"[blog-card] saved_at read failed {blog_id}: {e}")

    estimated = (
        index.get("level_source") in ("estimated", "unavailable")
        or index.get("measurement_complete") is False
        or bool(index.get("partial_dimensions"))
        or data.get("measured") is False
    )
    return {
        "blog_name": data.get("blog_name") or None,
        "level": index.get("level"),
        "grade": index.get("grade") or None,
        "level_category": index.get("level_category") or None,
        "total_score": index.get("total_score"),
        "measured_at": measured_at,
        "estimated": bool(estimated),
    }


def _from_snapshots(blog_id: str) -> Optional[Dict[str, Any]]:
    from database.blog_index_history_db import get_snapshots, tier_label

    # get_snapshots 는 기본으로 완전 측정분만 준다(콘텐츠 축이 빈 날은 가림).
    rows = get_snapshots(blog_id, days=365, limit=400)
    rows = [r for r in rows if r.get("level") is not None and r.get("total_score") is not None]
    if not rows:
        return None
    last = rows[-1]
    return {
        "blog_name": None,
        "level": last["level"],
        "grade": last.get("grade") or tier_label(last["level"]),
        "level_category": last.get("level_category") or None,
        "total_score": last["total_score"],
        "measured_at": last.get("captured_at"),
        "estimated": False,
    }


def _build_card(blog_id: str) -> Dict[str, Any]:
    found: Optional[Dict[str, Any]] = None
    try:
        found = _from_cache(blog_id)
    except Exception as e:
        logger.debug(f"[blog-card] cache lookup failed {blog_id}: {e}")
    if found is None:
        try:
            found = _from_snapshots(blog_id)
        except Exception as e:
            logger.debug(f"[blog-card] snapshot lookup failed {blog_id}: {e}")

    if found is None:
        return {
            "blog_id": blog_id,
            "blog_name": None,
            "level": None,
            "grade": None,
            "level_category": None,
            "total_score": None,
            "measured_at": None,
            "estimated": False,
            "available": False,
        }

    try:
        level = int(found["level"])
    except (TypeError, ValueError):
        level = None
    try:
        score = round(float(found["total_score"]), 1)
    except (TypeError, ValueError):
        score = None
    blog_name = found.get("blog_name")
    if isinstance(blog_name, str):
        blog_name = blog_name.strip()[:60] or None
    else:
        blog_name = None

    return {
        "blog_id": blog_id,
        "blog_name": blog_name,
        "level": level,
        "grade": found.get("grade"),
        "level_category": found.get("level_category"),
        "total_score": score,
        "measured_at": found.get("measured_at"),
        "estimated": bool(found.get("estimated")),
        "available": level is not None and score is not None,
    }


@router.get("/{blog_id}")
async def get_blog_card(blog_id: str, response: Response) -> Dict[str, Any]:
    """저장된 분석 결과로 등급 카드 요약을 돌려준다. 새 수집은 하지 않는다."""
    if not BLOG_ID_RE.match(blog_id or ""):
        raise HTTPException(status_code=400, detail="invalid blog_id")
    card = await asyncio.to_thread(_build_card, blog_id)
    response.headers["Cache-Control"] = _CACHE_CONTROL
    return card
