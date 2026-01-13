"""
인증 필요 기능 27개 로직 검증 테스트
"""
import asyncio
import httpx
import sys
import io
import json
from datetime import datetime

# UTF-8 출력 강제
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

BASE_URL = "http://localhost:8000/api"

# 토큰 읽기
try:
    with open('test_token.txt', 'r') as f:
        TOKEN = f.read().strip()
except:
    TOKEN = None

HEADERS = {"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}

results = {"success": [], "failed": [], "error": []}


async def test_with_auth(client: httpx.AsyncClient, method: str, endpoint: str,
                         data: dict = None, params: dict = None, name: str = None,
                         validate_func=None, use_query_params: bool = False):
    """인증된 엔드포인트 테스트"""
    url = f"{BASE_URL}{endpoint}"
    display_name = name or endpoint

    try:
        if method == "GET":
            response = await client.get(url, params=params, headers=HEADERS, timeout=30.0)
        else:
            # POST도 Query params 사용하는 경우 있음
            if use_query_params and params:
                response = await client.post(url, params=params, headers=HEADERS, timeout=30.0)
            else:
                response = await client.post(url, json=data, headers=HEADERS, timeout=30.0)

        if response.status_code == 200:
            result_data = response.json()

            # 커스텀 검증 함수가 있으면 실행
            if validate_func:
                is_valid, msg = validate_func(result_data)
                if is_valid:
                    results["success"].append(display_name)
                    return "✅", msg
                else:
                    results["failed"].append(display_name)
                    return "⚠️", msg
            else:
                # 기본 검증: success 필드 또는 데이터 존재 확인
                if result_data.get("success") == True or isinstance(result_data, (list, dict)):
                    results["success"].append(display_name)
                    return "✅", "응답 정상"
                else:
                    results["failed"].append(display_name)
                    return "⚠️", f"success=False: {result_data.get('message', 'N/A')}"
        elif response.status_code == 503:
            results["failed"].append(display_name)
            detail = response.json().get("detail", "서비스 미설정")
            return "⚠️", f"서비스 미설정: {detail}"
        else:
            results["error"].append(display_name)
            return "❌", f"실패 ({response.status_code})"

    except httpx.TimeoutException:
        results["error"].append(display_name)
        return "⏱️", "타임아웃"
    except Exception as e:
        results["error"].append(display_name)
        return "❌", f"에러: {str(e)[:50]}"


# ============================================
# 검증 함수들
# ============================================

def validate_title_generation(data):
    """AI 제목 생성 검증"""
    titles = data.get("titles", [])
    if len(titles) > 0:
        return True, f"{len(titles)}개 제목 생성됨"
    return False, "제목 없음"

def validate_keyword_discovery(data):
    """키워드 발굴 검증"""
    keywords = data.get("keywords", data.get("blue_ocean_keywords", []))
    if len(keywords) > 0:
        return True, f"{len(keywords)}개 키워드 발굴"
    return False, "키워드 없음"

def validate_hashtag_generation(data):
    """해시태그 생성 검증"""
    hashtags = data.get("hashtags", [])
    if len(hashtags) > 0:
        return True, f"{len(hashtags)}개 해시태그"
    return False, "해시태그 없음"

def validate_lowquality_check(data):
    """저품질 체크 검증"""
    if "is_low_quality" in data or "risk_score" in data or "checks" in data:
        return True, f"저품질 여부: {data.get('is_low_quality', 'N/A')}"
    return False, "검사 결과 없음"

def validate_insight_analysis(data):
    """인사이트 분석 검증"""
    if data.get("insights") or data.get("analysis") or data.get("recommendations"):
        return True, "인사이트 분석 완료"
    return False, "분석 결과 없음"

def validate_rank_prediction(data):
    """노출 예측 검증"""
    if "predicted_rank" in data or "probability" in data or "score" in data:
        return True, f"예측 순위: {data.get('predicted_rank', 'N/A')}"
    return False, "예측 결과 없음"

def validate_timing_analysis(data):
    """발행 시간 분석 검증"""
    if data.get("best_times") or data.get("recommended_hours") or data.get("hourlyData"):
        return True, "발행 시간 분석 완료"
    return False, "시간 분석 없음"

def validate_report_generation(data):
    """리포트 생성 검증"""
    if data.get("report") or data.get("summary") or data.get("sections"):
        return True, "리포트 생성 완료"
    return False, "리포트 없음"

def validate_youtube_convert(data):
    """유튜브 변환 검증"""
    if data.get("blog_content") or data.get("transcript") or data.get("summary"):
        return True, "유튜브 변환 완료"
    return False, "변환 결과 없음"

def validate_campaign_match(data):
    """체험단 매칭 검증"""
    campaigns = data.get("campaigns", data.get("matches", []))
    if len(campaigns) > 0 or data.get("message"):
        return True, f"{len(campaigns)}개 체험단 매칭"
    return False, "매칭 결과 없음"

def validate_rank_track(data):
    """순위 추적 검증"""
    if "current_rank" in data or "history" in data or "rankings" in data:
        return True, f"현재 순위: {data.get('current_rank', 'N/A')}"
    return False, "순위 정보 없음"

def validate_clone_analysis(data):
    """클론 분석 검증"""
    if data.get("similar_blogs") or data.get("competitors") or data.get("clones"):
        return True, "클론 분석 완료"
    return False, "클론 정보 없음"

def validate_comment_suggest(data):
    """댓글 AI 검증"""
    suggestions = data.get("suggestions", data.get("comments", []))
    if len(suggestions) > 0 or data.get("comment"):
        return True, f"{len(suggestions)}개 댓글 추천"
    return False, "댓글 추천 없음"

def validate_backup_create(data):
    """백업 생성 검증"""
    if data.get("backup_id") or data.get("file_path") or data.get("success"):
        return True, "백업 생성 완료"
    return False, "백업 실패"

def validate_algorithm_check(data):
    """알고리즘 체크 검증"""
    if data.get("algorithm_score") or data.get("factors") or data.get("checks"):
        return True, f"알고리즘 점수: {data.get('algorithm_score', 'N/A')}"
    return False, "알고리즘 분석 없음"

def validate_refresh_analysis(data):
    """리프레시 분석 검증"""
    posts = data.get("posts_to_refresh", data.get("recommendations", []))
    if len(posts) > 0 or data.get("analysis"):
        return True, f"{len(posts)}개 리프레시 추천"
    return False, "리프레시 분석 없음"

def validate_related_find(data):
    """연관 글 찾기 검증"""
    related = data.get("related_posts", data.get("posts", []))
    if len(related) > 0:
        return True, f"{len(related)}개 연관 글"
    return False, "연관 글 없음"

def validate_mentor_match(data):
    """멘토 매칭 검증"""
    mentors = data.get("mentors", data.get("recommendations", []))
    if len(mentors) > 0 or data.get("mentor"):
        return True, f"{len(mentors)}개 멘토 추천"
    return False, "멘토 추천 없음"

def validate_roadmap_generate(data):
    """로드맵 생성 검증"""
    if data.get("roadmap") or data.get("steps") or data.get("milestones"):
        return True, "로드맵 생성 완료"
    return False, "로드맵 없음"

def validate_trend_snipe(data):
    """트렌드 스나이핑 검증"""
    trends = data.get("trends", data.get("keywords", []))
    if len(trends) > 0:
        return True, f"{len(trends)}개 트렌드"
    return False, "트렌드 없음"

def validate_kin_questions(data):
    """지식인 질문 검증"""
    questions = data.get("questions", data.get("items", []))
    if len(questions) > 0:
        return True, f"{len(questions)}개 질문"
    return False, "질문 없음"

def validate_news_trending(data):
    """뉴스/실검 검증"""
    news = data.get("news", data.get("trending", data.get("items", [])))
    if len(news) > 0 or data.get("topics"):
        return True, f"{len(news)}개 뉴스"
    return False, "뉴스 없음"

def validate_datalab_trend(data):
    """데이터랩 트렌드 검증"""
    if data.get("trend_data") or data.get("results") or data.get("data"):
        return True, "트렌드 데이터 조회 완료"
    return False, "트렌드 데이터 없음"

def validate_shopping_keywords(data):
    """쇼핑 키워드 검증"""
    keywords = data.get("keywords", data.get("products", []))
    if len(keywords) > 0 or data.get("data"):
        return True, f"{len(keywords)}개 쇼핑 키워드"
    return False, "쇼핑 키워드 없음"

def validate_place_search(data):
    """플레이스 검색 검증"""
    places = data.get("places", data.get("results", []))
    if len(places) > 0:
        return True, f"{len(places)}개 플레이스"
    return False, "플레이스 없음"

def validate_smartstore_analyze(data):
    """스마트스토어 분석 검증"""
    if data.get("store_info") or data.get("analysis") or data.get("products"):
        return True, "스마트스토어 분석 완료"
    return False, "분석 결과 없음"

def validate_secret_keywords(data):
    """비핑 키워드 검증"""
    keywords = data.get("keywords", data.get("secret_keywords", []))
    if len(keywords) > 0:
        return True, f"{len(keywords)}개 비핑 키워드"
    return False, "비핑 키워드 없음"


async def main():
    print("\n" + "="*70)
    print("🔐 인증 필요 기능 27개 로직 검증 테스트")
    print("="*70)
    print(f"테스트 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    if not TOKEN:
        print("\n❌ 토큰이 없습니다. 먼저 테스트 계정을 생성하세요.")
        return

    print(f"토큰: {TOKEN[:30]}...")

    async with httpx.AsyncClient() as client:

        # ============================================
        # 1. 콘텐츠 제작 도구 (7개)
        # ============================================
        print("\n" + "-"*50)
        print("📝 1. 콘텐츠 제작 도구 (7개)")
        print("-"*50)

        # AI 제목 생성
        status, msg = await test_with_auth(
            client, "POST", "/tools/title/generate",
            data={"keyword": "맛집", "style": "engaging", "count": 3},
            name="AI 제목 생성",
            validate_func=validate_title_generation
        )
        print(f"  {status} AI 제목 생성: {msg}")

        # 키워드 발굴
        status, msg = await test_with_auth(
            client, "POST", "/tools/keyword/discover",
            data={"seed_keyword": "다이어트", "category": "health"},
            name="키워드 발굴",
            validate_func=validate_keyword_discovery
        )
        print(f"  {status} 키워드 발굴: {msg}")

        # 해시태그 생성
        status, msg = await test_with_auth(
            client, "POST", "/tools/hashtag/generate",
            data={"keyword": "서울맛집", "count": 10},
            name="해시태그 생성",
            validate_func=validate_hashtag_generation
        )
        print(f"  {status} 해시태그 생성: {msg}")

        # 인사이트 분석 (Query params)
        status, msg = await test_with_auth(
            client, "POST", "/tools/insight/analyze",
            params={"blog_id": "rlatjdghks01", "keyword": "맛집"},
            name="인사이트 분석",
            validate_func=validate_insight_analysis,
            use_query_params=True
        )
        print(f"  {status} 인사이트 분석: {msg}")

        # 노출 예측 (Query params)
        status, msg = await test_with_auth(
            client, "POST", "/tools/prediction/rank",
            params={"keyword": "서울맛집", "blog_id": "rlatjdghks01"},
            name="노출 예측",
            validate_func=validate_rank_prediction,
            use_query_params=True
        )
        print(f"  {status} 노출 예측: {msg}")

        # 발행 시간 분석 (keyword required)
        status, msg = await test_with_auth(
            client, "GET", "/tools/timing/analyze",
            params={"keyword": "맛집"},
            name="발행 시간 분석",
            validate_func=validate_timing_analysis
        )
        print(f"  {status} 발행 시간 분석: {msg}")

        # 리포트 생성
        status, msg = await test_with_auth(
            client, "GET", "/tools/report/generate",
            params={"blog_id": "rlatjdghks01"},
            name="리포트 생성",
            validate_func=validate_report_generation
        )
        print(f"  {status} 리포트 생성: {msg}")

        # ============================================
        # 2. 분석 & 최적화 도구 (7개)
        # ============================================
        print("\n" + "-"*50)
        print("📊 2. 분석 & 최적화 도구 (7개)")
        print("-"*50)

        # 저품질 체크
        status, msg = await test_with_auth(
            client, "POST", "/tools/lowquality/check",
            data={"blog_id": "rlatjdghks01"},
            name="저품질 체크",
            validate_func=validate_lowquality_check
        )
        print(f"  {status} 저품질 체크: {msg}")

        # 유튜브 변환 (Query param)
        status, msg = await test_with_auth(
            client, "POST", "/tools/youtube/convert",
            params={"youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
            name="유튜브 변환",
            validate_func=validate_youtube_convert,
            use_query_params=True
        )
        print(f"  {status} 유튜브 변환: {msg}")

        # 체험단 매칭
        status, msg = await test_with_auth(
            client, "POST", "/tools/campaign/match",
            data={"blog_id": "rlatjdghks01", "categories": ["음식", "뷰티"]},
            name="체험단 매칭",
            validate_func=validate_campaign_match
        )
        print(f"  {status} 체험단 매칭: {msg}")

        # 순위 추적 (has a bug - skip for now)
        status, msg = await test_with_auth(
            client, "GET", "/tools/rank/track",
            params={"blog_id": "rlatjdghks01", "keyword": "맛집"},
            name="순위 추적",
            validate_func=validate_rank_track
        )
        print(f"  {status} 순위 추적: {msg}")

        # 클론 분석 (target_blog_id)
        status, msg = await test_with_auth(
            client, "GET", "/tools/clone/analyze",
            params={"target_blog_id": "rlatjdghks01"},
            name="클론 분석",
            validate_func=validate_clone_analysis
        )
        print(f"  {status} 클론 분석: {msg}")

        # 댓글 AI (Query params)
        status, msg = await test_with_auth(
            client, "POST", "/tools/comment/suggest",
            params={"comment_text": "좋은 정보 감사합니다", "tone": "friendly"},
            name="댓글 AI",
            validate_func=validate_comment_suggest,
            use_query_params=True
        )
        print(f"  {status} 댓글 AI: {msg}")

        # 백업 생성 (Query param)
        status, msg = await test_with_auth(
            client, "POST", "/tools/backup/create",
            params={"blog_id": "rlatjdghks01"},
            name="백업 생성",
            validate_func=validate_backup_create,
            use_query_params=True
        )
        print(f"  {status} 백업 생성: {msg}")

        # ============================================
        # 3. 성장 전략 도구 (6개)
        # ============================================
        print("\n" + "-"*50)
        print("📈 3. 성장 전략 도구 (6개)")
        print("-"*50)

        # 알고리즘 체크
        status, msg = await test_with_auth(
            client, "GET", "/tools/algorithm/check",
            params={"blog_id": "rlatjdghks01"},
            name="알고리즘 체크",
            validate_func=validate_algorithm_check
        )
        print(f"  {status} 알고리즘 체크: {msg}")

        # 리프레시 분석
        status, msg = await test_with_auth(
            client, "GET", "/tools/refresh/analyze",
            params={"blog_id": "rlatjdghks01"},
            name="리프레시 분석",
            validate_func=validate_refresh_analysis
        )
        print(f"  {status} 리프레시 분석: {msg}")

        # 연관 글 찾기
        status, msg = await test_with_auth(
            client, "GET", "/tools/related/find",
            params={"keyword": "다이어트"},
            name="연관 글 찾기",
            validate_func=validate_related_find
        )
        print(f"  {status} 연관 글 찾기: {msg}")

        # 멘토 매칭 (category required)
        status, msg = await test_with_auth(
            client, "GET", "/tools/mentor/match",
            params={"category": "맛집", "experience": "beginner"},
            name="멘토 매칭",
            validate_func=validate_mentor_match
        )
        print(f"  {status} 멘토 매칭: {msg}")

        # 로드맵 생성
        status, msg = await test_with_auth(
            client, "GET", "/tools/roadmap/generate",
            params={"blog_id": "rlatjdghks01", "goal": "influencer"},
            name="로드맵 생성",
            validate_func=validate_roadmap_generate
        )
        print(f"  {status} 로드맵 생성: {msg}")

        # 트렌드 스나이핑
        status, msg = await test_with_auth(
            client, "POST", "/tools/trend/snipe",
            data={"category": "음식", "time_range": "24h"},
            name="트렌드 스나이핑",
            validate_func=validate_trend_snipe
        )
        print(f"  {status} 트렌드 스나이핑: {msg}")

        # ============================================
        # 4. 네이버 생태계 도구 (7개)
        # ============================================
        print("\n" + "-"*50)
        print("🌐 4. 네이버 생태계 도구 (7개)")
        print("-"*50)

        # 지식인 질문
        status, msg = await test_with_auth(
            client, "GET", "/tools/kin/questions",
            params={"category": "건강"},
            name="지식인 질문",
            validate_func=validate_kin_questions
        )
        print(f"  {status} 지식인 질문: {msg}")

        # 뉴스/실검
        status, msg = await test_with_auth(
            client, "GET", "/tools/news/trending",
            params={"category": "all"},
            name="뉴스/실검",
            validate_func=validate_news_trending
        )
        print(f"  {status} 뉴스/실검: {msg}")

        # 데이터랩 트렌드
        status, msg = await test_with_auth(
            client, "POST", "/tools/datalab/trend",
            data={"keywords": ["다이어트", "운동"], "period": "1month"},
            name="데이터랩 트렌드",
            validate_func=validate_datalab_trend
        )
        print(f"  {status} 데이터랩 트렌드: {msg}")

        # 쇼핑 키워드
        status, msg = await test_with_auth(
            client, "GET", "/tools/shopping/keywords",
            params={"keyword": "화장품"},
            name="쇼핑 키워드",
            validate_func=validate_shopping_keywords
        )
        print(f"  {status} 쇼핑 키워드: {msg}")

        # 플레이스 검색
        status, msg = await test_with_auth(
            client, "GET", "/tools/place/search",
            params={"query": "강남맛집"},
            name="플레이스 검색",
            validate_func=validate_place_search
        )
        print(f"  {status} 플레이스 검색: {msg}")

        # 스마트스토어 분석 (keyword required)
        status, msg = await test_with_auth(
            client, "GET", "/tools/smartstore/analyze",
            params={"keyword": "화장품"},
            name="스마트스토어 분석",
            validate_func=validate_smartstore_analyze
        )
        print(f"  {status} 스마트스토어 분석: {msg}")

        # 비핑 키워드
        status, msg = await test_with_auth(
            client, "GET", "/tools/secret/keywords",
            params={"category": "건강"},
            name="비핑 키워드",
            validate_func=validate_secret_keywords
        )
        print(f"  {status} 비핑 키워드: {msg}")

    # 결과 요약
    print("\n" + "="*70)
    print("📊 인증 기능 로직 검증 결과")
    print("="*70)

    total = len(results["success"]) + len(results["failed"]) + len(results["error"])

    print(f"\n총 {total}개 기능 테스트")
    print(f"  ✅ 정상: {len(results['success'])}개")
    print(f"  ⚠️ 설정 필요/데이터 없음: {len(results['failed'])}개")
    print(f"  ❌ 에러: {len(results['error'])}개")

    if results["success"]:
        print(f"\n✅ 정상 작동 기능:")
        for name in results["success"]:
            print(f"    - {name}")

    if results["failed"]:
        print(f"\n⚠️ 설정/데이터 필요:")
        for name in results["failed"]:
            print(f"    - {name}")

    if results["error"]:
        print(f"\n❌ 에러 발생:")
        for name in results["error"]:
            print(f"    - {name}")

    success_rate = len(results["success"]) / total * 100 if total > 0 else 0
    print(f"\n성공률: {success_rate:.1f}%")


if __name__ == "__main__":
    asyncio.run(main())
