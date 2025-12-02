"""
MVP 테스트 스크립트

블로그 지수 측정 시스템의 핵심 기능을 테스트합니다.
"""
import asyncio
import sys


async def test_crawler():
    """크롤러 테스트"""
    print("=" * 50)
    print("1. 크롤러 테스트")
    print("=" * 50)

    from crawler.blog_main_crawler import BlogMainCrawler

    # 테스트할 블로그 ID (실제 존재하는 블로그로 변경하세요)
    test_blog_id = input("테스트할 블로그 ID를 입력하세요 (예: example_blog): ")

    print(f"\n블로그 크롤링 시작: {test_blog_id}")

    try:
        async with BlogMainCrawler(headless=True) as crawler:
            result = await crawler.crawl(test_blog_id)

        print("\n✅ 크롤링 성공!")
        print(f"  - 블로그 이름: {result.get('blog_name', 'N/A')}")
        print(f"  - 포스트 수: {result.get('stats', {}).get('total_posts', 0)}")
        print(f"  - 방문자 수: {result.get('stats', {}).get('total_visitors', 0)}")
        print(f"  - 최근 포스트: {len(result.get('recent_posts', []))}개")

        return result

    except Exception as e:
        print(f"\n❌ 크롤링 실패: {e}")
        return None


def test_index_calculator(blog_data):
    """지수 계산 테스트"""
    if not blog_data:
        print("\n⚠️  블로그 데이터가 없어 지수 계산을 건너뜁니다.")
        return None

    print("\n" + "=" * 50)
    print("2. 지수 계산 테스트")
    print("=" * 50)

    from analyzer.blog_index_calculator import BlogIndexCalculator

    calculator = BlogIndexCalculator()

    print("\n지수 계산 중...")

    try:
        result = calculator.calculate(blog_data, [])

        print("\n✅ 지수 계산 성공!")
        print(f"  - 총점: {result['total_score']:.2f} / 100")
        print(f"  - 레벨: {result['level']}")
        print(f"  - 등급: {result['grade']}")
        print(f"  - 백분위: 상위 {100 - result['percentile']:.1f}%")
        print(f"\n  점수 분해:")
        for category, score in result['score_breakdown'].items():
            print(f"    - {category}: {score:.2f}")

        if result.get('warnings'):
            print(f"\n  ⚠️  경고 {len(result['warnings'])}개:")
            for w in result['warnings']:
                print(f"    - {w['message']}")

        if result.get('recommendations'):
            print(f"\n  💡 권장사항 {len(result['recommendations'])}개:")
            for r in result['recommendations'][:2]:
                print(f"    - {r['message']}")

        return result

    except Exception as e:
        print(f"\n❌ 지수 계산 실패: {e}")
        return None


def test_database():
    """데이터베이스 연결 테스트"""
    print("\n" + "=" * 50)
    print("3. 데이터베이스 연결 테스트")
    print("=" * 50)

    # PostgreSQL
    print("\nPostgreSQL 연결 테스트...")
    try:
        from database.postgres import get_postgres_client

        pg_client = get_postgres_client()
        result = pg_client.execute_query("SELECT 1 as test")

        print("✅ PostgreSQL 연결 성공!")

    except Exception as e:
        print(f"❌ PostgreSQL 연결 실패: {e}")

    # MongoDB
    print("\nMongoDB 연결 테스트...")
    try:
        from database.mongodb import get_mongodb

        db = get_mongodb()
        db.command('ping')

        print("✅ MongoDB 연결 성공!")

    except Exception as e:
        print(f"⚠️  MongoDB 연결 실패 (선택사항): {e}")

    # Redis
    print("\nRedis 연결 테스트...")
    try:
        import redis
        from config import settings

        r = redis.from_url(settings.redis_url)
        r.ping()

        print("✅ Redis 연결 성공!")

    except Exception as e:
        print(f"❌ Redis 연결 실패: {e}")


async def test_full_workflow():
    """전체 워크플로우 테스트"""
    print("\n" + "=" * 50)
    print("4. 전체 워크플로우 테스트")
    print("=" * 50)

    # 1. 크롤링
    blog_data = await test_crawler()

    if not blog_data:
        print("\n워크플로우 테스트 중단: 크롤링 실패")
        return

    # 2. 지수 계산
    index_data = test_index_calculator(blog_data)

    if not index_data:
        print("\n워크플로우 테스트 중단: 지수 계산 실패")
        return

    # 3. 데이터 저장 테스트
    print("\n데이터 저장 테스트...")

    try:
        from database.postgres import get_postgres_client

        pg_client = get_postgres_client()

        # 블로그 저장
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

        print(f"✅ 블로그 데이터 저장 성공! (ID: {blog_db_id})")

        # 지수 저장
        pg_client.save_blog_index(blog_db_id, index_data)

        print(f"✅ 블로그 지수 저장 성공!")

        # 조회 테스트
        latest = pg_client.get_latest_index(blog_data.get('blog_id'))

        if latest:
            print(f"✅ 저장된 지수 조회 성공! (점수: {latest.get('total_score')})")
        else:
            print(f"⚠️  저장된 지수 조회 실패")

        print("\n🎉 전체 워크플로우 테스트 성공!")

    except Exception as e:
        print(f"\n❌ 데이터 저장 실패: {e}")
        import traceback
        traceback.print_exc()


async def main():
    """메인 함수"""
    print("\n" + "=" * 50)
    print("블로그 지수 측정 시스템 MVP 테스트")
    print("=" * 50)

    print("\n테스트 모드를 선택하세요:")
    print("1. 크롤러만 테스트")
    print("2. 지수 계산만 테스트")
    print("3. 데이터베이스 연결 테스트")
    print("4. 전체 워크플로우 테스트 (권장)")

    choice = input("\n선택 (1-4): ")

    if choice == '1':
        await test_crawler()
    elif choice == '2':
        print("\n⚠️  크롤러를 먼저 실행하여 데이터를 가져옵니다...")
        blog_data = await test_crawler()
        test_index_calculator(blog_data)
    elif choice == '3':
        test_database()
    elif choice == '4':
        test_database()
        await test_full_workflow()
    else:
        print("잘못된 선택입니다.")

    print("\n" + "=" * 50)
    print("테스트 완료!")
    print("=" * 50)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n테스트가 중단되었습니다.")
    except Exception as e:
        print(f"\n오류 발생: {e}")
        import traceback
        traceback.print_exc()
