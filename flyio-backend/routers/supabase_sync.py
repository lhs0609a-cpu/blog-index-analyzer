"""
Supabase sync API endpoints
Supabase 동기화 API 엔드포인트
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Optional
import logging

from services.supabase_service import (
    is_supabase_configured,
    get_supabase_status,
    bulk_sync_samples,
    sync_current_weights,
    fetch_all_samples_from_supabase,
    fetch_current_weights_from_supabase,
    SUPABASE_SCHEMA
)
from database.learning_db import (
    get_learning_samples,
    get_current_weights,
    save_current_weights,
    add_learning_sample
)

router = APIRouter()
logger = logging.getLogger(__name__)


class SyncStatusResponse(BaseModel):
    configured: bool
    connected: bool = False
    url: Optional[str] = None
    message: str
    error: Optional[str] = None


class SyncResultResponse(BaseModel):
    success: bool
    message: str
    synced_count: int = 0
    total_count: int = 0


@router.get("/status", response_model=SyncStatusResponse)
async def supabase_status():
    """
    Supabase 연결 상태 확인
    """
    try:
        status = await get_supabase_status()
        return SyncStatusResponse(**status)
    except Exception as e:
        logger.error(f"Supabase status check failed: {e}")
        return SyncStatusResponse(
            configured=False,
            message=f"Error: {str(e)}"
        )


@router.post("/push", response_model=SyncResultResponse)
async def push_to_supabase():
    """
    로컬 데이터를 Supabase로 푸시 (동기화)
    - 모든 학습 샘플을 Supabase에 업로드
    - 현재 가중치도 함께 동기화
    """
    if not is_supabase_configured():
        raise HTTPException(
            status_code=400,
            detail="Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY."
        )

    try:
        # 1. 로컬 샘플 가져오기
        samples = get_learning_samples(limit=10000)
        total_count = len(samples)

        if total_count == 0:
            return SyncResultResponse(
                success=True,
                message="No samples to sync",
                synced_count=0,
                total_count=0
            )

        # 2. Supabase로 동기화
        synced = await bulk_sync_samples(samples)

        # 3. 현재 가중치 동기화
        weights = get_current_weights()
        if weights:
            await sync_current_weights(weights)

        return SyncResultResponse(
            success=synced > 0,
            message=f"Synced {synced}/{total_count} samples to Supabase",
            synced_count=synced,
            total_count=total_count
        )

    except Exception as e:
        logger.error(f"Push to Supabase failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pull", response_model=SyncResultResponse)
async def pull_from_supabase():
    """
    Supabase에서 데이터 가져오기 (복원)
    - Supabase의 모든 데이터를 로컬 DB로 복원
    """
    if not is_supabase_configured():
        raise HTTPException(
            status_code=400,
            detail="Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY."
        )

    try:
        # 1. Supabase에서 샘플 가져오기
        samples = await fetch_all_samples_from_supabase()
        total_count = len(samples)

        if total_count == 0:
            return SyncResultResponse(
                success=True,
                message="No samples in Supabase",
                synced_count=0,
                total_count=0
            )

        # 2. 로컬 DB에 저장
        synced = 0
        for sample in samples:
            try:
                add_learning_sample(
                    keyword=sample.get("keyword", ""),
                    blog_id=sample.get("blog_id", ""),
                    actual_rank=sample.get("actual_rank", 0),
                    predicted_score=sample.get("predicted_score", 0),
                    blog_features={
                        "c_rank_score": sample.get("c_rank_score"),
                        "dia_score": sample.get("dia_score"),
                        "post_count": sample.get("post_count"),
                        "neighbor_count": sample.get("neighbor_count"),
                        "blog_age_days": sample.get("blog_age_days"),
                        "recent_posts_30d": sample.get("recent_posts_30d"),
                        "visitor_count": sample.get("visitor_count")
                    }
                )
                synced += 1
            except Exception as e:
                logger.warning(f"Failed to restore sample: {e}")

        # 3. 가중치 복원
        weights = await fetch_current_weights_from_supabase()
        if weights:
            save_current_weights(weights)

        return SyncResultResponse(
            success=synced > 0,
            message=f"Restored {synced}/{total_count} samples from Supabase",
            synced_count=synced,
            total_count=total_count
        )

    except Exception as e:
        logger.error(f"Pull from Supabase failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schema")
async def get_schema():
    """
    Supabase 테이블 생성 SQL 스키마 반환
    - 이 SQL을 Supabase SQL Editor에서 실행하세요
    """
    return {
        "description": "Run this SQL in Supabase SQL Editor to create tables",
        "sql": SUPABASE_SCHEMA
    }
