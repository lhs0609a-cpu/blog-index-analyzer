"""
A/B 테스트 데이터베이스
실험 관리, 사용자 할당, 결과 추적
"""
import sqlite3
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
import logging
import os
import random
import hashlib
import json

logger = logging.getLogger(__name__)

# Database path
import sys
if sys.platform == "win32":
    _default_path = os.path.join(os.path.dirname(__file__), "..", "data", "ab_test.db")
else:
    _default_path = "/data/ab_test.db"
AB_TEST_DB_PATH = os.environ.get("AB_TEST_DB_PATH", _default_path)


class ABTestDB:
    """A/B 테스트 데이터베이스"""

    def __init__(self, db_path: str = AB_TEST_DB_PATH):
        self.db_path = db_path
        self._ensure_db_exists()
        self._init_tables()
        self._init_default_experiments()

    def _ensure_db_exists(self):
        db_dir = os.path.dirname(self.db_path)
        if db_dir and not os.path.exists(db_dir):
            try:
                os.makedirs(db_dir, exist_ok=True)
            except Exception as e:
                logger.warning(f"Could not create db directory: {e}")

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_tables(self):
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 실험 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS experiments (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    status TEXT DEFAULT 'draft',
                    variants TEXT NOT NULL,
                    traffic_percentage INTEGER DEFAULT 100,
                    start_date TIMESTAMP,
                    end_date TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 사용자 할당 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_assignments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    experiment_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    variant TEXT NOT NULL,
                    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(experiment_id, user_id),
                    FOREIGN KEY (experiment_id) REFERENCES experiments(id)
                )
            """)

            # 이벤트 추적 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS experiment_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    experiment_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    variant TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    event_data TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (experiment_id) REFERENCES experiments(id)
                )
            """)

            # 인덱스
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_assignments_experiment ON user_assignments(experiment_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_assignments_user ON user_assignments(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_experiment ON experiment_events(experiment_id)")

            conn.commit()
            logger.info("A/B test tables initialized")
        finally:
            conn.close()

    def _init_default_experiments(self):
        """기본 실험들 초기화"""
        default_experiments = [
            {
                'id': 'pricing_page_layout',
                'name': '가격 페이지 레이아웃',
                'description': '가격 페이지 레이아웃 A/B 테스트',
                'variants': json.dumps({
                    'control': {'weight': 50, 'config': {'layout': 'original'}},
                    'variant_a': {'weight': 50, 'config': {'layout': 'new_cards'}}
                }),
                'status': 'active'
            },
            {
                'id': 'cta_button_text',
                'name': 'CTA 버튼 텍스트',
                'description': '무료 체험 버튼 텍스트 테스트',
                'variants': json.dumps({
                    'control': {'weight': 33, 'config': {'text': '7일 무료 체험'}},
                    'variant_a': {'weight': 33, 'config': {'text': '무료로 시작하기'}},
                    'variant_b': {'weight': 34, 'config': {'text': '지금 바로 시작'}}
                }),
                'status': 'active'
            },
            {
                'id': 'onboarding_flow',
                'name': '온보딩 플로우',
                'description': '신규 사용자 온보딩 흐름 테스트',
                'variants': json.dumps({
                    'control': {'weight': 50, 'config': {'steps': 3, 'skip_allowed': True}},
                    'variant_a': {'weight': 50, 'config': {'steps': 5, 'skip_allowed': False}}
                }),
                'status': 'active'
            },
            {
                'id': 'social_proof_display',
                'name': '소셜 프루프 표시',
                'description': '실시간 활동 표시 방식 테스트',
                'variants': json.dumps({
                    'control': {'weight': 25, 'config': {'show_banner': True, 'show_toast': True, 'show_counter': False}},
                    'variant_a': {'weight': 25, 'config': {'show_banner': True, 'show_toast': False, 'show_counter': True}},
                    'variant_b': {'weight': 25, 'config': {'show_banner': False, 'show_toast': True, 'show_counter': True}},
                    'variant_c': {'weight': 25, 'config': {'show_banner': True, 'show_toast': True, 'show_counter': True}}
                }),
                'status': 'active'
            },
            {
                'id': 'upgrade_modal_style',
                'name': '업그레이드 모달 스타일',
                'description': '업그레이드 유도 모달 디자인 테스트',
                'variants': json.dumps({
                    'control': {'weight': 50, 'config': {'style': 'simple', 'urgency': False}},
                    'variant_a': {'weight': 50, 'config': {'style': 'premium', 'urgency': True}}
                }),
                'status': 'active'
            }
        ]

        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            for exp in default_experiments:
                cursor.execute("""
                    INSERT OR IGNORE INTO experiments (id, name, description, variants, status)
                    VALUES (?, ?, ?, ?, ?)
                """, (exp['id'], exp['name'], exp['description'], exp['variants'], exp['status']))
            conn.commit()
        finally:
            conn.close()

    def get_experiment(self, experiment_id: str) -> Optional[Dict[str, Any]]:
        """실험 정보 조회"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM experiments WHERE id = ?", (experiment_id,))
            row = cursor.fetchone()
            if row:
                exp = dict(row)
                exp['variants'] = json.loads(exp['variants'])
                return exp
            return None
        finally:
            conn.close()

    def get_all_experiments(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """모든 실험 조회"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            if status:
                cursor.execute("SELECT * FROM experiments WHERE status = ?", (status,))
            else:
                cursor.execute("SELECT * FROM experiments")
            rows = cursor.fetchall()
            experiments = []
            for row in rows:
                exp = dict(row)
                exp['variants'] = json.loads(exp['variants'])
                experiments.append(exp)
            return experiments
        finally:
            conn.close()

    def assign_user_to_variant(self, experiment_id: str, user_id: str) -> Optional[str]:
        """
        사용자를 실험 변형에 할당
        - 이미 할당된 경우 기존 변형 반환
        - 새로 할당하는 경우 가중치 기반 랜덤 할당
        """
        # 기존 할당 확인
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT variant FROM user_assignments
                WHERE experiment_id = ? AND user_id = ?
            """, (experiment_id, user_id))
            row = cursor.fetchone()
            if row:
                return row['variant']
        finally:
            conn.close()

        # 실험 정보 조회
        experiment = self.get_experiment(experiment_id)
        if not experiment or experiment['status'] != 'active':
            return None

        # 트래픽 비율 체크
        if experiment['traffic_percentage'] < 100:
            # 사용자 ID 해시로 일관된 트래픽 할당
            hash_val = int(hashlib.md5(f"{experiment_id}:{user_id}".encode()).hexdigest(), 16)
            if (hash_val % 100) >= experiment['traffic_percentage']:
                return None  # 실험 대상 아님

        # 가중치 기반 변형 선택
        variants = experiment['variants']
        total_weight = sum(v['weight'] for v in variants.values())
        rand = random.uniform(0, total_weight)
        cumulative = 0

        selected_variant = list(variants.keys())[0]
        for variant_name, variant_data in variants.items():
            cumulative += variant_data['weight']
            if rand <= cumulative:
                selected_variant = variant_name
                break

        # 할당 저장
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO user_assignments (experiment_id, user_id, variant)
                VALUES (?, ?, ?)
            """, (experiment_id, user_id, selected_variant))
            conn.commit()
        finally:
            conn.close()

        return selected_variant

    def get_user_variant(self, experiment_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """사용자의 실험 변형 및 설정 조회"""
        variant_name = self.assign_user_to_variant(experiment_id, user_id)
        if not variant_name:
            return None

        experiment = self.get_experiment(experiment_id)
        if not experiment:
            return None

        variant_data = experiment['variants'].get(variant_name, {})
        return {
            'experiment_id': experiment_id,
            'variant': variant_name,
            'config': variant_data.get('config', {})
        }

    def get_user_all_experiments(self, user_id: str) -> Dict[str, Dict[str, Any]]:
        """사용자의 모든 활성 실험 변형 조회"""
        experiments = self.get_all_experiments(status='active')
        result = {}

        for exp in experiments:
            variant_data = self.get_user_variant(exp['id'], user_id)
            if variant_data:
                result[exp['id']] = variant_data

        return result

    def track_event(self, experiment_id: str, user_id: str, event_type: str, event_data: Optional[Dict] = None):
        """실험 이벤트 추적"""
        # 사용자 변형 확인
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT variant FROM user_assignments
                WHERE experiment_id = ? AND user_id = ?
            """, (experiment_id, user_id))
            row = cursor.fetchone()
            if not row:
                return False

            variant = row['variant']

            cursor.execute("""
                INSERT INTO experiment_events (experiment_id, user_id, variant, event_type, event_data)
                VALUES (?, ?, ?, ?, ?)
            """, (experiment_id, user_id, variant, event_type, json.dumps(event_data) if event_data else None))
            conn.commit()
            return True
        finally:
            conn.close()

    def get_experiment_stats(self, experiment_id: str) -> Dict[str, Any]:
        """실험 통계 조회"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 변형별 사용자 수
            cursor.execute("""
                SELECT variant, COUNT(*) as count
                FROM user_assignments
                WHERE experiment_id = ?
                GROUP BY variant
            """, (experiment_id,))
            user_counts = {row['variant']: row['count'] for row in cursor.fetchall()}

            # 변형별 이벤트 수
            cursor.execute("""
                SELECT variant, event_type, COUNT(*) as count
                FROM experiment_events
                WHERE experiment_id = ?
                GROUP BY variant, event_type
            """, (experiment_id,))

            events = {}
            for row in cursor.fetchall():
                if row['variant'] not in events:
                    events[row['variant']] = {}
                events[row['variant']][row['event_type']] = row['count']

            # 전환율 계산
            conversions = {}
            for variant, count in user_counts.items():
                variant_events = events.get(variant, {})
                conversions[variant] = {
                    'users': count,
                    'events': variant_events,
                    'conversion_rate': (variant_events.get('conversion', 0) / count * 100) if count > 0 else 0
                }

            return {
                'experiment_id': experiment_id,
                'total_users': sum(user_counts.values()),
                'variants': conversions
            }
        finally:
            conn.close()

    def create_experiment(self, experiment_id: str, name: str, description: str, variants: Dict, traffic_percentage: int = 100) -> bool:
        """새 실험 생성"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO experiments (id, name, description, variants, traffic_percentage, status)
                VALUES (?, ?, ?, ?, ?, 'draft')
            """, (experiment_id, name, description, json.dumps(variants), traffic_percentage))
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False
        finally:
            conn.close()

    def update_experiment_status(self, experiment_id: str, status: str) -> bool:
        """실험 상태 업데이트"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE experiments
                SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (status, experiment_id))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()


# 싱글톤
_db_instance = None

def get_ab_test_db() -> ABTestDB:
    global _db_instance
    if _db_instance is None:
        _db_instance = ABTestDB()
    return _db_instance
