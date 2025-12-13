"""
Supabase integration for persistent learning data storage
학습 데이터 영구 저장을 위한 Supabase 연동

Supabase 무료 티어:
- 500MB 데이터베이스
- 1GB 스토리지
- 자동 백업 (7일)
- 무제한 API 요청
"""
import os
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional
import httpx

logger = logging.getLogger(__name__)

# Supabase 설정
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")  # anon key (public)
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")  # service role key (private)


def is_supabase_configured() -> bool:
    """Supabase 설정 여부 확인"""
    return bool(SUPABASE_URL and (SUPABASE_KEY or SUPABASE_SERVICE_KEY))


def get_headers() -> Dict[str, str]:
    """Supabase API 헤더"""
    key = SUPABASE_SERVICE_KEY or SUPABASE_KEY
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }


async def sync_learning_sample(sample: Dict) -> bool:
    """
    학습 샘플을 Supabase에 동기화
    """
    if not is_supabase_configured():
        return False

    try:
        async with httpx.AsyncClient() as client:
            # upsert (insert or update)
            response = await client.post(
                f"{SUPABASE_URL}/rest/v1/learning_samples",
                headers={**get_headers(), "Prefer": "resolution=merge-duplicates"},
                json={
                    "id": sample.get("id"),
                    "keyword": sample.get("keyword"),
                    "blog_id": sample.get("blog_id"),
                    "actual_rank": sample.get("actual_rank"),
                    "predicted_score": sample.get("predicted_score"),
                    "c_rank_score": sample.get("c_rank_score"),
                    "dia_score": sample.get("dia_score"),
                    "post_count": sample.get("post_count"),
                    "neighbor_count": sample.get("neighbor_count"),
                    "blog_age_days": sample.get("blog_age_days"),
                    "recent_posts_30d": sample.get("recent_posts_30d"),
                    "visitor_count": sample.get("visitor_count"),
                    "collected_at": sample.get("collected_at")
                },
                timeout=10.0
            )

            if response.status_code in [200, 201]:
                return True
            else:
                logger.error(f"Supabase sync failed: {response.status_code} - {response.text}")
                return False

    except Exception as e:
        logger.error(f"Supabase sync error: {e}")
        return False


async def sync_current_weights(weights: Dict) -> bool:
    """
    현재 가중치를 Supabase에 동기화
    """
    if not is_supabase_configured():
        return False

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{SUPABASE_URL}/rest/v1/current_weights",
                headers={**get_headers(), "Prefer": "resolution=merge-duplicates"},
                json={
                    "id": 1,
                    "weights": json.dumps(weights),
                    "updated_at": datetime.now().isoformat()
                },
                timeout=10.0
            )

            return response.status_code in [200, 201]

    except Exception as e:
        logger.error(f"Supabase weights sync error: {e}")
        return False


async def sync_training_session(session: Dict) -> bool:
    """
    학습 세션을 Supabase에 동기화
    """
    if not is_supabase_configured():
        return False

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{SUPABASE_URL}/rest/v1/learning_sessions",
                headers={**get_headers(), "Prefer": "resolution=merge-duplicates"},
                json={
                    "session_id": session.get("session_id"),
                    "samples_used": session.get("samples_used"),
                    "accuracy_before": session.get("accuracy_before"),
                    "accuracy_after": session.get("accuracy_after"),
                    "improvement": session.get("improvement"),
                    "duration_seconds": session.get("duration_seconds"),
                    "epochs": session.get("epochs"),
                    "learning_rate": session.get("learning_rate"),
                    "keywords": json.dumps(session.get("keywords", [])),
                    "weight_changes": json.dumps(session.get("weight_changes", {})),
                    "started_at": session.get("started_at"),
                    "completed_at": session.get("completed_at")
                },
                timeout=10.0
            )

            return response.status_code in [200, 201]

    except Exception as e:
        logger.error(f"Supabase session sync error: {e}")
        return False


async def bulk_sync_samples(samples: List[Dict]) -> int:
    """
    다수의 샘플을 Supabase에 일괄 동기화
    Returns: 성공한 샘플 수
    """
    if not is_supabase_configured():
        return 0

    success_count = 0
    batch_size = 100

    try:
        async with httpx.AsyncClient() as client:
            for i in range(0, len(samples), batch_size):
                batch = samples[i:i + batch_size]

                payload = [
                    {
                        "id": s.get("id"),
                        "keyword": s.get("keyword"),
                        "blog_id": s.get("blog_id"),
                        "actual_rank": s.get("actual_rank"),
                        "predicted_score": s.get("predicted_score"),
                        "c_rank_score": s.get("c_rank_score"),
                        "dia_score": s.get("dia_score"),
                        "post_count": s.get("post_count"),
                        "neighbor_count": s.get("neighbor_count"),
                        "blog_age_days": s.get("blog_age_days"),
                        "recent_posts_30d": s.get("recent_posts_30d"),
                        "visitor_count": s.get("visitor_count"),
                        "collected_at": s.get("collected_at")
                    }
                    for s in batch
                ]

                response = await client.post(
                    f"{SUPABASE_URL}/rest/v1/learning_samples",
                    headers={**get_headers(), "Prefer": "resolution=merge-duplicates"},
                    json=payload,
                    timeout=30.0
                )

                if response.status_code in [200, 201]:
                    success_count += len(batch)
                else:
                    logger.error(f"Bulk sync failed: {response.status_code}")

        return success_count

    except Exception as e:
        logger.error(f"Bulk sync error: {e}")
        return success_count


async def fetch_all_samples_from_supabase() -> List[Dict]:
    """
    Supabase에서 모든 학습 샘플 가져오기 (복원용)
    """
    if not is_supabase_configured():
        return []

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{SUPABASE_URL}/rest/v1/learning_samples",
                headers=get_headers(),
                params={"order": "collected_at.desc"},
                timeout=30.0
            )

            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Fetch samples failed: {response.status_code}")
                return []

    except Exception as e:
        logger.error(f"Fetch samples error: {e}")
        return []


async def fetch_current_weights_from_supabase() -> Optional[Dict]:
    """
    Supabase에서 현재 가중치 가져오기 (복원용)
    """
    if not is_supabase_configured():
        return None

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{SUPABASE_URL}/rest/v1/current_weights",
                headers=get_headers(),
                params={"id": "eq.1"},
                timeout=10.0
            )

            if response.status_code == 200:
                data = response.json()
                if data:
                    weights_str = data[0].get("weights", "{}")
                    return json.loads(weights_str)
            return None

    except Exception as e:
        logger.error(f"Fetch weights error: {e}")
        return None


async def get_supabase_status() -> Dict:
    """
    Supabase 연결 상태 확인
    """
    if not is_supabase_configured():
        return {
            "configured": False,
            "message": "Supabase credentials not configured"
        }

    try:
        async with httpx.AsyncClient() as client:
            # 간단한 쿼리로 연결 확인
            response = await client.get(
                f"{SUPABASE_URL}/rest/v1/learning_samples",
                headers=get_headers(),
                params={"limit": "1"},
                timeout=5.0
            )

            if response.status_code == 200:
                return {
                    "configured": True,
                    "connected": True,
                    "url": SUPABASE_URL,
                    "message": "Supabase connected successfully"
                }
            else:
                return {
                    "configured": True,
                    "connected": False,
                    "error": f"HTTP {response.status_code}",
                    "message": "Supabase connection failed"
                }

    except Exception as e:
        return {
            "configured": True,
            "connected": False,
            "error": str(e),
            "message": "Supabase connection error"
        }


# SQL for creating tables in Supabase (run in Supabase SQL editor)
SUPABASE_SCHEMA = """
-- Run this in Supabase SQL Editor to create tables

-- 1. Learning samples table
CREATE TABLE IF NOT EXISTS learning_samples (
    id SERIAL PRIMARY KEY,
    keyword TEXT NOT NULL,
    blog_id TEXT NOT NULL,
    actual_rank INTEGER NOT NULL,
    predicted_score REAL NOT NULL,
    c_rank_score REAL,
    dia_score REAL,
    post_count INTEGER,
    neighbor_count INTEGER,
    blog_age_days INTEGER,
    recent_posts_30d INTEGER,
    visitor_count INTEGER,
    collected_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keyword ON learning_samples(keyword);
CREATE INDEX IF NOT EXISTS idx_collected_at ON learning_samples(collected_at);

-- 2. Learning sessions table
CREATE TABLE IF NOT EXISTS learning_sessions (
    id SERIAL PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,
    samples_used INTEGER,
    accuracy_before REAL,
    accuracy_after REAL,
    improvement REAL,
    duration_seconds REAL,
    epochs INTEGER,
    learning_rate REAL,
    keywords TEXT,
    weight_changes TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- 3. Current weights table
CREATE TABLE IF NOT EXISTS current_weights (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    weights TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Weight history table
CREATE TABLE IF NOT EXISTS weight_history (
    id SERIAL PRIMARY KEY,
    session_id TEXT,
    weights TEXT NOT NULL,
    accuracy REAL,
    total_samples INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security (optional)
ALTER TABLE learning_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE current_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_history ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (adjust as needed)
CREATE POLICY "Allow all for authenticated" ON learning_samples FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON learning_sessions FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON current_weights FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON weight_history FOR ALL USING (true);
"""
