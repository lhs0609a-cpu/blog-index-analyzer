"""
퍼널 디자이너 — SQLite 데이터베이스
"""
import sqlite3
import json
import os
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from contextlib import contextmanager

logger = logging.getLogger(__name__)

# 데이터베이스 파일 경로
DB_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
DB_PATH = os.path.join(DB_DIR, 'funnel_designer.db')

# Fly.io 영구 볼륨 경로
FLYIO_DATA_DIR = '/data'
if os.path.exists(FLYIO_DATA_DIR):
    DB_PATH = os.path.join(FLYIO_DATA_DIR, 'funnel_designer.db')


def get_connection() -> sqlite3.Connection:
    """데이터베이스 연결 반환"""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_db():
    """컨텍스트 매니저로 DB 연결 관리"""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def init_funnel_designer_tables():
    """퍼널 디자이너 테이블 초기화"""
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS funnels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name VARCHAR(200) NOT NULL,
                industry VARCHAR(100),
                description TEXT,
                funnel_data TEXT NOT NULL,
                health_score INTEGER,
                health_details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_deleted BOOLEAN DEFAULT FALSE
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS funnel_ai_diagnoses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                funnel_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                diagnosis_type VARCHAR(50) NOT NULL,
                persona_name VARCHAR(100),
                result_data TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (funnel_id) REFERENCES funnels(id)
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_funnels_user ON funnels(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_funnels_industry ON funnels(industry)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_diagnoses_funnel ON funnel_ai_diagnoses(funnel_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_diagnoses_user ON funnel_ai_diagnoses(user_id)")

        logger.info("Funnel designer tables initialized successfully")


# ========== 퍼널 CRUD ==========

def save_funnel(user_id: int, name: str, funnel_data: dict,
                industry: str = None, description: str = None) -> int:
    """퍼널 생성, 생성된 ID 반환"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO funnels (user_id, name, industry, description, funnel_data)
            VALUES (?, ?, ?, ?, ?)
        """, (
            user_id, name, industry, description,
            json.dumps(funnel_data, ensure_ascii=False)
        ))
        return cursor.lastrowid


def update_funnel(funnel_id: int, user_id: int, **kwargs) -> bool:
    """퍼널 수정"""
    allowed_fields = {'name', 'industry', 'description', 'funnel_data'}
    updates = []
    values = []

    for key, value in kwargs.items():
        if key in allowed_fields and value is not None:
            if key == 'funnel_data':
                value = json.dumps(value, ensure_ascii=False)
            updates.append(f"{key} = ?")
            values.append(value)

    if not updates:
        return False

    updates.append("updated_at = CURRENT_TIMESTAMP")
    values.extend([funnel_id, user_id])

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(f"""
            UPDATE funnels SET {', '.join(updates)}
            WHERE id = ? AND user_id = ? AND is_deleted = FALSE
        """, values)
        return cursor.rowcount > 0


def get_funnel(funnel_id: int, user_id: int = None) -> Optional[Dict[str, Any]]:
    """퍼널 상세 조회"""
    with get_db() as conn:
        cursor = conn.cursor()
        if user_id:
            cursor.execute("""
                SELECT * FROM funnels
                WHERE id = ? AND user_id = ? AND is_deleted = FALSE
            """, (funnel_id, user_id))
        else:
            cursor.execute("""
                SELECT * FROM funnels
                WHERE id = ? AND is_deleted = FALSE
            """, (funnel_id,))

        row = cursor.fetchone()
        if row:
            result = dict(row)
            result['funnel_data'] = json.loads(result['funnel_data'])
            if result.get('health_details'):
                result['health_details'] = json.loads(result['health_details'])
            return result
        return None


def list_funnels(user_id: int) -> List[Dict[str, Any]]:
    """사용자의 퍼널 목록 조회"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, industry, description, health_score, created_at, updated_at
            FROM funnels
            WHERE user_id = ? AND is_deleted = FALSE
            ORDER BY updated_at DESC
        """, (user_id,))

        return [dict(row) for row in cursor.fetchall()]


def delete_funnel(funnel_id: int, user_id: int) -> bool:
    """퍼널 소프트 삭제"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE funnels SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ? AND is_deleted = FALSE
        """, (funnel_id, user_id))
        return cursor.rowcount > 0


def update_funnel_health(funnel_id: int, user_id: int, score: int, details: dict) -> bool:
    """퍼널 헬스 스코어 업데이트"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE funnels SET health_score = ?, health_details = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        """, (score, json.dumps(details, ensure_ascii=False), funnel_id, user_id))
        return cursor.rowcount > 0


# ========== AI 진단 ==========

def save_ai_diagnosis(funnel_id: int, user_id: int, diagnosis_type: str,
                      result_data: dict, persona_name: str = None) -> int:
    """AI 진단 결과 저장"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO funnel_ai_diagnoses
            (funnel_id, user_id, diagnosis_type, persona_name, result_data)
            VALUES (?, ?, ?, ?, ?)
        """, (
            funnel_id, user_id, diagnosis_type, persona_name,
            json.dumps(result_data, ensure_ascii=False)
        ))
        return cursor.lastrowid


def get_ai_diagnoses(funnel_id: int, diagnosis_type: str = None,
                     limit: int = 20) -> List[Dict[str, Any]]:
    """AI 진단 이력 조회"""
    with get_db() as conn:
        cursor = conn.cursor()
        if diagnosis_type:
            cursor.execute("""
                SELECT * FROM funnel_ai_diagnoses
                WHERE funnel_id = ? AND diagnosis_type = ?
                ORDER BY created_at DESC LIMIT ?
            """, (funnel_id, diagnosis_type, limit))
        else:
            cursor.execute("""
                SELECT * FROM funnel_ai_diagnoses
                WHERE funnel_id = ?
                ORDER BY created_at DESC LIMIT ?
            """, (funnel_id, limit))

        results = []
        for row in cursor.fetchall():
            item = dict(row)
            item['result_data'] = json.loads(item['result_data'])
            results.append(item)
        return results
