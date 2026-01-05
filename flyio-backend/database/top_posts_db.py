"""
Top Posts Analysis Database - 상위 글 패턴 분석 저장소
"""
import sqlite3
import json
import os
from typing import List, Dict, Optional, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Windows 로컬 개발환경에서는 ./data 사용
import sys
if sys.platform == "win32":
    _default_path = os.path.join(os.path.dirname(__file__), "..", "data", "blog_analyzer.db")
else:
    _default_path = "/data/blog_analyzer.db"
DATABASE_PATH = os.environ.get("DATABASE_PATH", _default_path)


def get_connection():
    """Get database connection"""
    db_dir = os.path.dirname(DATABASE_PATH)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)

    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_top_posts_tables():
    """Initialize top posts analysis tables"""
    conn = get_connection()
    cursor = conn.cursor()

    # 상위 글 분석 결과 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS top_post_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT NOT NULL,
            rank INTEGER NOT NULL,
            blog_id TEXT NOT NULL,
            post_url TEXT NOT NULL,

            -- 제목 분석
            title_length INTEGER DEFAULT 0,
            title_has_keyword BOOLEAN DEFAULT 0,
            title_keyword_position INTEGER DEFAULT -1,

            -- 본문 분석
            content_length INTEGER DEFAULT 0,
            image_count INTEGER DEFAULT 0,
            video_count INTEGER DEFAULT 0,
            heading_count INTEGER DEFAULT 0,
            paragraph_count INTEGER DEFAULT 0,

            -- 키워드 분석
            keyword_count INTEGER DEFAULT 0,
            keyword_density REAL DEFAULT 0,

            -- 추가 요소
            has_map BOOLEAN DEFAULT 0,
            has_link BOOLEAN DEFAULT 0,
            like_count INTEGER DEFAULT 0,
            comment_count INTEGER DEFAULT 0,
            post_age_days INTEGER,

            -- 메타 정보
            category TEXT,
            analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data_quality TEXT DEFAULT 'low',

            UNIQUE(keyword, post_url)
        )
    """)

    # 패턴 집계 테이블 (카테고리별 평균 패턴)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS aggregated_patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            sample_count INTEGER DEFAULT 0,

            -- 평균 값들
            avg_title_length REAL DEFAULT 0,
            avg_content_length REAL DEFAULT 0,
            avg_image_count REAL DEFAULT 0,
            avg_video_count REAL DEFAULT 0,
            avg_heading_count REAL DEFAULT 0,
            avg_keyword_count REAL DEFAULT 0,
            avg_keyword_density REAL DEFAULT 0,

            -- 최소/최대 값
            min_content_length INTEGER DEFAULT 0,
            max_content_length INTEGER DEFAULT 0,
            min_image_count INTEGER DEFAULT 0,
            max_image_count INTEGER DEFAULT 0,

            -- 비율 통계
            title_keyword_rate REAL DEFAULT 0,
            map_usage_rate REAL DEFAULT 0,
            link_usage_rate REAL DEFAULT 0,
            video_usage_rate REAL DEFAULT 0,

            -- 제목 키워드 위치 분포
            keyword_position_front REAL DEFAULT 0,
            keyword_position_middle REAL DEFAULT 0,
            keyword_position_end REAL DEFAULT 0,

            -- 최적 범위 (percentile 기반)
            optimal_content_min INTEGER DEFAULT 0,
            optimal_content_max INTEGER DEFAULT 0,
            optimal_image_min INTEGER DEFAULT 0,
            optimal_image_max INTEGER DEFAULT 0,

            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            UNIQUE(category)
        )
    """)

    # 글쓰기 가이드 테이블 (실시간 업데이트되는 최적화 규칙)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS writing_guides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            guide_type TEXT NOT NULL,
            rule_name TEXT NOT NULL,
            rule_value TEXT NOT NULL,
            confidence REAL DEFAULT 0,
            sample_count INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            UNIQUE(category, guide_type, rule_name)
        )
    """)

    # 인덱스 생성
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_top_post_keyword ON top_post_analysis(keyword)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_top_post_category ON top_post_analysis(category)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_top_post_rank ON top_post_analysis(rank)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_aggregated_category ON aggregated_patterns(category)")

    conn.commit()
    conn.close()
    logger.info("Top posts analysis tables initialized")


def save_post_analysis(analysis: Dict) -> int:
    """Save a single post analysis result"""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT OR REPLACE INTO top_post_analysis (
                keyword, rank, blog_id, post_url,
                title_length, title_has_keyword, title_keyword_position,
                content_length, image_count, video_count, heading_count, paragraph_count,
                keyword_count, keyword_density,
                has_map, has_link, like_count, comment_count, post_age_days,
                category, data_quality, analyzed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            analysis.get('keyword', ''),
            analysis.get('rank', 0),
            analysis.get('blog_id', ''),
            analysis.get('post_url', ''),
            analysis.get('title_length', 0),
            1 if analysis.get('title_has_keyword') else 0,
            analysis.get('title_keyword_position', -1),
            analysis.get('content_length', 0),
            analysis.get('image_count', 0),
            analysis.get('video_count', 0),
            analysis.get('heading_count', 0),
            analysis.get('paragraph_count', 0),
            analysis.get('keyword_count', 0),
            analysis.get('keyword_density', 0),
            1 if analysis.get('has_map') else 0,
            1 if analysis.get('has_link') else 0,
            analysis.get('like_count', 0),
            analysis.get('comment_count', 0),
            analysis.get('post_age_days'),
            analysis.get('category', 'general'),
            analysis.get('data_quality', 'low'),
            datetime.now().isoformat()
        ))

        conn.commit()
        return cursor.lastrowid
    except Exception as e:
        logger.error(f"Error saving post analysis: {e}")
        return 0
    finally:
        conn.close()


def get_analysis_count() -> int:
    """Get total count of analyzed posts"""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT COUNT(*) as cnt FROM top_post_analysis")
        row = cursor.fetchone()
        return row['cnt'] if row else 0
    finally:
        conn.close()


def get_category_stats() -> Dict[str, int]:
    """Get analysis count by category"""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT category, COUNT(*) as cnt
            FROM top_post_analysis
            GROUP BY category
        """)
        return {row['category']: row['cnt'] for row in cursor.fetchall()}
    finally:
        conn.close()


def update_aggregated_patterns(category: str = 'general'):
    """Update aggregated patterns for a category based on collected data"""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # 해당 카테고리의 상위 1~3위 글만 집계 (가장 중요)
        cursor.execute("""
            SELECT
                COUNT(*) as sample_count,
                AVG(title_length) as avg_title_length,
                AVG(content_length) as avg_content_length,
                AVG(image_count) as avg_image_count,
                AVG(video_count) as avg_video_count,
                AVG(heading_count) as avg_heading_count,
                AVG(keyword_count) as avg_keyword_count,
                AVG(keyword_density) as avg_keyword_density,
                MIN(content_length) as min_content_length,
                MAX(content_length) as max_content_length,
                MIN(image_count) as min_image_count,
                MAX(image_count) as max_image_count,
                AVG(title_has_keyword) as title_keyword_rate,
                AVG(has_map) as map_usage_rate,
                AVG(has_link) as link_usage_rate,
                AVG(CASE WHEN video_count > 0 THEN 1.0 ELSE 0.0 END) as video_usage_rate,
                AVG(CASE WHEN title_keyword_position = 0 THEN 1.0 ELSE 0.0 END) as keyword_position_front,
                AVG(CASE WHEN title_keyword_position = 1 THEN 1.0 ELSE 0.0 END) as keyword_position_middle,
                AVG(CASE WHEN title_keyword_position = 2 THEN 1.0 ELSE 0.0 END) as keyword_position_end
            FROM top_post_analysis
            WHERE category = ? AND rank <= 3 AND content_length > 100
        """, (category,))

        row = cursor.fetchone()

        if row and row['sample_count'] > 0:
            # Percentile 기반 최적 범위 계산
            cursor.execute("""
                SELECT content_length, image_count
                FROM top_post_analysis
                WHERE category = ? AND rank <= 3 AND content_length > 100
                ORDER BY content_length
            """, (category,))

            all_data = cursor.fetchall()
            content_lengths = [r['content_length'] for r in all_data]
            image_counts = [r['image_count'] for r in all_data]

            # 25th ~ 75th percentile
            n = len(content_lengths)
            if n >= 4:
                content_lengths.sort()
                image_counts.sort()
                optimal_content_min = content_lengths[n // 4]
                optimal_content_max = content_lengths[3 * n // 4]
                optimal_image_min = image_counts[n // 4]
                optimal_image_max = image_counts[3 * n // 4]
            else:
                optimal_content_min = int(row['avg_content_length'] * 0.7)
                optimal_content_max = int(row['avg_content_length'] * 1.3)
                optimal_image_min = max(0, int(row['avg_image_count'] - 3))
                optimal_image_max = int(row['avg_image_count'] + 5)

            # 집계 결과 저장
            cursor.execute("""
                INSERT OR REPLACE INTO aggregated_patterns (
                    category, sample_count,
                    avg_title_length, avg_content_length, avg_image_count, avg_video_count,
                    avg_heading_count, avg_keyword_count, avg_keyword_density,
                    min_content_length, max_content_length, min_image_count, max_image_count,
                    title_keyword_rate, map_usage_rate, link_usage_rate, video_usage_rate,
                    keyword_position_front, keyword_position_middle, keyword_position_end,
                    optimal_content_min, optimal_content_max, optimal_image_min, optimal_image_max,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                category,
                row['sample_count'],
                row['avg_title_length'] or 0,
                row['avg_content_length'] or 0,
                row['avg_image_count'] or 0,
                row['avg_video_count'] or 0,
                row['avg_heading_count'] or 0,
                row['avg_keyword_count'] or 0,
                row['avg_keyword_density'] or 0,
                row['min_content_length'] or 0,
                row['max_content_length'] or 0,
                row['min_image_count'] or 0,
                row['max_image_count'] or 0,
                row['title_keyword_rate'] or 0,
                row['map_usage_rate'] or 0,
                row['link_usage_rate'] or 0,
                row['video_usage_rate'] or 0,
                row['keyword_position_front'] or 0,
                row['keyword_position_middle'] or 0,
                row['keyword_position_end'] or 0,
                optimal_content_min,
                optimal_content_max,
                optimal_image_min,
                optimal_image_max,
                datetime.now().isoformat()
            ))

            conn.commit()
            logger.info(f"Updated aggregated patterns for {category}: {row['sample_count']} samples")
            return True
    except Exception as e:
        logger.error(f"Error updating aggregated patterns: {e}")
        return False
    finally:
        conn.close()


def get_aggregated_patterns(category: str = 'general') -> Optional[Dict]:
    """Get aggregated patterns for a category"""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT * FROM aggregated_patterns WHERE category = ?
        """, (category,))

        row = cursor.fetchone()
        if row:
            return dict(row)
        return None
    finally:
        conn.close()


def get_all_patterns() -> List[Dict]:
    """Get all aggregated patterns"""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT * FROM aggregated_patterns ORDER BY sample_count DESC")
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def save_writing_guide(category: str, guide_type: str, rule_name: str,
                       rule_value: str, confidence: float, sample_count: int):
    """Save a writing guide rule"""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT OR REPLACE INTO writing_guides (
                category, guide_type, rule_name, rule_value,
                confidence, sample_count, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (category, guide_type, rule_name, rule_value,
              confidence, sample_count, datetime.now().isoformat()))
        conn.commit()
    finally:
        conn.close()


def get_writing_guides(category: str = 'general') -> List[Dict]:
    """Get writing guides for a category"""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT * FROM writing_guides
            WHERE category = ? OR category = 'general'
            ORDER BY confidence DESC
        """, (category,))
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def generate_writing_rules(category: str = 'general') -> Dict:
    """Generate writing rules from aggregated patterns"""
    patterns = get_aggregated_patterns(category)

    if not patterns or patterns.get('sample_count', 0) < 5:
        # 샘플이 부족하면 general 패턴 사용
        patterns = get_aggregated_patterns('general')

    if not patterns or patterns.get('sample_count', 0) < 5:
        # 데이터가 충분하지 않으면 기본값 반환
        return {
            "status": "insufficient_data",
            "sample_count": patterns.get('sample_count', 0) if patterns else 0,
            "message": "분석 데이터가 부족합니다. 더 많은 키워드를 검색하여 데이터를 수집해주세요.",
            "rules": get_default_rules()
        }

    sample_count = patterns['sample_count']
    confidence = min(1.0, sample_count / 100)  # 100개 이상이면 confidence 1.0

    rules = {
        "status": "data_driven",
        "sample_count": sample_count,
        "confidence": round(confidence, 2),
        "category": category,
        "updated_at": patterns.get('updated_at'),
        "rules": {
            "title": {
                "description": "제목 작성 규칙",
                "length": {
                    "optimal": round(patterns['avg_title_length']),
                    "min": max(15, round(patterns['avg_title_length'] * 0.7)),
                    "max": min(60, round(patterns['avg_title_length'] * 1.3)),
                    "confidence": confidence
                },
                "keyword_placement": {
                    "include_keyword": patterns['title_keyword_rate'] > 0.5,
                    "rate": round(patterns['title_keyword_rate'] * 100, 1),
                    "best_position": get_best_keyword_position(patterns),
                    "position_distribution": {
                        "front": round(patterns['keyword_position_front'] * 100, 1),
                        "middle": round(patterns['keyword_position_middle'] * 100, 1),
                        "end": round(patterns['keyword_position_end'] * 100, 1)
                    }
                }
            },
            "content": {
                "description": "본문 작성 규칙",
                "length": {
                    "optimal": round(patterns['avg_content_length']),
                    "min": patterns['optimal_content_min'],
                    "max": patterns['optimal_content_max'],
                    "unit": "자",
                    "confidence": confidence
                },
                "structure": {
                    "heading_count": {
                        "optimal": round(patterns['avg_heading_count']),
                        "min": max(2, round(patterns['avg_heading_count'] * 0.6)),
                        "max": round(patterns['avg_heading_count'] * 1.5)
                    },
                    "keyword_density": {
                        "optimal": round(patterns['avg_keyword_density'], 2),
                        "min": max(0.3, round(patterns['avg_keyword_density'] * 0.5, 2)),
                        "max": min(3.0, round(patterns['avg_keyword_density'] * 1.5, 2)),
                        "unit": "per_1000_chars"
                    },
                    "keyword_count": {
                        "optimal": round(patterns['avg_keyword_count']),
                        "min": max(3, round(patterns['avg_keyword_count'] * 0.6)),
                        "max": round(patterns['avg_keyword_count'] * 1.4)
                    }
                }
            },
            "media": {
                "description": "이미지/동영상 규칙",
                "images": {
                    "optimal": round(patterns['avg_image_count']),
                    "min": patterns['optimal_image_min'],
                    "max": patterns['optimal_image_max'],
                    "confidence": confidence
                },
                "videos": {
                    "usage_rate": round(patterns['video_usage_rate'] * 100, 1),
                    "recommended": patterns['video_usage_rate'] > 0.3,
                    "optimal": round(patterns['avg_video_count']) if patterns['avg_video_count'] > 0.5 else 0
                }
            },
            "extras": {
                "description": "추가 요소",
                "map": {
                    "usage_rate": round(patterns['map_usage_rate'] * 100, 1),
                    "recommended": patterns['map_usage_rate'] > 0.2
                },
                "external_links": {
                    "usage_rate": round(patterns['link_usage_rate'] * 100, 1),
                    "recommended": patterns['link_usage_rate'] > 0.3
                }
            }
        }
    }

    # 규칙을 DB에 저장
    for guide_type, type_rules in rules['rules'].items():
        if isinstance(type_rules, dict) and 'description' in type_rules:
            save_writing_guide(
                category=category,
                guide_type=guide_type,
                rule_name='full_rules',
                rule_value=json.dumps(type_rules, ensure_ascii=False),
                confidence=confidence,
                sample_count=sample_count
            )

    return rules


def get_best_keyword_position(patterns: Dict) -> str:
    """Determine the best keyword position based on patterns"""
    positions = {
        'front': patterns.get('keyword_position_front', 0),
        'middle': patterns.get('keyword_position_middle', 0),
        'end': patterns.get('keyword_position_end', 0)
    }
    return max(positions, key=positions.get)


def get_default_rules() -> Dict:
    """Return default writing rules when data is insufficient"""
    return {
        "title": {
            "description": "제목 작성 규칙 (기본값)",
            "length": {"optimal": 30, "min": 20, "max": 45, "confidence": 0},
            "keyword_placement": {
                "include_keyword": True,
                "rate": 85,
                "best_position": "front",
                "position_distribution": {"front": 60, "middle": 30, "end": 10}
            }
        },
        "content": {
            "description": "본문 작성 규칙 (기본값)",
            "length": {"optimal": 2000, "min": 1500, "max": 3500, "unit": "자", "confidence": 0},
            "structure": {
                "heading_count": {"optimal": 5, "min": 3, "max": 8},
                "keyword_density": {"optimal": 1.2, "min": 0.8, "max": 2.0, "unit": "per_1000_chars"},
                "keyword_count": {"optimal": 8, "min": 5, "max": 15}
            }
        },
        "media": {
            "description": "이미지/동영상 규칙 (기본값)",
            "images": {"optimal": 10, "min": 5, "max": 15, "confidence": 0},
            "videos": {"usage_rate": 20, "recommended": False, "optimal": 0}
        },
        "extras": {
            "description": "추가 요소 (기본값)",
            "map": {"usage_rate": 15, "recommended": False},
            "external_links": {"usage_rate": 25, "recommended": False}
        }
    }


def get_recent_analyses(limit: int = 50) -> List[Dict]:
    """Get recent post analyses"""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT keyword, rank, blog_id, post_url, content_length,
                   image_count, keyword_density, category, analyzed_at
            FROM top_post_analysis
            ORDER BY analyzed_at DESC
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def detect_category(keyword: str) -> str:
    """Detect category from keyword"""
    keyword_lower = keyword.lower()

    category_keywords = {
        'hospital': ['병원', '의원', '클리닉', '치과', '피부과', '성형', '시술', '수술', '치료', '진료'],
        'restaurant': ['맛집', '식당', '카페', '음식', '메뉴', '배달', '맛있', '먹방'],
        'beauty': ['화장품', '뷰티', '스킨케어', '메이크업', '향수', '네일', '헤어'],
        'parenting': ['육아', '아기', '유아', '어린이', '키즈', '유치원', '초등'],
        'travel': ['여행', '호텔', '숙소', '펜션', '리조트', '관광', '투어'],
        'tech': ['리뷰', '전자제품', '스마트폰', '노트북', '가전', 'IT', '앱'],
    }

    for category, keywords in category_keywords.items():
        for kw in keywords:
            if kw in keyword_lower:
                return category

    return 'general'
