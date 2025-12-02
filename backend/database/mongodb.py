"""
MongoDB 연결 및 관리 (로그 및 원본 데이터 저장)
"""
from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import logging
import json

from config import settings

logger = logging.getLogger(__name__)

# MongoDB 클라이언트
_mongo_client: Optional[MongoClient] = None
_mongo_db: Optional[Database] = None


def init_mongodb():
    """MongoDB 초기화"""
    global _mongo_client, _mongo_db

    try:
        _mongo_client = MongoClient(
            settings.mongo_url,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=10000
        )

        # 연결 테스트
        _mongo_client.server_info()

        _mongo_db = _mongo_client[settings.MONGO_DB]

        # 인덱스 생성
        _create_indexes()

        logger.info("MongoDB 연결 성공")

    except Exception as e:
        logger.error(f"MongoDB 연결 실패: {e}")
        raise


def _create_indexes():
    """컬렉션 인덱스 생성"""
    try:
        # crawl_raw_data 인덱스
        _mongo_db.crawl_raw_data.create_index([("blog_id", 1), ("crawled_at", -1)])
        _mongo_db.crawl_raw_data.create_index([("data_type", 1), ("crawled_at", -1)])

        # content_similarity 인덱스
        _mongo_db.content_similarity.create_index([("post_id", 1)])
        _mongo_db.content_similarity.create_index([("analyzed_at", -1)])

        # keyword_analysis 인덱스
        _mongo_db.keyword_analysis.create_index([("keyword", 1), ("analyzed_at", -1)])

        # crawl_errors 인덱스
        _mongo_db.crawl_errors.create_index([("occurred_at", -1)])
        _mongo_db.crawl_errors.create_index([("blog_id", 1), ("occurred_at", -1)])

        logger.info("MongoDB 인덱스 생성 완료")

    except Exception as e:
        logger.warning(f"MongoDB 인덱스 생성 오류: {e}")


def get_mongodb() -> Database:
    """MongoDB 데이터베이스 인스턴스"""
    if _mongo_db is None:
        init_mongodb()
    return _mongo_db


class MongoDBClient:
    """MongoDB 클라이언트"""

    def __init__(self):
        self.db = get_mongodb()

    def save_crawl_data(
        self,
        blog_id: str,
        data_type: str,
        raw_html: str = None,
        parsed_data: dict = None,
        metadata: dict = None
    ) -> str:
        """
        크롤링 원본 데이터 저장

        Args:
            blog_id: 블로그 ID
            data_type: 데이터 타입 ('blog_main', 'post_detail', 'search_result')
            raw_html: 원본 HTML
            parsed_data: 파싱된 데이터
            metadata: 메타데이터

        Returns:
            문서 ID
        """
        document = {
            'blog_id': blog_id,
            'data_type': data_type,
            'crawled_at': datetime.utcnow(),
            'raw_html': raw_html,
            'parsed_data': parsed_data or {},
            'metadata': metadata or {}
        }

        result = self.db.crawl_raw_data.insert_one(document)
        return str(result.inserted_id)

    def get_crawl_data(
        self,
        blog_id: str,
        data_type: str = None,
        limit: int = 10
    ) -> List[Dict]:
        """
        크롤링 데이터 조회

        Args:
            blog_id: 블로그 ID
            data_type: 데이터 타입
            limit: 조회 개수

        Returns:
            크롤링 데이터 리스트
        """
        query = {'blog_id': blog_id}
        if data_type:
            query['data_type'] = data_type

        cursor = self.db.crawl_raw_data.find(query).sort('crawled_at', -1).limit(limit)

        results = []
        for doc in cursor:
            doc['_id'] = str(doc['_id'])
            results.append(doc)

        return results

    def save_content_similarity(
        self,
        post_id: str,
        blog_id: str,
        is_duplicate: bool,
        duplicate_sources: List[Dict] = None,
        ai_generated_probability: float = 0.0,
        ai_indicators: Dict = None,
        text_fingerprint: str = None
    ) -> str:
        """
        콘텐츠 유사도 분석 결과 저장

        Args:
            post_id: 포스트 ID
            blog_id: 블로그 ID
            is_duplicate: 중복 여부
            duplicate_sources: 중복 소스 정보
            ai_generated_probability: AI 생성 확률
            ai_indicators: AI 생성 지표
            text_fingerprint: 텍스트 지문

        Returns:
            문서 ID
        """
        document = {
            'post_id': post_id,
            'blog_id': blog_id,
            'analyzed_at': datetime.utcnow(),
            'is_duplicate': is_duplicate,
            'duplicate_sources': duplicate_sources or [],
            'ai_generated_probability': ai_generated_probability,
            'ai_indicators': ai_indicators or {},
            'text_fingerprint': text_fingerprint
        }

        result = self.db.content_similarity.insert_one(document)
        return str(result.inserted_id)

    def get_content_similarity(self, post_id: str) -> Optional[Dict]:
        """
        콘텐츠 유사도 분석 결과 조회

        Args:
            post_id: 포스트 ID

        Returns:
            유사도 분석 결과
        """
        doc = self.db.content_similarity.find_one(
            {'post_id': post_id},
            sort=[('analyzed_at', -1)]
        )

        if doc:
            doc['_id'] = str(doc['_id'])
            return doc

        return None

    def save_keyword_analysis(
        self,
        keyword: str,
        total_results: int,
        competition_level: str,
        top_blogs: List[Dict] = None,
        related_keywords: List[Dict] = None
    ) -> str:
        """
        키워드 분석 결과 저장

        Args:
            keyword: 키워드
            total_results: 총 검색 결과 수
            competition_level: 경쟁 수준 (low, medium, high)
            top_blogs: 상위 블로그 정보
            related_keywords: 관련 키워드

        Returns:
            문서 ID
        """
        document = {
            'keyword': keyword,
            'analyzed_at': datetime.utcnow(),
            'total_results': total_results,
            'competition_level': competition_level,
            'top_blogs': top_blogs or [],
            'related_keywords': related_keywords or []
        }

        result = self.db.keyword_analysis.insert_one(document)
        return str(result.inserted_id)

    def get_keyword_analysis(self, keyword: str) -> Optional[Dict]:
        """
        키워드 분석 결과 조회

        Args:
            keyword: 키워드

        Returns:
            분석 결과
        """
        doc = self.db.keyword_analysis.find_one(
            {'keyword': keyword},
            sort=[('analyzed_at', -1)]
        )

        if doc:
            doc['_id'] = str(doc['_id'])
            return doc

        return None

    def log_crawl_error(
        self,
        blog_id: str,
        url: str,
        error_type: str,
        error_message: str,
        stack_trace: str = None,
        context: Dict = None
    ) -> str:
        """
        크롤링 오류 로그 저장

        Args:
            blog_id: 블로그 ID
            url: URL
            error_type: 오류 타입
            error_message: 오류 메시지
            stack_trace: 스택 트레이스
            context: 컨텍스트 정보

        Returns:
            문서 ID
        """
        document = {
            'blog_id': blog_id,
            'url': url,
            'error_type': error_type,
            'error_message': error_message,
            'stack_trace': stack_trace,
            'occurred_at': datetime.utcnow(),
            'context': context or {}
        }

        result = self.db.crawl_errors.insert_one(document)
        return str(result.inserted_id)

    def get_crawl_errors(
        self,
        blog_id: str = None,
        days: int = 7,
        limit: int = 50
    ) -> List[Dict]:
        """
        크롤링 오류 조회

        Args:
            blog_id: 블로그 ID (선택)
            days: 조회 일수
            limit: 조회 개수

        Returns:
            오류 로그 리스트
        """
        query = {
            'occurred_at': {'$gte': datetime.utcnow() - timedelta(days=days)}
        }

        if blog_id:
            query['blog_id'] = blog_id

        cursor = self.db.crawl_errors.find(query).sort('occurred_at', -1).limit(limit)

        results = []
        for doc in cursor:
            doc['_id'] = str(doc['_id'])
            results.append(doc)

        return results

    def cleanup_old_data(self, days: int = 30):
        """
        오래된 데이터 정리

        Args:
            days: 보관 기간 (일)
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)

        # 오래된 크롤 데이터 삭제
        result1 = self.db.crawl_raw_data.delete_many({
            'crawled_at': {'$lt': cutoff_date}
        })

        # 오래된 오류 로그 삭제
        result2 = self.db.crawl_errors.delete_many({
            'occurred_at': {'$lt': cutoff_date}
        })

        logger.info(
            f"데이터 정리 완료: crawl_data={result1.deleted_count}, "
            f"errors={result2.deleted_count}"
        )


# 싱글톤 인스턴스
_mongodb_client = None


def get_mongodb_client() -> MongoDBClient:
    """MongoDB 클라이언트 싱글톤"""
    global _mongodb_client
    if _mongodb_client is None:
        _mongodb_client = MongoDBClient()
    return _mongodb_client
