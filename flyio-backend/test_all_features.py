"""
블로그 성장 도구 전체 기능 테스트 스크립트
인증 필요/불필요 엔드포인트 구분하여 테스트
"""
import asyncio
import httpx
import sys
import io
from datetime import datetime

# UTF-8 출력 강제
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

BASE_URL = "http://localhost:8000/api"

# 테스트 결과 저장
results = {
    "success": [],
    "auth_required": [],
    "failed": [],
    "timeout": []
}


async def test_endpoint(client: httpx.AsyncClient, method: str, endpoint: str,
                       data: dict = None, params: dict = None, name: str = None):
    """단일 엔드포인트 테스트"""
    url = f"{BASE_URL}{endpoint}"
    display_name = name or endpoint

    try:
        if method == "GET":
            response = await client.get(url, params=params, timeout=15.0)
        else:
            response = await client.post(url, json=data, timeout=15.0)

        if response.status_code == 200:
            results["success"].append(display_name)
            return "✅", response.json()
        elif response.status_code == 401:
            results["auth_required"].append(display_name)
            return "🔐", "인증 필요"
        elif response.status_code == 403:
            results["auth_required"].append(display_name)
            return "🔐", "권한 필요"
        elif response.status_code == 503:
            results["failed"].append(display_name)
            return "⚠️", f"서비스 미설정 ({response.status_code})"
        else:
            results["failed"].append(display_name)
            detail = response.json().get("detail", response.text[:100]) if response.text else "No detail"
            return "❌", f"실패 ({response.status_code}): {detail}"
    except httpx.TimeoutException:
        results["timeout"].append(display_name)
        return "⏱️", "타임아웃"
    except Exception as e:
        results["failed"].append(display_name)
        return "❌", f"에러: {str(e)[:50]}"


async def main():
    print("\n" + "="*70)
    print("🧪 블로그 성장 도구 전체 기능 테스트")
    print("="*70)
    print(f"테스트 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"대상 서버: {BASE_URL}")

    async with httpx.AsyncClient() as client:

        # 1. 서버 상태 확인
        print("\n" + "-"*50)
        print("📡 1. 서버 상태 확인")
        print("-"*50)
        # 헬스체크는 /api가 아닌 루트에 있음
        try:
            response = await client.get("http://localhost:8000/health", timeout=10.0)
            if response.status_code == 200:
                results["success"].append("서버 헬스체크")
                print(f"  ✅ 서버 헬스체크: OK")
            else:
                results["failed"].append("서버 헬스체크")
                print(f"  ❌ 서버 헬스체크: 실패 ({response.status_code})")
        except Exception as e:
            results["failed"].append("서버 헬스체크")
            print(f"  ❌ 서버 헬스체크: {str(e)[:50]}")

        # 2. 콘텐츠 제작 도구 (대부분 인증 필요)
        print("\n" + "-"*50)
        print("📝 2. 콘텐츠 제작 도구")
        print("-"*50)

        # AI 제목 생성
        status, result = await test_endpoint(
            client, "POST", "/tools/title/generate",
            data={"keyword": "맛집", "style": "engaging", "count": 3},
            name="AI 제목 생성"
        )
        print(f"  {status} AI 제목 생성: {result if status != '✅' else '성공'}")

        # 키워드 발굴
        status, result = await test_endpoint(
            client, "POST", "/tools/keyword/discover",
            data={"seed_keyword": "다이어트", "category": "health"},
            name="키워드 발굴"
        )
        print(f"  {status} 키워드 발굴: {result if status != '✅' else '성공'}")

        # 해시태그 생성
        status, result = await test_endpoint(
            client, "POST", "/tools/hashtag/generate",
            data={"keyword": "서울맛집", "count": 10},
            name="해시태그 생성"
        )
        print(f"  {status} 해시태그 생성: {result if status != '✅' else '성공'}")

        # 글쓰기 체크 (선택적 인증 - Query params)
        try:
            response = await client.post(
                f"{BASE_URL}/tools/writing/check?title=테스트 블로그 제목 입니다 SEO 최적화&keyword=테스트",
                timeout=15.0
            )
            if response.status_code == 200:
                results["success"].append("글쓰기 체크")
                print(f"  ✅ 글쓰기 체크: 성공")
            elif response.status_code in [401, 403]:
                results["auth_required"].append("글쓰기 체크")
                print(f"  🔐 글쓰기 체크: 인증 필요")
            else:
                results["failed"].append("글쓰기 체크")
                print(f"  ❌ 글쓰기 체크: 실패 ({response.status_code})")
        except httpx.TimeoutException:
            results["timeout"].append("글쓰기 체크")
            print(f"  ⏱️ 글쓰기 체크: 타임아웃")
        except Exception as e:
            results["failed"].append("글쓰기 체크")
            print(f"  ❌ 글쓰기 체크: {str(e)[:50]}")

        # 인사이트 분석
        status, result = await test_endpoint(
            client, "POST", "/tools/insight/analyze",
            data={"blog_id": "rlatjdghks01", "period": "30days"},
            name="인사이트 분석"
        )
        print(f"  {status} 인사이트 분석: {result if status != '✅' else '성공'}")

        # 노출 예측
        status, result = await test_endpoint(
            client, "POST", "/tools/prediction/rank",
            data={"keyword": "서울맛집", "title": "서울 최고의 맛집 TOP 10", "content_length": 2000},
            name="노출 예측"
        )
        print(f"  {status} 노출 예측: {result if status != '✅' else '성공'}")

        # 발행 시간 분석
        status, result = await test_endpoint(
            client, "GET", "/tools/timing/analyze",
            params={"category": "음식"},
            name="발행 시간 분석"
        )
        print(f"  {status} 발행 시간 분석: {result if status != '✅' else '성공'}")

        # 리포트 생성
        status, result = await test_endpoint(
            client, "GET", "/tools/report/generate",
            params={"blog_id": "rlatjdghks01"},
            name="리포트 생성"
        )
        print(f"  {status} 리포트 생성: {result if status != '✅' else '성공'}")

        # 3. 분석 & 최적화 도구
        print("\n" + "-"*50)
        print("📊 3. 분석 & 최적화 도구")
        print("-"*50)

        # 저품질 체크
        status, result = await test_endpoint(
            client, "POST", "/tools/lowquality/check",
            data={"blog_id": "rlatjdghks01"},
            name="저품질 체크"
        )
        print(f"  {status} 저품질 체크: {result if status != '✅' else '성공'}")

        # 유튜브 변환
        status, result = await test_endpoint(
            client, "POST", "/tools/youtube/convert",
            data={"youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
            name="유튜브 변환"
        )
        print(f"  {status} 유튜브 변환: {result if status != '✅' else '성공'}")

        # 체험단 매칭
        status, result = await test_endpoint(
            client, "POST", "/tools/campaign/match",
            data={"blog_id": "rlatjdghks01", "categories": ["음식", "뷰티"]},
            name="체험단 매칭"
        )
        print(f"  {status} 체험단 매칭: {result if status != '✅' else '성공'}")

        # 순위 추적
        status, result = await test_endpoint(
            client, "GET", "/tools/rank/track",
            params={"blog_id": "rlatjdghks01", "keyword": "맛집"},
            name="순위 추적"
        )
        print(f"  {status} 순위 추적: {result if status != '✅' else '성공'}")

        # 클론 분석
        status, result = await test_endpoint(
            client, "GET", "/tools/clone/analyze",
            params={"blog_id": "rlatjdghks01"},
            name="클론 분석"
        )
        print(f"  {status} 클론 분석: {result if status != '✅' else '성공'}")

        # 댓글 AI
        status, result = await test_endpoint(
            client, "POST", "/tools/comment/suggest",
            data={"post_url": "https://blog.naver.com/test/123", "tone": "friendly"},
            name="댓글 AI"
        )
        print(f"  {status} 댓글 AI: {result if status != '✅' else '성공'}")

        # 백업 생성
        status, result = await test_endpoint(
            client, "POST", "/tools/backup/create",
            data={"blog_id": "rlatjdghks01"},
            name="백업 생성"
        )
        print(f"  {status} 백업 생성: {result if status != '✅' else '성공'}")

        # 4. 성장 전략 도구
        print("\n" + "-"*50)
        print("📈 4. 성장 전략 도구")
        print("-"*50)

        # 알고리즘 체크
        status, result = await test_endpoint(
            client, "GET", "/tools/algorithm/check",
            params={"blog_id": "rlatjdghks01"},
            name="알고리즘 체크"
        )
        print(f"  {status} 알고리즘 체크: {result if status != '✅' else '성공'}")

        # 리프레시 분석
        status, result = await test_endpoint(
            client, "GET", "/tools/refresh/analyze",
            params={"blog_id": "rlatjdghks01"},
            name="리프레시 분석"
        )
        print(f"  {status} 리프레시 분석: {result if status != '✅' else '성공'}")

        # 연관 글 찾기
        status, result = await test_endpoint(
            client, "GET", "/tools/related/find",
            params={"keyword": "다이어트"},
            name="연관 글 찾기"
        )
        print(f"  {status} 연관 글 찾기: {result if status != '✅' else '성공'}")

        # 멘토 매칭
        status, result = await test_endpoint(
            client, "GET", "/tools/mentor/match",
            params={"blog_id": "rlatjdghks01"},
            name="멘토 매칭"
        )
        print(f"  {status} 멘토 매칭: {result if status != '✅' else '성공'}")

        # 로드맵 생성
        status, result = await test_endpoint(
            client, "GET", "/tools/roadmap/generate",
            params={"blog_id": "rlatjdghks01", "goal": "influencer"},
            name="로드맵 생성"
        )
        print(f"  {status} 로드맵 생성: {result if status != '✅' else '성공'}")

        # 트렌드 스나이핑
        status, result = await test_endpoint(
            client, "POST", "/tools/trend/snipe",
            data={"category": "음식", "time_range": "24h"},
            name="트렌드 스나이핑"
        )
        print(f"  {status} 트렌드 스나이핑: {result if status != '✅' else '성공'}")

        # 5. 네이버 생태계 도구
        print("\n" + "-"*50)
        print("🌐 5. 네이버 생태계 도구")
        print("-"*50)

        # 지식인
        status, result = await test_endpoint(
            client, "GET", "/tools/kin/questions",
            params={"category": "건강"},
            name="지식인 질문"
        )
        print(f"  {status} 지식인 질문: {result if status != '✅' else '성공'}")

        # 뉴스/실검
        status, result = await test_endpoint(
            client, "GET", "/tools/news/trending",
            params={"category": "all"},
            name="뉴스/실검"
        )
        print(f"  {status} 뉴스/실검: {result if status != '✅' else '성공'}")

        # 데이터랩
        status, result = await test_endpoint(
            client, "POST", "/tools/datalab/trend",
            data={"keywords": ["다이어트", "운동"], "period": "1month"},
            name="데이터랩 트렌드"
        )
        print(f"  {status} 데이터랩 트렌드: {result if status != '✅' else '성공'}")

        # 쇼핑 키워드
        status, result = await test_endpoint(
            client, "GET", "/tools/shopping/keywords",
            params={"keyword": "화장품"},
            name="쇼핑 키워드"
        )
        print(f"  {status} 쇼핑 키워드: {result if status != '✅' else '성공'}")

        # 플레이스 검색
        status, result = await test_endpoint(
            client, "GET", "/tools/place/search",
            params={"query": "강남맛집"},
            name="플레이스 검색"
        )
        print(f"  {status} 플레이스 검색: {result if status != '✅' else '성공'}")

        # 카페 분석 (선택적 인증)
        status, result = await test_endpoint(
            client, "GET", "/tools/cafe/analysis",
            params={"keyword": "부동산"},
            name="카페 분석"
        )
        print(f"  {status} 카페 분석: {result if status != '✅' else '성공'}")

        # VIEW 분석 (선택적 인증)
        status, result = await test_endpoint(
            client, "GET", "/tools/view/analysis",
            params={"keyword": "맛집"},
            name="VIEW 분석"
        )
        print(f"  {status} VIEW 분석: {result if status != '✅' else '성공'}")

        # 통합검색 분석 (선택적 인증)
        status, result = await test_endpoint(
            client, "GET", "/tools/search/analysis",
            params={"keyword": "여행"},
            name="통합검색 분석"
        )
        print(f"  {status} 통합검색 분석: {result if status != '✅' else '성공'}")

        # 인플루언서 분석 (선택적 인증)
        status, result = await test_endpoint(
            client, "GET", "/tools/influencer/analysis",
            params={"category": "맛집"},
            name="인플루언서 분석"
        )
        print(f"  {status} 인플루언서 분석: {result if status != '✅' else '성공'}")

        # 스마트스토어 분석
        status, result = await test_endpoint(
            client, "GET", "/tools/smartstore/analyze",
            params={"store_url": "https://smartstore.naver.com/test"},
            name="스마트스토어 분석"
        )
        print(f"  {status} 스마트스토어 분석: {result if status != '✅' else '성공'}")

        # 비핑 키워드
        status, result = await test_endpoint(
            client, "GET", "/tools/secret/keywords",
            params={"category": "건강"},
            name="비핑 키워드"
        )
        print(f"  {status} 비핑 키워드: {result if status != '✅' else '성공'}")

        # 6. 기존 블로그 API 테스트
        print("\n" + "-"*50)
        print("📋 6. 기존 블로그 분석 API")
        print("-"*50)

        # 블로그 분석 (POST with body)
        status, result = await test_endpoint(
            client, "POST", "/blogs/analyze",
            data={"blog_id": "rlatjdghks01"},
            name="블로그 분석"
        )
        print(f"  {status} 블로그 분석: {result if status != '✅' else '성공'}")

        # 키워드 검색 (POST with Query params)
        try:
            response = await client.post(
                f"{BASE_URL}/blogs/search-keyword-with-tabs?keyword=맛집&limit=5&quick_mode=true",
                timeout=30.0
            )
            if response.status_code == 200:
                results["success"].append("키워드 검색")
                print(f"  ✅ 키워드 검색: 성공")
            else:
                results["failed"].append("키워드 검색")
                print(f"  ❌ 키워드 검색: 실패 ({response.status_code})")
        except httpx.TimeoutException:
            results["timeout"].append("키워드 검색")
            print(f"  ⏱️ 키워드 검색: 타임아웃")
        except Exception as e:
            results["failed"].append("키워드 검색")
            print(f"  ❌ 키워드 검색: {str(e)[:50]}")

        # 연관 키워드 (path parameter)
        status, result = await test_endpoint(
            client, "GET", "/blogs/related-keywords/다이어트",
            name="연관 키워드"
        )
        print(f"  {status} 연관 키워드: {result if status != '✅' else '성공'}")

    # 결과 요약
    print("\n" + "="*70)
    print("📊 테스트 결과 요약")
    print("="*70)

    total = len(results["success"]) + len(results["auth_required"]) + len(results["failed"]) + len(results["timeout"])

    print(f"\n총 {total}개 엔드포인트 테스트")
    print(f"  ✅ 성공: {len(results['success'])}개")
    print(f"  🔐 인증 필요: {len(results['auth_required'])}개")
    print(f"  ❌ 실패: {len(results['failed'])}개")
    print(f"  ⏱️ 타임아웃: {len(results['timeout'])}개")

    if results["success"]:
        print(f"\n✅ 성공한 기능:")
        for name in results["success"]:
            print(f"    - {name}")

    if results["failed"]:
        print(f"\n❌ 실패한 기능:")
        for name in results["failed"]:
            print(f"    - {name}")

    if results["timeout"]:
        print(f"\n⏱️ 타임아웃 발생:")
        for name in results["timeout"]:
            print(f"    - {name}")

    print("\n")


if __name__ == "__main__":
    asyncio.run(main())
