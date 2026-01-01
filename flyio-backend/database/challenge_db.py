"""
블로그 챌린지 데이터베이스 모듈
30일 챌린지 진행 상황, 미션, 게이미피케이션 관리
"""
import sqlite3
import json
import os
from datetime import datetime, date, timedelta
from contextlib import contextmanager
from typing import Optional, List, Dict, Any

# 데이터베이스 경로
DB_PATH = os.environ.get("CHALLENGE_DB_PATH", "/app/data/challenge.db")

# 레벨 시스템 정의
LEVEL_REQUIREMENTS = {
    1: {"name": "새싹 블로거", "min_xp": 0},
    2: {"name": "성장 블로거", "min_xp": 500},
    3: {"name": "전략 블로거", "min_xp": 1500},
    4: {"name": "인플루언서 블로거", "min_xp": 3500},
    5: {"name": "마스터 블로거", "min_xp": 6500}
}

# 배지 정의
DEFAULT_BADGES = [
    # 스트릭 배지
    {"id": "streak_3", "name": "First Fire", "description": "3일 연속 활동", "icon": "🔥", "category": "streak", "requirement": {"type": "streak", "value": 3}, "xp_reward": 50},
    {"id": "streak_7", "name": "Week Warrior", "description": "7일 연속 활동", "icon": "🔥🔥", "category": "streak", "requirement": {"type": "streak", "value": 7}, "xp_reward": 100},
    {"id": "streak_14", "name": "Two Week Champion", "description": "14일 연속 활동", "icon": "🔥🔥🔥", "category": "streak", "requirement": {"type": "streak", "value": 14}, "xp_reward": 200},
    {"id": "streak_30", "name": "Monthly Master", "description": "30일 연속 활동", "icon": "💪", "category": "streak", "requirement": {"type": "streak", "value": 30}, "xp_reward": 500},

    # 마일스톤 배지
    {"id": "post_1", "name": "First Post", "description": "첫 글 작성", "icon": "✍️", "category": "milestone", "requirement": {"type": "posts", "value": 1}, "xp_reward": 100},
    {"id": "post_10", "name": "Getting Started", "description": "10개 글 작성", "icon": "📝", "category": "milestone", "requirement": {"type": "posts", "value": 10}, "xp_reward": 200},
    {"id": "post_50", "name": "Prolific Writer", "description": "50개 글 작성", "icon": "📚", "category": "milestone", "requirement": {"type": "posts", "value": 50}, "xp_reward": 500},
    {"id": "post_100", "name": "Centurion", "description": "100개 글 작성", "icon": "🏆", "category": "milestone", "requirement": {"type": "posts", "value": 100}, "xp_reward": 1000},

    # 학습 배지
    {"id": "learn_first", "name": "Student", "description": "첫 학습 완료", "icon": "📖", "category": "learning", "requirement": {"type": "lessons", "value": 1}, "xp_reward": 50},
    {"id": "learn_all", "name": "Graduate", "description": "전체 학습 완료", "icon": "🎓", "category": "learning", "requirement": {"type": "lessons", "value": 30}, "xp_reward": 300},
    {"id": "seo_master", "name": "SEO Expert", "description": "SEO 관련 학습 완료", "icon": "🧠", "category": "learning", "requirement": {"type": "seo_lessons", "value": 5}, "xp_reward": 200},

    # 특별 배지
    {"id": "early_bird", "name": "Early Bird", "description": "새벽 5-7시 글 발행", "icon": "🌅", "category": "special", "requirement": {"type": "time_range", "start": 5, "end": 7}, "xp_reward": 50},
    {"id": "night_owl", "name": "Night Owl", "description": "밤 11시-1시 글 발행", "icon": "🌙", "category": "special", "requirement": {"type": "time_range", "start": 23, "end": 1}, "xp_reward": 50},
    {"id": "speed_writer", "name": "Speed Writer", "description": "30분 내 글 완성", "icon": "⚡", "category": "special", "requirement": {"type": "speed", "minutes": 30}, "xp_reward": 100},
    {"id": "top_ranker", "name": "Top Ranker", "description": "상위 10위 진입", "icon": "🎯", "category": "special", "requirement": {"type": "rank", "value": 10}, "xp_reward": 200},
]

# 30일 챌린지 콘텐츠
CHALLENGE_CONTENT = {
    # Week 1: 기초 다지기
    1: {
        "week": 1, "theme": "기초 다지기",
        "learn": {"title": "블로그란 무엇인가", "duration": 5, "content": "블로그의 정의와 종류, 블로그가 주는 가치에 대해 알아봅니다."},
        "mission": {"title": "블로그 주제 3개 적기", "description": "내가 쓰고 싶은 블로그 주제를 3개 이상 적어보세요.", "type": "write"},
        "tip": "블로그는 나만의 온라인 공간입니다. 부담 갖지 말고 시작해보세요!",
        "xp": 50
    },
    2: {
        "week": 1, "theme": "기초 다지기",
        "learn": {"title": "좋은 블로그의 조건", "duration": 5, "content": "성공적인 블로그의 공통점과 좋은 블로그를 만드는 요소를 알아봅니다."},
        "mission": {"title": "롤모델 블로그 1개 분석", "description": "내가 좋아하는 블로그 하나를 선정하고 왜 좋은지 분석해보세요.", "type": "analyze"},
        "tip": "좋은 블로그를 많이 보면 자연스럽게 감이 생깁니다.",
        "xp": 50
    },
    3: {
        "week": 1, "theme": "기초 다지기",
        "learn": {"title": "첫 글 작성법", "duration": 7, "content": "첫 글을 어떻게 시작해야 할지, 무엇을 써야 할지 알아봅니다."},
        "mission": {"title": "자기소개 글 작성", "description": "블로그에 자기소개 글을 작성해보세요. 나는 누구인지, 왜 블로그를 시작했는지 써보세요.", "type": "write"},
        "tip": "완벽한 글은 없습니다. 일단 쓰고 나중에 수정하면 됩니다.",
        "xp": 100
    },
    4: {
        "week": 1, "theme": "기초 다지기",
        "learn": {"title": "제목의 중요성", "duration": 5, "content": "클릭을 부르는 제목 작성법과 제목이 왜 중요한지 알아봅니다."},
        "mission": {"title": "제목 5개 연습", "description": "같은 주제로 다양한 스타일의 제목 5개를 만들어보세요.", "type": "practice"},
        "tip": "제목은 글의 얼굴입니다. 80%의 사람들은 제목만 보고 클릭을 결정합니다.",
        "xp": 50
    },
    5: {
        "week": 1, "theme": "기초 다지기",
        "learn": {"title": "썸네일 기초", "duration": 5, "content": "눈길을 끄는 썸네일 만드는 방법을 알아봅니다."},
        "mission": {"title": "썸네일 만들어보기", "description": "캔바나 미리캔버스로 블로그 썸네일을 하나 만들어보세요.", "type": "create"},
        "tip": "깔끔한 디자인이 화려한 디자인보다 효과적입니다.",
        "xp": 50
    },
    6: {
        "week": 1, "theme": "기초 다지기",
        "learn": {"title": "카테고리 설정", "duration": 5, "content": "블로그 카테고리를 어떻게 구성하면 좋을지 알아봅니다."},
        "mission": {"title": "블로그 구조 정리", "description": "내 블로그의 카테고리를 3-5개로 정리해보세요.", "type": "organize"},
        "tip": "카테고리는 너무 많으면 복잡해지고, 너무 적으면 체계가 없어 보입니다.",
        "xp": 50
    },
    7: {
        "week": 1, "theme": "기초 다지기",
        "learn": {"title": "1주차 정리", "duration": 3, "content": "첫 주에 배운 내용을 정리하고 다음 주를 준비합니다."},
        "mission": {"title": "첫 주 소감 작성", "description": "1주일 동안 느낀 점과 배운 점을 블로그에 작성해보세요.", "type": "write"},
        "tip": "회고는 성장의 시작입니다. 작은 변화도 기록해두세요.",
        "xp": 100
    },

    # Week 2: 습관 형성
    8: {
        "week": 2, "theme": "습관 형성",
        "learn": {"title": "글감 찾는 법", "duration": 5, "content": "일상에서 글감을 찾는 다양한 방법을 알아봅니다."},
        "mission": {"title": "글감 10개 리스트업", "description": "앞으로 쓸 수 있는 글감을 10개 이상 리스트업해보세요.", "type": "brainstorm"},
        "tip": "글감은 어디에나 있습니다. 항상 메모하는 습관을 들이세요.",
        "xp": 50
    },
    9: {
        "week": 2, "theme": "습관 형성",
        "learn": {"title": "일상 글쓰기", "duration": 5, "content": "일상을 콘텐츠로 만드는 방법을 알아봅니다."},
        "mission": {"title": "오늘 있었던 일 500자", "description": "오늘 하루 중 인상 깊었던 일을 500자 이상으로 써보세요.", "type": "write"},
        "tip": "소소한 일상도 누군가에게는 흥미로운 이야기가 됩니다.",
        "xp": 100
    },
    10: {
        "week": 2, "theme": "습관 형성",
        "learn": {"title": "정보성 글쓰기", "duration": 7, "content": "유용한 정보를 전달하는 글 작성법을 알아봅니다."},
        "mission": {"title": "내가 아는 것 공유하기", "description": "내가 잘 아는 분야의 정보를 정리해서 공유해보세요.", "type": "write"},
        "tip": "당신이 아는 것은 누군가에게 귀중한 정보입니다.",
        "xp": 100
    },
    11: {
        "week": 2, "theme": "습관 형성",
        "learn": {"title": "리뷰 글쓰기", "duration": 5, "content": "효과적인 리뷰 글 작성법을 알아봅니다."},
        "mission": {"title": "최근 구매품 리뷰", "description": "최근에 구매한 제품의 리뷰를 작성해보세요.", "type": "write"},
        "tip": "솔직한 리뷰가 가장 신뢰받습니다.",
        "xp": 100
    },
    12: {
        "week": 2, "theme": "습관 형성",
        "learn": {"title": "맛집 글쓰기", "duration": 5, "content": "맛집 리뷰를 효과적으로 작성하는 방법을 알아봅니다."},
        "mission": {"title": "최근 방문한 식당 리뷰", "description": "최근 방문한 식당의 리뷰를 작성해보세요.", "type": "write"},
        "tip": "사진은 최소 10장 이상, 메뉴와 가격 정보는 필수입니다.",
        "xp": 100
    },
    13: {
        "week": 2, "theme": "습관 형성",
        "learn": {"title": "글쓰기 루틴 만들기", "duration": 5, "content": "지속 가능한 글쓰기 습관을 만드는 방법을 알아봅니다."},
        "mission": {"title": "나만의 루틴 정하기", "description": "매일 글을 쓸 시간과 장소를 정해보세요.", "type": "plan"},
        "tip": "같은 시간, 같은 장소에서 쓰면 습관이 더 쉽게 형성됩니다.",
        "xp": 50
    },
    14: {
        "week": 2, "theme": "습관 형성",
        "learn": {"title": "2주차 정리", "duration": 3, "content": "2주 동안의 성장을 돌아보고 개선점을 찾습니다."},
        "mission": {"title": "2주차 소감 + 개선점", "description": "2주간 느낀 점과 앞으로 개선하고 싶은 점을 작성해보세요.", "type": "write"},
        "tip": "매주 회고하면 성장 속도가 2배가 됩니다.",
        "xp": 100
    },

    # Week 3: 기술 향상
    15: {
        "week": 3, "theme": "기술 향상",
        "learn": {"title": "SEO 기초", "duration": 7, "content": "검색엔진 최적화(SEO)의 기본 개념을 알아봅니다."},
        "mission": {"title": "키워드 검색해보기", "description": "블랭크의 키워드 검색 기능으로 관심 키워드를 5개 검색해보세요.", "type": "research"},
        "tip": "SEO는 어렵지 않습니다. 기본만 지켜도 큰 차이가 납니다.",
        "xp": 50
    },
    16: {
        "week": 3, "theme": "기술 향상",
        "learn": {"title": "제목 최적화", "duration": 5, "content": "검색에 잘 노출되는 제목 작성법을 알아봅니다."},
        "mission": {"title": "AI 제목 생성 활용", "description": "블랭크의 AI 제목 생성 기능을 사용해 제목을 만들어보세요.", "type": "practice"},
        "tip": "키워드가 앞에 오는 제목이 검색에 유리합니다.",
        "xp": 100
    },
    17: {
        "week": 3, "theme": "기술 향상",
        "learn": {"title": "본문 구조화", "duration": 7, "content": "읽기 좋은 글 구조를 만드는 방법을 알아봅니다."},
        "mission": {"title": "소제목 활용 글쓰기", "description": "소제목(H2, H3)을 활용해 체계적인 글을 작성해보세요.", "type": "write"},
        "tip": "소제목은 독자가 글을 훑어볼 때 큰 도움이 됩니다.",
        "xp": 100
    },
    18: {
        "week": 3, "theme": "기술 향상",
        "learn": {"title": "이미지 최적화", "duration": 5, "content": "블로그에서 이미지를 효과적으로 활용하는 방법을 알아봅니다."},
        "mission": {"title": "이미지 10장 이상 포함 글", "description": "고품질 이미지 10장 이상을 포함한 글을 작성해보세요.", "type": "write"},
        "tip": "이미지는 글의 가독성을 높이고 체류시간을 늘립니다.",
        "xp": 100
    },
    19: {
        "week": 3, "theme": "기술 향상",
        "learn": {"title": "해시태그 전략", "duration": 5, "content": "효과적인 해시태그 사용법을 알아봅니다."},
        "mission": {"title": "해시태그 추천 활용", "description": "블랭크의 해시태그 추천 기능을 활용해 글에 적용해보세요.", "type": "practice"},
        "tip": "해시태그는 10-15개가 적당합니다.",
        "xp": 50
    },
    20: {
        "week": 3, "theme": "기술 향상",
        "learn": {"title": "발행 시간", "duration": 5, "content": "최적의 글 발행 시간을 찾는 방법을 알아봅니다."},
        "mission": {"title": "최적 시간에 발행", "description": "블랭크의 최적 발행 시간 분석을 참고해 글을 발행해보세요.", "type": "publish"},
        "tip": "일반적으로 아침 7-9시, 점심 12-1시, 저녁 7-9시가 좋습니다.",
        "xp": 50
    },
    21: {
        "week": 3, "theme": "기술 향상",
        "learn": {"title": "3주차 정리", "duration": 3, "content": "SEO와 최적화 기술을 정리합니다."},
        "mission": {"title": "3주차 성장 점검", "description": "배운 기술을 얼마나 적용했는지 점검해보세요.", "type": "review"},
        "tip": "기술은 반복해야 체득됩니다.",
        "xp": 100
    },

    # Week 4: 성장 가속
    22: {
        "week": 4, "theme": "성장 가속",
        "learn": {"title": "키워드 분석", "duration": 7, "content": "블루오션 키워드를 찾는 방법을 알아봅니다."},
        "mission": {"title": "블루오션 키워드 찾기", "description": "블랭크의 블루오션 키워드 기능으로 경쟁이 낮은 키워드를 찾아보세요.", "type": "research"},
        "tip": "검색량은 많고 경쟁은 적은 키워드가 블루오션입니다.",
        "xp": 100
    },
    23: {
        "week": 4, "theme": "성장 가속",
        "learn": {"title": "경쟁 분석", "duration": 7, "content": "상위 노출 글을 분석하는 방법을 알아봅니다."},
        "mission": {"title": "상위글 분석하기", "description": "타겟 키워드로 검색해서 상위 5개 글의 특징을 분석해보세요.", "type": "analyze"},
        "tip": "상위글의 공통점을 찾으면 방향이 보입니다.",
        "xp": 100
    },
    24: {
        "week": 4, "theme": "성장 가속",
        "learn": {"title": "상위노출 전략", "duration": 10, "content": "상위 노출을 위한 전략을 알아봅니다."},
        "mission": {"title": "키워드 타겟 글 작성", "description": "분석한 키워드를 타겟으로 상위노출을 노리는 글을 작성해보세요.", "type": "write"},
        "tip": "상위노출은 기술 + 시간 + 꾸준함의 결과입니다.",
        "xp": 150
    },
    25: {
        "week": 4, "theme": "성장 가속",
        "learn": {"title": "방문자 분석", "duration": 5, "content": "블로그 통계를 읽는 방법을 알아봅니다."},
        "mission": {"title": "통계 확인 & 분석", "description": "네이버 블로그 통계를 확인하고 인사이트를 정리해보세요.", "type": "analyze"},
        "tip": "숫자는 거짓말하지 않습니다. 데이터가 방향을 알려줍니다.",
        "xp": 50
    },
    26: {
        "week": 4, "theme": "성장 가속",
        "learn": {"title": "콘텐츠 리사이클링", "duration": 5, "content": "기존 글을 업데이트해서 재활용하는 방법을 알아봅니다."},
        "mission": {"title": "기존 글 업데이트", "description": "과거에 쓴 글 하나를 선택해 내용을 보강하고 다시 발행해보세요.", "type": "update"},
        "tip": "좋은 글은 한 번으로 끝나지 않습니다.",
        "xp": 100
    },
    27: {
        "week": 4, "theme": "성장 가속",
        "learn": {"title": "시리즈 기획", "duration": 5, "content": "시리즈 글을 기획하는 방법을 알아봅니다."},
        "mission": {"title": "시리즈 글 1편 작성", "description": "3편 이상의 시리즈를 기획하고 첫 번째 글을 작성해보세요.", "type": "write"},
        "tip": "시리즈 글은 구독자를 만드는 좋은 방법입니다.",
        "xp": 150
    },
    28: {
        "week": 4, "theme": "성장 가속",
        "learn": {"title": "4주차 정리", "duration": 3, "content": "성장 가속 기술을 정리합니다."},
        "mission": {"title": "4주차 성과 정리", "description": "이번 주 성과와 배운 점을 정리해보세요.", "type": "review"},
        "tip": "기록은 성장의 증거입니다.",
        "xp": 100
    },

    # Week 5: 마무리
    29: {
        "week": 5, "theme": "마무리",
        "learn": {"title": "30일 되돌아보기", "duration": 10, "content": "30일 동안의 여정을 되돌아봅니다."},
        "mission": {"title": "전체 회고록 작성", "description": "30일 챌린지를 통해 변화한 점, 배운 점, 앞으로의 다짐을 작성해보세요.", "type": "write"},
        "tip": "30일의 기록이 앞으로 1년을 이끌어줄 것입니다.",
        "xp": 200
    },
    30: {
        "week": 5, "theme": "마무리",
        "learn": {"title": "다음 목표 설정", "duration": 5, "content": "챌린지 이후의 목표를 설정합니다."},
        "mission": {"title": "앞으로의 계획 작성", "description": "다음 30일, 100일, 1년의 블로그 목표를 세워보세요.", "type": "plan"},
        "tip": "축하합니다! 당신은 이미 블로거입니다. 🎉",
        "xp": 200
    }
}


@contextmanager
def get_connection():
    """데이터베이스 연결 컨텍스트 매니저"""
    # 디렉토리 생성
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_challenge_tables():
    """챌린지 관련 테이블 초기화"""
    with get_connection() as conn:
        cursor = conn.cursor()

        # 1. 챌린지 진행 상황 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS challenge_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                challenge_type TEXT DEFAULT '30day',
                current_day INTEGER DEFAULT 1,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_activity_at DATETIME,
                status TEXT DEFAULT 'active',
                completed_at DATETIME,
                UNIQUE(user_id, challenge_type)
            )
        """)

        # 2. 일일 미션 완료 기록 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS daily_missions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                day_number INTEGER NOT NULL,
                mission_id TEXT NOT NULL,
                mission_type TEXT NOT NULL,
                completed BOOLEAN DEFAULT FALSE,
                completed_at DATETIME,
                xp_earned INTEGER DEFAULT 0,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, day_number, mission_id)
            )
        """)

        # 3. 사용자 게이미피케이션 상태 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_gamification (
                user_id INTEGER PRIMARY KEY,
                level INTEGER DEFAULT 1,
                total_xp INTEGER DEFAULT 0,
                current_streak INTEGER DEFAULT 0,
                longest_streak INTEGER DEFAULT 0,
                last_activity_date DATE,
                total_posts_written INTEGER DEFAULT 0,
                total_lessons_completed INTEGER DEFAULT 0,
                badges TEXT DEFAULT '[]',
                achievements TEXT DEFAULT '[]',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 4. 배지 정의 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS badges (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                icon TEXT,
                category TEXT,
                requirement TEXT,
                xp_reward INTEGER DEFAULT 0
            )
        """)

        # 5. 글쓰기 로그 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS writing_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                day_number INTEGER,
                mission_id TEXT,
                title TEXT,
                content_preview TEXT,
                word_count INTEGER DEFAULT 0,
                blog_url TEXT,
                submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 6. 동기부여 콘텐츠 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS motivations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                content TEXT NOT NULL,
                author TEXT,
                category TEXT,
                is_active BOOLEAN DEFAULT TRUE
            )
        """)

        # 인덱스 생성
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_challenge_user ON challenge_progress(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_missions_user_day ON daily_missions(user_id, day_number)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_gamification_xp ON user_gamification(total_xp DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_writing_user ON writing_log(user_id)")

        # 기본 배지 데이터 삽입
        for badge in DEFAULT_BADGES:
            cursor.execute("""
                INSERT OR IGNORE INTO badges (id, name, description, icon, category, requirement, xp_reward)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                badge["id"], badge["name"], badge["description"], badge["icon"],
                badge["category"], json.dumps(badge["requirement"]), badge["xp_reward"]
            ))

        # 기본 동기부여 콘텐츠 삽입
        motivations = [
            ("quote", "완벽을 기다리지 마세요. 일단 시작하세요.", "Unknown", "start"),
            ("quote", "글을 쓰는 것은 생각하는 것입니다.", "스티븐 킹", "writing"),
            ("quote", "매일 조금씩 쓰는 것이 가끔 많이 쓰는 것보다 낫습니다.", "Unknown", "habit"),
            ("quote", "블로그는 마라톤입니다. 스프린트가 아닙니다.", "Unknown", "persistence"),
            ("tip", "글을 쓸 때 완벽을 추구하지 마세요. 일단 쓰고 나중에 수정하면 됩니다.", None, "writing"),
            ("tip", "글감이 떠오르면 바로 메모하세요. 나중에 기억나지 않습니다.", None, "idea"),
            ("tip", "하루 30분만 투자해도 한 달이면 15시간입니다.", None, "habit"),
            ("tip", "독자의 입장에서 글을 읽어보세요. 무엇이 부족한지 보입니다.", None, "quality"),
            ("success", "6개월 동안 포기하지 않고 쓴 결과, 월 방문자 10만 명을 달성했습니다.", "블로거 A", "milestone"),
            ("success", "매일 한 편씩 쓰다 보니 1년 만에 400편이 쌓였습니다.", "블로거 B", "consistency"),
        ]

        for m in motivations:
            cursor.execute("""
                INSERT OR IGNORE INTO motivations (type, content, author, category)
                SELECT ?, ?, ?, ?
                WHERE NOT EXISTS (
                    SELECT 1 FROM motivations WHERE content = ?
                )
            """, (m[0], m[1], m[2], m[3], m[1]))

        conn.commit()


# ========== 챌린지 관련 함수 ==========

def start_challenge(user_id: int, challenge_type: str = "30day") -> Dict[str, Any]:
    """챌린지 시작"""
    with get_connection() as conn:
        cursor = conn.cursor()

        # 기존 진행 중인 챌린지 확인
        cursor.execute("""
            SELECT * FROM challenge_progress
            WHERE user_id = ? AND challenge_type = ? AND status = 'active'
        """, (user_id, challenge_type))

        existing = cursor.fetchone()
        if existing:
            return {"success": False, "message": "이미 진행 중인 챌린지가 있습니다.", "progress": dict(existing)}

        # 새 챌린지 시작
        cursor.execute("""
            INSERT INTO challenge_progress (user_id, challenge_type, current_day, started_at, last_activity_at, status)
            VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'active')
            ON CONFLICT(user_id, challenge_type) DO UPDATE SET
                current_day = 1,
                started_at = CURRENT_TIMESTAMP,
                last_activity_at = CURRENT_TIMESTAMP,
                status = 'active',
                completed_at = NULL
        """, (user_id, challenge_type))

        # 게이미피케이션 초기화
        cursor.execute("""
            INSERT OR IGNORE INTO user_gamification (user_id)
            VALUES (?)
        """, (user_id,))

        conn.commit()

        return {
            "success": True,
            "message": "챌린지가 시작되었습니다!",
            "day": 1,
            "content": CHALLENGE_CONTENT.get(1)
        }


def get_challenge_status(user_id: int, challenge_type: str = "30day") -> Optional[Dict[str, Any]]:
    """챌린지 상태 조회"""
    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT * FROM challenge_progress
            WHERE user_id = ? AND challenge_type = ?
        """, (user_id, challenge_type))

        progress = cursor.fetchone()
        if not progress:
            return None

        # 완료한 미션 수 조회
        cursor.execute("""
            SELECT COUNT(*) as completed_count
            FROM daily_missions
            WHERE user_id = ? AND completed = TRUE
        """, (user_id,))

        completed = cursor.fetchone()

        return {
            **dict(progress),
            "completed_missions": completed["completed_count"] if completed else 0,
            "total_days": 30,
            "progress_percent": round((progress["current_day"] - 1) / 30 * 100, 1)
        }


def get_today_missions(user_id: int, day: int = None) -> Dict[str, Any]:
    """오늘의 미션 조회"""
    with get_connection() as conn:
        cursor = conn.cursor()

        # 현재 진행 중인 일차 확인
        if day is None:
            cursor.execute("""
                SELECT current_day FROM challenge_progress
                WHERE user_id = ? AND status = 'active'
            """, (user_id,))
            result = cursor.fetchone()
            day = result["current_day"] if result else 1

        content = CHALLENGE_CONTENT.get(day)
        if not content:
            return {"error": "Invalid day", "day": day}

        # 미션 완료 여부 확인
        cursor.execute("""
            SELECT mission_id, completed, completed_at, xp_earned
            FROM daily_missions
            WHERE user_id = ? AND day_number = ?
        """, (user_id, day))

        completed_missions = {row["mission_id"]: dict(row) for row in cursor.fetchall()}

        return {
            "day": day,
            "week": content["week"],
            "theme": content["theme"],
            "learn": {
                **content["learn"],
                "completed": completed_missions.get(f"learn_{day}", {}).get("completed", False),
                "mission_id": f"learn_{day}"
            },
            "mission": {
                **content["mission"],
                "completed": completed_missions.get(f"mission_{day}", {}).get("completed", False),
                "mission_id": f"mission_{day}",
                "xp": content["xp"]
            },
            "tip": content["tip"],
            "total_xp": content["xp"] + 30  # 학습 30 XP + 미션 XP
        }


def complete_mission(user_id: int, day_number: int, mission_id: str, mission_type: str, notes: str = None) -> Dict[str, Any]:
    """미션 완료 처리"""
    with get_connection() as conn:
        cursor = conn.cursor()

        content = CHALLENGE_CONTENT.get(day_number)
        if not content:
            return {"success": False, "message": "잘못된 일차입니다."}

        # XP 계산
        if mission_type == "learn":
            xp = 30
        elif mission_type == "mission":
            xp = content["xp"]
        else:
            xp = 10

        # 미션 완료 처리
        cursor.execute("""
            INSERT INTO daily_missions (user_id, day_number, mission_id, mission_type, completed, completed_at, xp_earned, notes)
            VALUES (?, ?, ?, ?, TRUE, CURRENT_TIMESTAMP, ?, ?)
            ON CONFLICT(user_id, day_number, mission_id) DO UPDATE SET
                completed = TRUE,
                completed_at = CURRENT_TIMESTAMP,
                xp_earned = ?,
                notes = COALESCE(?, notes)
        """, (user_id, day_number, mission_id, mission_type, xp, notes, xp, notes))

        # 게이미피케이션 업데이트 (인라인 처리 - 중첩 연결 방지)
        cursor.execute("""
            INSERT INTO user_gamification (user_id, total_xp, level)
            VALUES (?, ?, 1)
            ON CONFLICT(user_id) DO UPDATE SET
                total_xp = total_xp + ?,
                updated_at = CURRENT_TIMESTAMP
        """, (user_id, xp, xp))

        # 레벨 업데이트
        cursor.execute("SELECT total_xp, level FROM user_gamification WHERE user_id = ?", (user_id,))
        gam_result = cursor.fetchone()
        if gam_result:
            current_xp = gam_result["total_xp"]
            new_level = 1
            for level, info in sorted(LEVEL_REQUIREMENTS.items(), reverse=True):
                if current_xp >= info["min_xp"]:
                    new_level = level
                    break
            if new_level != gam_result["level"]:
                cursor.execute("UPDATE user_gamification SET level = ? WHERE user_id = ?", (new_level, user_id))

        # 스트릭 업데이트 (인라인 처리)
        today = date.today().isoformat()
        cursor.execute("""
            SELECT current_streak, longest_streak, last_activity_date
            FROM user_gamification WHERE user_id = ?
        """, (user_id,))
        streak_result = cursor.fetchone()

        if streak_result:
            last_date = streak_result["last_activity_date"]
            current_streak = streak_result["current_streak"] or 0
            longest_streak = streak_result["longest_streak"] or 0

            if last_date != today:
                if last_date:
                    try:
                        last = datetime.strptime(last_date, "%Y-%m-%d").date()
                        diff = (date.today() - last).days
                        if diff == 1:
                            current_streak += 1
                        elif diff > 1:
                            current_streak = 1
                    except:
                        current_streak = 1
                else:
                    current_streak = 1

                longest_streak = max(longest_streak, current_streak)
                cursor.execute("""
                    UPDATE user_gamification
                    SET current_streak = ?, longest_streak = ?, last_activity_date = ?
                    WHERE user_id = ?
                """, (current_streak, longest_streak, today, user_id))

        # 오늘의 모든 미션 완료 여부 확인
        cursor.execute("""
            SELECT COUNT(*) as count FROM daily_missions
            WHERE user_id = ? AND day_number = ? AND completed = TRUE
        """, (user_id, day_number))

        completed_count = cursor.fetchone()["count"]

        # 2개 미션 모두 완료 시 다음 날로
        if completed_count >= 2:
            cursor.execute("""
                UPDATE challenge_progress
                SET current_day = MIN(current_day + 1, 31),
                    last_activity_at = CURRENT_TIMESTAMP,
                    status = CASE WHEN current_day >= 30 THEN 'completed' ELSE status END,
                    completed_at = CASE WHEN current_day >= 30 THEN CURRENT_TIMESTAMP ELSE completed_at END
                WHERE user_id = ? AND status = 'active'
            """, (user_id,))

            day_completed = True
        else:
            day_completed = False

        conn.commit()

    # 배지 체크 (별도 트랜잭션으로 처리)
    new_badges = check_badges(user_id)

    return {
        "success": True,
        "xp_earned": xp,
        "day_completed": day_completed,
        "new_badges": new_badges
    }


# ========== 게이미피케이션 함수 ==========

def add_xp(user_id: int, xp: int) -> Dict[str, Any]:
    """XP 추가 및 레벨업 체크"""
    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE user_gamification
            SET total_xp = total_xp + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        """, (xp, user_id))

        if cursor.rowcount == 0:
            cursor.execute("""
                INSERT INTO user_gamification (user_id, total_xp)
                VALUES (?, ?)
            """, (user_id, xp))

        # 현재 XP 조회
        cursor.execute("SELECT total_xp, level FROM user_gamification WHERE user_id = ?", (user_id,))
        result = cursor.fetchone()

        current_xp = result["total_xp"]
        current_level = result["level"]

        # 레벨업 체크
        new_level = current_level
        for level, info in sorted(LEVEL_REQUIREMENTS.items(), reverse=True):
            if current_xp >= info["min_xp"]:
                new_level = level
                break

        leveled_up = new_level > current_level
        if leveled_up:
            cursor.execute("""
                UPDATE user_gamification SET level = ? WHERE user_id = ?
            """, (new_level, user_id))

        conn.commit()

        return {
            "total_xp": current_xp,
            "level": new_level,
            "level_name": LEVEL_REQUIREMENTS[new_level]["name"],
            "leveled_up": leveled_up
        }


def update_streak(user_id: int) -> Dict[str, Any]:
    """스트릭 업데이트"""
    with get_connection() as conn:
        cursor = conn.cursor()

        today = date.today().isoformat()

        cursor.execute("""
            SELECT current_streak, longest_streak, last_activity_date
            FROM user_gamification WHERE user_id = ?
        """, (user_id,))

        result = cursor.fetchone()
        if not result:
            return {"current_streak": 1, "longest_streak": 1}

        last_date = result["last_activity_date"]
        current_streak = result["current_streak"]
        longest_streak = result["longest_streak"]

        if last_date == today:
            # 오늘 이미 활동함
            return {"current_streak": current_streak, "longest_streak": longest_streak}

        if last_date:
            last = datetime.strptime(last_date, "%Y-%m-%d").date()
            diff = (date.today() - last).days

            if diff == 1:
                # 연속
                current_streak += 1
            elif diff > 1:
                # 끊김
                current_streak = 1
        else:
            current_streak = 1

        longest_streak = max(longest_streak, current_streak)

        cursor.execute("""
            UPDATE user_gamification
            SET current_streak = ?,
                longest_streak = ?,
                last_activity_date = ?
            WHERE user_id = ?
        """, (current_streak, longest_streak, today, user_id))

        conn.commit()

        return {"current_streak": current_streak, "longest_streak": longest_streak}


def check_badges(user_id: int) -> List[Dict[str, Any]]:
    """배지 획득 체크"""
    new_badges = []
    total_xp_earned = 0

    with get_connection() as conn:
        cursor = conn.cursor()

        # 현재 사용자 상태 조회
        cursor.execute("""
            SELECT * FROM user_gamification WHERE user_id = ?
        """, (user_id,))

        user = cursor.fetchone()
        if not user:
            return []

        current_badges = json.loads(user["badges"]) if user["badges"] else []

        # 모든 배지 조회
        cursor.execute("SELECT * FROM badges")
        all_badges = cursor.fetchall()

        for badge in all_badges:
            if badge["id"] in current_badges:
                continue  # 이미 획득함

            requirement = json.loads(badge["requirement"])
            earned = False

            if requirement["type"] == "streak":
                if user["current_streak"] >= requirement["value"]:
                    earned = True
            elif requirement["type"] == "posts":
                if user["total_posts_written"] >= requirement["value"]:
                    earned = True
            elif requirement["type"] == "lessons":
                if user["total_lessons_completed"] >= requirement["value"]:
                    earned = True

            if earned:
                current_badges.append(badge["id"])
                total_xp_earned += badge["xp_reward"]
                new_badges.append({
                    "id": badge["id"],
                    "name": badge["name"],
                    "icon": badge["icon"],
                    "xp_reward": badge["xp_reward"]
                })

        if new_badges:
            # 배지와 XP를 동일 트랜잭션에서 업데이트 (중첩 연결 방지)
            cursor.execute("""
                UPDATE user_gamification
                SET badges = ?,
                    total_xp = total_xp + ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            """, (json.dumps(current_badges), total_xp_earned, user_id))

            # 레벨 업데이트
            cursor.execute("SELECT total_xp, level FROM user_gamification WHERE user_id = ?", (user_id,))
            gam_result = cursor.fetchone()
            if gam_result:
                current_xp = gam_result["total_xp"]
                new_level = 1
                for level, info in sorted(LEVEL_REQUIREMENTS.items(), reverse=True):
                    if current_xp >= info["min_xp"]:
                        new_level = level
                        break
                if new_level != gam_result["level"]:
                    cursor.execute("UPDATE user_gamification SET level = ? WHERE user_id = ?", (new_level, user_id))

            conn.commit()

    return new_badges


def get_gamification_profile(user_id: int) -> Dict[str, Any]:
    """게이미피케이션 프로필 조회"""
    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT * FROM user_gamification WHERE user_id = ?
        """, (user_id,))

        result = cursor.fetchone()
        if not result:
            return {
                "level": 1,
                "level_name": LEVEL_REQUIREMENTS[1]["name"],
                "total_xp": 0,
                "current_streak": 0,
                "longest_streak": 0,
                "badges": [],
                "next_level_xp": LEVEL_REQUIREMENTS[2]["min_xp"]
            }

        level = result["level"]
        next_level = min(level + 1, 5)

        return {
            "level": level,
            "level_name": LEVEL_REQUIREMENTS[level]["name"],
            "total_xp": result["total_xp"],
            "current_streak": result["current_streak"],
            "longest_streak": result["longest_streak"],
            "total_posts_written": result["total_posts_written"],
            "total_lessons_completed": result["total_lessons_completed"],
            "badges": json.loads(result["badges"]) if result["badges"] else [],
            "next_level_xp": LEVEL_REQUIREMENTS[next_level]["min_xp"] if next_level <= 5 else None,
            "xp_to_next_level": max(0, LEVEL_REQUIREMENTS[next_level]["min_xp"] - result["total_xp"]) if next_level <= 5 else 0
        }


def get_leaderboard(limit: int = 20) -> List[Dict[str, Any]]:
    """랭킹 조회"""
    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                g.user_id,
                g.level,
                g.total_xp,
                g.current_streak,
                g.badges
            FROM user_gamification g
            ORDER BY g.total_xp DESC
            LIMIT ?
        """, (limit,))

        results = []
        for i, row in enumerate(cursor.fetchall(), 1):
            badges = json.loads(row["badges"]) if row["badges"] else []
            results.append({
                "rank": i,
                "user_id": row["user_id"],
                "level": row["level"],
                "level_name": LEVEL_REQUIREMENTS[row["level"]]["name"],
                "total_xp": row["total_xp"],
                "current_streak": row["current_streak"],
                "badge_count": len(badges)
            })

        return results


def get_motivation() -> Dict[str, Any]:
    """랜덤 동기부여 콘텐츠 조회"""
    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT * FROM motivations
            WHERE is_active = TRUE
            ORDER BY RANDOM()
            LIMIT 1
        """)

        result = cursor.fetchone()
        if result:
            return dict(result)

        return {
            "type": "tip",
            "content": "오늘도 한 줄이라도 써보세요. 작은 시작이 큰 변화를 만듭니다.",
            "author": None
        }


def get_all_badges() -> List[Dict[str, Any]]:
    """모든 배지 목록 조회"""
    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM badges ORDER BY category, xp_reward")

        return [dict(row) for row in cursor.fetchall()]


def log_writing(user_id: int, day_number: int, mission_id: str, title: str,
                content_preview: str = None, word_count: int = 0, blog_url: str = None) -> int:
    """글쓰기 로그 기록"""
    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO writing_log (user_id, day_number, mission_id, title, content_preview, word_count, blog_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (user_id, day_number, mission_id, title, content_preview, word_count, blog_url))

        # 글 수 업데이트
        cursor.execute("""
            UPDATE user_gamification
            SET total_posts_written = total_posts_written + 1
            WHERE user_id = ?
        """, (user_id,))

        conn.commit()

        return cursor.lastrowid


def get_challenge_content(day: int) -> Optional[Dict[str, Any]]:
    """특정 일차 콘텐츠 조회"""
    return CHALLENGE_CONTENT.get(day)


def get_progress_calendar(user_id: int) -> List[Dict[str, Any]]:
    """캘린더 형식 진행 현황"""
    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT day_number, COUNT(*) as completed_count,
                   MAX(completed_at) as last_completed
            FROM daily_missions
            WHERE user_id = ? AND completed = TRUE
            GROUP BY day_number
        """, (user_id,))

        completed_days = {row["day_number"]: dict(row) for row in cursor.fetchall()}

        calendar = []
        for day in range(1, 31):
            content = CHALLENGE_CONTENT.get(day, {})
            completed = completed_days.get(day, {})

            calendar.append({
                "day": day,
                "week": content.get("week", 0),
                "theme": content.get("theme", ""),
                "completed": completed.get("completed_count", 0) >= 2,
                "partial": 0 < completed.get("completed_count", 0) < 2,
                "last_completed": completed.get("last_completed")
            })

        return calendar
