"""
소셜 프루프 (가상 커뮤니티 활동) 데이터베이스
24시간 자동으로 활동이 생성되어 활발한 커뮤니티처럼 보이게 함
"""
import sqlite3
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
import logging
import os
import random
import json

logger = logging.getLogger(__name__)

# Database path
import sys
if sys.platform == "win32":
    _default_path = os.path.join(os.path.dirname(__file__), "..", "data", "social_proof.db")
else:
    _default_path = "/data/social_proof.db"
SOCIAL_PROOF_DB_PATH = os.environ.get("SOCIAL_PROOF_DB_PATH", _default_path)


# ============ 가상 사용자 데이터 ============

SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍', '전', '고', '문', '양', '손', '배', '백', '허', '유', '남']

PREFIXES = [
    '맛집헌터', '여행러버', '뷰티퀸', '테크리뷰', '육아맘', '독서광', '홈카페', '운동덕후',
    '요리왕', '패션피플', '게임러', '음악덕', '영화광', '사진작가', '식물집사', '반려인',
    '재테크', '부동산', '주식고수', '자기계발', '다이어터', '캠핑족', '드라이버', '바이커',
    '등산러', '서퍼', '골퍼', '러너', '요가러', '필라테스', '헬스터', '수영러',
    '일상기록', '브이로거', '리뷰어', '에디터', '크리에이터', '인플루언서', '블로거', '작가',
    '마케터', '디자이너', '개발자', '기획자', '컨설턴트', '프리랜서', '창업가', '직장인',
    '대학생', '취준생', '신혼부부', '싱글라이프', '미니멀', '빈티지', '감성', '힐링'
]

SUFFIXES = ['', '_official', '_daily', '_log', '_story', '_life', '_gram', '_note', '_diary', '_blog', '_kr', '_official_', '2024', '2025', '_', '__']

REGIONS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '수원', '성남', '고양', '용인', '창원', '청주', '천안', '전주', '포항', '김해']

KEYWORDS = [
    '맛집 추천', '여행 코스', '육아 팁', '다이어트 식단', '인테리어', '자기계발', '재테크',
    '뷰티 팁', '운동 루틴', '독서 추천', '카페 추천', '데이트 코스', '반려동물', '요리 레시피',
    '패션 코디', '헬스 루틴', '홈트레이닝', '피부 관리', '헤어 스타일', '네일 아트',
    '캠핑 장비', '등산 코스', '서핑 스팟', '골프 팁', '러닝 코스', '요가 자세',
    '주식 투자', '부동산 정보', '창업 아이디어', '부업 추천', '절약 팁', '가계부',
    '영화 리뷰', '드라마 추천', '음악 플레이리스트', '게임 리뷰', '신작 소개', '웹툰 추천'
]

COMMENTS = [
    "이 기능 진짜 좋네요!",
    "덕분에 상위노출 됐어요 ㅠㅠ",
    "매일 체크하고 있어요",
    "레벨업 했습니다!!",
    "추천합니다 👍",
    "키워드 분석 최고예요",
    "블로그 지수 많이 올랐어요",
    "프로 결제 후회 없어요",
    "처음엔 반신반의했는데 대박!",
    "친구한테도 추천했어요",
    "상위노출 비법이 여기 있었네요",
    "분석 결과가 정확해요",
    "매일 꾸준히 하니까 효과가 보여요",
    "이거 진짜 필수템이에요",
    "블로그 운영 필수 도구!",
    "초보자도 쉽게 사용할 수 있어요",
    "고객센터 응대도 친절해요",
    "가격 대비 만족도 최고",
    "경쟁사 분석할 때 유용해요",
    "트래픽 2배 늘었어요!",
]

ACHIEVEMENTS = [
    "첫 분석 완료",
    "10회 분석 달성",
    "50회 분석 마스터",
    "키워드 마스터",
    "꾸준한 블로거",
    "상위 10% 진입",
    "7일 연속 접속",
    "30일 연속 접속",
    "Pro 회원 등극",
    "블로그 레벨업",
]


def generate_nickname() -> str:
    """랜덤 닉네임 생성"""
    pattern = random.choice([1, 2, 3, 4, 5])

    if pattern == 1:
        # 성씨 + 주제
        surname = random.choice(SURNAMES)
        prefix = random.choice(PREFIXES)
        return f"{prefix}{surname}씨"
    elif pattern == 2:
        # 주제 + 숫자
        prefix = random.choice(PREFIXES)
        num = random.randint(1, 9999)
        return f"{prefix}{num}"
    elif pattern == 3:
        # 영문 스타일
        prefix = random.choice(PREFIXES)
        suffix = random.choice(SUFFIXES)
        return f"{prefix}{suffix}"
    elif pattern == 4:
        # 지역 + 주제
        region = random.choice(REGIONS)
        prefix = random.choice(PREFIXES)
        return f"{region}{prefix}"
    else:
        # 순수 주제
        prefix = random.choice(PREFIXES)
        suffix = random.choice(['님', '맘', '파파', '언니', '오빠', '씨', ''])
        return f"{prefix}{suffix}"


def generate_blog_id() -> str:
    """랜덤 블로그 ID 생성"""
    pattern = random.choice([1, 2, 3])

    if pattern == 1:
        prefix = random.choice(PREFIXES).lower().replace(' ', '')
        num = random.randint(1, 9999)
        return f"{prefix}{num}"
    elif pattern == 2:
        words = ['happy', 'lovely', 'sweet', 'cool', 'nice', 'good', 'best', 'my', 'the', 'real']
        word = random.choice(words)
        prefix = random.choice(PREFIXES).lower().replace(' ', '')
        return f"{word}_{prefix}"
    else:
        import string
        chars = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
        return f"blog_{chars}"


class SocialProofDB:
    """소셜 프루프 데이터베이스 클래스"""

    def __init__(self, db_path: str = SOCIAL_PROOF_DB_PATH):
        self.db_path = db_path
        self._ensure_db_exists()
        self._init_tables()

    def _ensure_db_exists(self):
        """DB 디렉토리 생성"""
        db_dir = os.path.dirname(self.db_path)
        if db_dir and not os.path.exists(db_dir):
            try:
                os.makedirs(db_dir, exist_ok=True)
            except Exception as e:
                logger.warning(f"Could not create db directory: {e}")

    def _get_connection(self):
        """DB 연결"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_tables(self):
        """테이블 초기화"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 활동 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS activities (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    activity_type TEXT NOT NULL,
                    nickname TEXT NOT NULL,
                    blog_id TEXT,
                    message TEXT NOT NULL,
                    detail TEXT,
                    icon TEXT,
                    color TEXT,
                    bg_color TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 통계 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT NOT NULL UNIQUE,
                    total_users INTEGER DEFAULT 52341,
                    daily_analyses INTEGER DEFAULT 0,
                    peak_online INTEGER DEFAULT 1247,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 인덱스 생성
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(activity_type)")

            conn.commit()
            logger.info("Social proof tables initialized")
        finally:
            conn.close()

    def generate_activity(self) -> Dict[str, Any]:
        """랜덤 활동 생성 및 저장"""
        nickname = generate_nickname()
        blog_id = generate_blog_id()

        # 활동 유형별 가중치
        activity_types = [
            ('analysis_complete', 25),
            ('analysis_check', 20),
            ('keyword_search', 15),
            ('level_up', 10),
            ('tier_up', 8),
            ('pro_upgrade', 5),
            ('comment', 12),
            ('review', 8),
            ('new_user', 5),
            ('achievement', 5),
            ('daily_streak', 4),
            ('top_ranking', 3),
        ]

        # 가중치 기반 선택
        total_weight = sum(w for _, w in activity_types)
        rand = random.random() * total_weight
        cumulative = 0
        selected_type = 'analysis_complete'

        for atype, weight in activity_types:
            cumulative += weight
            if rand <= cumulative:
                selected_type = atype
                break

        # 활동 유형별 메시지 생성
        activity = self._create_activity_message(selected_type, nickname, blog_id)

        # DB 저장
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO activities (activity_type, nickname, blog_id, message, detail, icon, color, bg_color)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                activity['type'],
                activity['nickname'],
                activity.get('blog_id'),
                activity['message'],
                activity.get('detail'),
                activity.get('icon'),
                activity.get('color'),
                activity.get('bg_color')
            ))
            activity['id'] = cursor.lastrowid
            activity['created_at'] = datetime.now().isoformat()
            conn.commit()
        finally:
            conn.close()

        return activity

    def _create_activity_message(self, activity_type: str, nickname: str, blog_id: str) -> Dict[str, Any]:
        """활동 유형별 메시지 생성"""

        if activity_type == 'analysis_complete':
            return {
                'type': activity_type,
                'nickname': nickname,
                'blog_id': blog_id,
                'message': f"{nickname}님이 블로그 분석을 완료했습니다",
                'detail': f"Lv.{random.randint(3, 10)}",
                'icon': 'Search',
                'color': 'text-blue-600',
                'bg_color': 'bg-blue-50'
            }

        elif activity_type == 'analysis_check':
            return {
                'type': activity_type,
                'nickname': nickname,
                'blog_id': blog_id,
                'message': f"{nickname}님이 블로그 지수를 확인했습니다",
                'detail': f"{random.uniform(50, 85):.1f}점",
                'icon': 'Target',
                'color': 'text-cyan-600',
                'bg_color': 'bg-cyan-50'
            }

        elif activity_type == 'keyword_search':
            keyword = random.choice(KEYWORDS)
            return {
                'type': activity_type,
                'nickname': nickname,
                'message': f'{nickname}님이 "{keyword}" 키워드를 분석 중',
                'icon': 'BookOpen',
                'color': 'text-purple-600',
                'bg_color': 'bg-purple-50'
            }

        elif activity_type == 'level_up':
            level = random.randint(4, 10)
            return {
                'type': activity_type,
                'nickname': nickname,
                'message': f"{nickname}님이 Lv.{level}을 달성했습니다!",
                'detail': '축하드려요!',
                'icon': 'TrendingUp',
                'color': 'text-green-600',
                'bg_color': 'bg-green-50'
            }

        elif activity_type == 'tier_up':
            tier = random.choice(['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'])
            return {
                'type': activity_type,
                'nickname': nickname,
                'message': f"{nickname}님이 {tier} 티어로 승급!",
                'icon': 'Trophy',
                'color': 'text-yellow-600',
                'bg_color': 'bg-yellow-50'
            }

        elif activity_type == 'pro_upgrade':
            return {
                'type': activity_type,
                'nickname': nickname,
                'message': f"{nickname}님이 Pro 플랜으로 업그레이드했습니다",
                'detail': '프리미엄 회원',
                'icon': 'Crown',
                'color': 'text-amber-600',
                'bg_color': 'bg-amber-50'
            }

        elif activity_type == 'comment':
            comment = random.choice(COMMENTS)
            return {
                'type': activity_type,
                'nickname': nickname,
                'message': f'{nickname}님: "{comment}"',
                'icon': 'MessageCircle',
                'color': 'text-pink-600',
                'bg_color': 'bg-pink-50'
            }

        elif activity_type == 'review':
            stars = random.randint(4, 5)
            return {
                'type': activity_type,
                'nickname': nickname,
                'message': f"{nickname}님이 후기를 남겼습니다",
                'detail': '⭐' * stars,
                'icon': 'Star',
                'color': 'text-orange-600',
                'bg_color': 'bg-orange-50'
            }

        elif activity_type == 'new_user':
            return {
                'type': activity_type,
                'nickname': nickname,
                'message': f"{nickname}님이 블랭크에 가입했습니다",
                'detail': '환영합니다!',
                'icon': 'Sparkles',
                'color': 'text-indigo-600',
                'bg_color': 'bg-indigo-50'
            }

        elif activity_type == 'achievement':
            achievement = random.choice(ACHIEVEMENTS)
            return {
                'type': activity_type,
                'nickname': nickname,
                'message': f'{nickname}님이 "{achievement}" 업적 달성!',
                'icon': 'Award',
                'color': 'text-emerald-600',
                'bg_color': 'bg-emerald-50'
            }

        elif activity_type == 'daily_streak':
            days = random.randint(3, 30)
            return {
                'type': activity_type,
                'nickname': nickname,
                'message': f"{nickname}님이 {days}일 연속 접속 중!",
                'icon': 'Zap',
                'color': 'text-red-600',
                'bg_color': 'bg-red-50'
            }

        elif activity_type == 'top_ranking':
            rank = random.randint(1, 50)
            return {
                'type': activity_type,
                'nickname': nickname,
                'message': f"{nickname}님이 주간 랭킹 {rank}위 진입!",
                'icon': 'Rocket',
                'color': 'text-violet-600',
                'bg_color': 'bg-violet-50'
            }

        # 기본값
        return {
            'type': 'analysis_complete',
            'nickname': nickname,
            'message': f"{nickname}님이 활동했습니다",
            'icon': 'Activity',
            'color': 'text-gray-600',
            'bg_color': 'bg-gray-50'
        }

    def get_recent_activities(self, limit: int = 20) -> List[Dict[str, Any]]:
        """최근 활동 조회"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM activities
                ORDER BY created_at DESC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def get_stats(self) -> Dict[str, Any]:
        """통계 조회"""
        today = datetime.now().strftime('%Y-%m-%d')
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 오늘 통계 가져오기 (없으면 생성)
            cursor.execute("SELECT * FROM stats WHERE date = ?", (today,))
            row = cursor.fetchone()

            if row:
                stats = dict(row)
            else:
                # 새 통계 생성
                cursor.execute("""
                    INSERT INTO stats (date, total_users, daily_analyses, peak_online)
                    VALUES (?, ?, ?, ?)
                """, (today, 52341, 0, 1247))
                conn.commit()
                stats = {
                    'date': today,
                    'total_users': 52341,
                    'daily_analyses': 0,
                    'peak_online': 1247
                }

            # 현재 온라인 수 (피크의 60-100%)
            current_online = int(stats['peak_online'] * random.uniform(0.6, 1.0))

            return {
                'current_online': current_online,
                'daily_analyses': stats['daily_analyses'],
                'total_users': stats['total_users'],
                'peak_online': stats['peak_online']
            }
        finally:
            conn.close()

    def increment_stats(self, analyses: int = 1, new_users: int = 0):
        """통계 증가"""
        today = datetime.now().strftime('%Y-%m-%d')
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 오늘 통계 업데이트 또는 생성
            cursor.execute("""
                INSERT INTO stats (date, total_users, daily_analyses, peak_online)
                VALUES (?, 52341, ?, 1247)
                ON CONFLICT(date) DO UPDATE SET
                    daily_analyses = daily_analyses + ?,
                    total_users = total_users + ?,
                    updated_at = CURRENT_TIMESTAMP
            """, (today, analyses, analyses, new_users))
            conn.commit()
        finally:
            conn.close()

    def cleanup_old_activities(self, days: int = 7):
        """오래된 활동 정리"""
        cutoff = datetime.now() - timedelta(days=days)
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                DELETE FROM activities
                WHERE created_at < ?
            """, (cutoff.isoformat(),))
            deleted = cursor.rowcount
            conn.commit()
            logger.info(f"Cleaned up {deleted} old activities")
            return deleted
        finally:
            conn.close()


# 싱글톤 인스턴스
_db_instance = None

def get_social_proof_db() -> SocialProofDB:
    """소셜 프루프 DB 인스턴스 반환"""
    global _db_instance
    if _db_instance is None:
        _db_instance = SocialProofDB()
    return _db_instance
