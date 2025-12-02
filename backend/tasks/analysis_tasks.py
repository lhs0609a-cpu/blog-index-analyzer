"""
블로그 분석 Celery 작업
"""
from .celery_app import app
from celery import group, chord
from celery.utils.log import get_task_logger
import asyncio
from datetime import datetime

logger = get_task_logger(__name__)


@app.task(bind=True, max_retries=3)
def crawl_blog_main(self, blog_id: str):
    """
    블로그 메인 페이지 크롤링

    Args:
        blog_id: 네이버 블로그 ID

    Returns:
        블로그 데이터 딕셔너리
    """
    try:
        from crawler.blog_main_crawler import BlogMainCrawler

        logger.info(f"블로그 메인 크롤링 시작: {blog_id}")

        async def run():
            async with BlogMainCrawler(headless=True) as crawler:
                return await crawler.crawl(blog_id)

        result = asyncio.run(run())

        logger.info(f"블로그 메인 크롤링 완료: {blog_id}")
        return result

    except Exception as exc:
        logger.error(f"블로그 메인 크롤링 오류: {blog_id} - {exc}")

        # 재시도
        raise self.retry(exc=exc, countdown=60)


@app.task(bind=True, max_retries=3)
def crawl_post_detail(self, blog_id: str, post_id: str):
    """
    포스트 상세 크롤링

    Args:
        blog_id: 블로그 ID
        post_id: 포스트 ID

    Returns:
        포스트 데이터 딕셔너리
    """
    try:
        from crawler.post_detail_crawler import PostDetailCrawler

        logger.info(f"포스트 크롤링 시작: {blog_id}/{post_id}")

        async def run():
            async with PostDetailCrawler(headless=True) as crawler:
                return await crawler.crawl(blog_id, post_id)

        result = asyncio.run(run())

        logger.info(f"포스트 크롤링 완료: {blog_id}/{post_id}")
        return result

    except Exception as exc:
        logger.error(f"포스트 크롤링 오류: {blog_id}/{post_id} - {exc}")

        # 재시도
        raise self.retry(exc=exc, countdown=60)


@app.task
def calculate_blog_index(blog_data: dict, posts_data: list):
    """
    블로그 지수 계산

    Args:
        blog_data: 블로그 데이터
        posts_data: 포스트 데이터 리스트

    Returns:
        지수 정보 딕셔너리
    """
    try:
        from analyzer.blog_index_calculator import BlogIndexCalculator

        logger.info(f"블로그 지수 계산 시작: {blog_data.get('blog_id')}")

        calculator = BlogIndexCalculator()
        result = calculator.calculate(blog_data, posts_data)

        logger.info(f"블로그 지수 계산 완료: {result['total_score']}")
        return result

    except Exception as e:
        logger.error(f"블로그 지수 계산 오류: {e}")
        raise


@app.task
def save_blog_data(blog_data: dict):
    """
    블로그 데이터 저장

    Args:
        blog_data: 블로그 데이터

    Returns:
        블로그 DB ID
    """
    try:
        from database.postgres import get_postgres_client
        from database.mongodb import get_mongodb_client

        logger.info(f"블로그 데이터 저장 시작: {blog_data.get('blog_id')}")

        pg_client = get_postgres_client()
        mongo_client = get_mongodb_client()

        # PostgreSQL에 기본 정보 저장
        blog_params = {
            'blog_id': blog_data.get('blog_id'),
            'blog_url': blog_data.get('blog_url'),
            'blog_name': blog_data.get('blog_name', ''),
            'description': blog_data.get('description', ''),
            'created_at': blog_data.get('profile', {}).get('created_at'),
            'total_posts': blog_data.get('stats', {}).get('total_posts', 0),
            'total_visitors': blog_data.get('stats', {}).get('total_visitors', 0),
            'neighbor_count': blog_data.get('stats', {}).get('neighbor_count', 0),
            'is_influencer': blog_data.get('stats', {}).get('is_influencer', False)
        }

        blog_db_id = pg_client.save_blog(blog_params)

        # MongoDB에 원본 데이터 저장
        mongo_client.save_crawl_data(
            blog_id=blog_data.get('blog_id'),
            data_type='blog_main',
            parsed_data=blog_data,
            metadata={
                'crawler_version': '1.0.0',
                'crawled_at': blog_data.get('crawled_at')
            }
        )

        logger.info(f"블로그 데이터 저장 완료: {blog_db_id}")
        return blog_db_id

    except Exception as e:
        logger.error(f"블로그 데이터 저장 오류: {e}")
        raise


@app.task
def save_post_data(blog_db_id: int, post_data: dict):
    """
    포스트 데이터 저장

    Args:
        blog_db_id: 블로그 DB ID
        post_data: 포스트 데이터

    Returns:
        포스트 DB ID
    """
    try:
        from database.postgres import get_postgres_client
        from database.mongodb import get_mongodb_client

        logger.info(f"포스트 데이터 저장 시작: {post_data.get('post_id')}")

        pg_client = get_postgres_client()
        mongo_client = get_mongodb_client()

        # PostgreSQL에 기본 정보 저장
        post_params = {
            'blog_id': blog_db_id,
            'post_id': post_data.get('post_id'),
            'post_url': post_data.get('url'),
            'title': post_data.get('title', ''),
            'published_at': post_data.get('published_at'),
            'category': post_data.get('category', ''),
            'text_length': post_data.get('content', {}).get('text_length', 0),
            'word_count': post_data.get('content', {}).get('word_count', 0),
            'paragraph_count': post_data.get('content', {}).get('paragraph_count', 0),
            'image_count': post_data.get('media', {}).get('image_count', 0),
            'video_count': post_data.get('media', {}).get('video_count', 0),
            'external_link_count': post_data.get('media', {}).get('external_link_count', 0),
            'like_count': post_data.get('engagement', {}).get('like_count', 0),
            'comment_count': post_data.get('engagement', {}).get('comment_count', 0),
            'scrap_count': post_data.get('engagement', {}).get('scrap_count', 0),
            'view_count': post_data.get('engagement', {}).get('view_count', 0)
        }

        post_db_id = pg_client.save_post(post_params)

        # MongoDB에 원본 데이터 저장
        mongo_client.save_crawl_data(
            blog_id=post_data.get('blog_id'),
            data_type='post_detail',
            parsed_data=post_data,
            metadata={
                'post_id': post_data.get('post_id'),
                'crawled_at': post_data.get('crawled_at')
            }
        )

        logger.info(f"포스트 데이터 저장 완료: {post_db_id}")
        return post_db_id

    except Exception as e:
        logger.error(f"포스트 데이터 저장 오류: {e}")
        raise


@app.task
def save_blog_index(blog_db_id: int, index_data: dict):
    """
    블로그 지수 저장

    Args:
        blog_db_id: 블로그 DB ID
        index_data: 지수 데이터
    """
    try:
        from database.postgres import get_postgres_client

        logger.info(f"블로그 지수 저장 시작: {blog_db_id}")

        pg_client = get_postgres_client()
        pg_client.save_blog_index(blog_db_id, index_data)

        logger.info(f"블로그 지수 저장 완료: {blog_db_id}")

    except Exception as e:
        logger.error(f"블로그 지수 저장 오류: {e}")
        raise


@app.task
def analyze_blog_full(blog_id: str, post_limit: int = 10):
    """
    전체 블로그 분석 워크플로우

    Args:
        blog_id: 블로그 ID
        post_limit: 분석할 포스트 수

    Returns:
        분석 결과 딕셔너리
    """
    try:
        logger.info(f"전체 블로그 분석 시작: {blog_id}")

        # 1. 블로그 메인 크롤링
        blog_data = crawl_blog_main.apply_async([blog_id]).get(timeout=60)

        # 2. 블로그 데이터 저장
        blog_db_id = save_blog_data.apply_async([blog_data]).get()

        # 3. 포스트 크롤링 (병렬)
        recent_posts = blog_data.get('recent_posts', [])[:post_limit]

        if recent_posts:
            # 포스트 크롤링 작업 생성
            post_tasks = group([
                crawl_post_detail.s(blog_id, post['post_id'])
                for post in recent_posts
            ])

            # 병렬 실행
            post_results = post_tasks.apply_async().get(timeout=180)

            # 4. 포스트 데이터 저장
            for post_data in post_results:
                if post_data:
                    save_post_data.apply_async([blog_db_id, post_data]).get()

            # 5. 지수 계산
            index_result = calculate_blog_index.apply_async([blog_data, post_results]).get()

            # 6. 지수 저장
            save_blog_index.apply_async([blog_db_id, index_result]).get()

        else:
            # 포스트가 없으면 블로그 데이터만으로 계산
            index_result = calculate_blog_index.apply_async([blog_data, []]).get()
            save_blog_index.apply_async([blog_db_id, index_result]).get()

        logger.info(f"전체 블로그 분석 완료: {blog_id}")

        return {
            'blog_id': blog_id,
            'blog_db_id': blog_db_id,
            'index': index_result,
            'posts_analyzed': len(recent_posts) if recent_posts else 0,
            'status': 'completed'
        }

    except Exception as e:
        logger.error(f"전체 블로그 분석 오류: {blog_id} - {e}")
        return {
            'blog_id': blog_id,
            'status': 'failed',
            'error': str(e)
        }


@app.task
def analyze_blog_quick(blog_id: str):
    """
    빠른 블로그 분석 (포스트 크롤링 없이)

    Args:
        blog_id: 블로그 ID

    Returns:
        분석 결과 딕셔너리
    """
    try:
        logger.info(f"빠른 블로그 분석 시작: {blog_id}")

        # 1. 블로그 메인만 크롤링
        blog_data = crawl_blog_main.apply_async([blog_id]).get(timeout=60)

        # 2. 블로그 데이터 저장
        blog_db_id = save_blog_data.apply_async([blog_data]).get()

        # 3. 지수 계산 (포스트 데이터 없이)
        index_result = calculate_blog_index.apply_async([blog_data, []]).get()

        # 4. 지수 저장
        save_blog_index.apply_async([blog_db_id, index_result]).get()

        logger.info(f"빠른 블로그 분석 완료: {blog_id}")

        return {
            'blog_id': blog_id,
            'blog_db_id': blog_db_id,
            'index': index_result,
            'status': 'completed'
        }

    except Exception as e:
        logger.error(f"빠른 블로그 분석 오류: {blog_id} - {e}")
        return {
            'blog_id': blog_id,
            'status': 'failed',
            'error': str(e)
        }
