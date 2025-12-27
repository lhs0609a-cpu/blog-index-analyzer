"""
광고 플랫폼 API 실제 테스트 스크립트
더미 데이터 없이 실제 API 호출 테스트
"""
import asyncio
import json
import sys
import io
from datetime import datetime, timedelta

# UTF-8 출력 강제
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 환경 설정
sys.path.insert(0, '.')

from config import settings
from services.ad_platforms.naver_searchad import NaverSearchAdService
from services.ad_platforms import OptimizationStrategy


async def test_naver_searchad():
    """네이버 검색광고 API 테스트"""
    print("\n" + "="*60)
    print("🔍 네이버 검색광고 API 테스트")
    print("="*60)

    # API 자격증명 확인
    print(f"\n[자격증명 확인]")
    print(f"  Customer ID: {settings.NAVER_AD_CUSTOMER_ID}")
    print(f"  API Key: {settings.NAVER_AD_API_KEY[:20]}..." if settings.NAVER_AD_API_KEY else "  API Key: 없음")
    print(f"  Secret Key: {settings.NAVER_AD_SECRET_KEY[:20]}..." if settings.NAVER_AD_SECRET_KEY else "  Secret Key: 없음")

    if not all([settings.NAVER_AD_CUSTOMER_ID, settings.NAVER_AD_API_KEY, settings.NAVER_AD_SECRET_KEY]):
        print("\n❌ 네이버 검색광고 자격증명이 설정되지 않았습니다.")
        return False

    service = NaverSearchAdService()

    try:
        # 1. 연결 테스트
        print(f"\n[1. 연결 테스트]")
        connected = await service.connect()
        print(f"  연결 상태: {'✅ 성공' if connected else '❌ 실패'}")

        if not connected:
            return False

        # 2. 계정 정보 조회
        print(f"\n[2. 계정 정보]")
        account_info = await service.get_account_info()
        print(f"  플랫폼: {account_info.get('platform', 'N/A')}")
        print(f"  고객 ID: {account_info.get('customer_id', 'N/A')}")
        print(f"  총 캠페인: {account_info.get('total_campaigns', 0)}개")
        print(f"  활성 캠페인: {account_info.get('active_campaigns', 0)}개")

        # 3. 캠페인 목록 조회
        print(f"\n[3. 캠페인 목록]")
        campaigns = await service.get_campaigns()
        print(f"  총 {len(campaigns)}개 캠페인")

        for i, camp in enumerate(campaigns[:5]):  # 최대 5개만 표시
            print(f"\n  [{i+1}] {camp.name}")
            print(f"      ID: {camp.campaign_id}")
            print(f"      상태: {camp.status}")
            print(f"      예산: {camp.budget:,}원")
            print(f"      노출: {camp.impressions:,}회")
            print(f"      클릭: {camp.clicks:,}회")
            print(f"      비용: {camp.cost:,}원")
            print(f"      전환: {camp.conversions}건")
            print(f"      ROAS: {camp.roas:.1f}%")

        # 4. 키워드 조회 (첫 번째 캠페인의 광고그룹)
        if campaigns:
            print(f"\n[4. 키워드 목록]")
            keywords = await service.get_keywords()
            print(f"  총 {len(keywords)}개 키워드")

            for i, kw in enumerate(keywords[:10]):  # 최대 10개만 표시
                print(f"\n  [{i+1}] {kw.keyword_text}")
                print(f"      입찰가: {kw.bid_amount:,}원")
                print(f"      상태: {kw.status}")
                print(f"      품질지수: {kw.quality_score}")
                print(f"      노출: {kw.impressions:,}회")
                print(f"      클릭: {kw.clicks:,}회")
                print(f"      CTR: {kw.ctr:.2f}%")
                print(f"      비용: {kw.cost:,}원")
                print(f"      전환: {kw.conversions}건")
                print(f"      ROAS: {kw.roas:.1f}%")

        # 5. 성과 데이터 조회
        print(f"\n[5. 성과 데이터 (최근 7일)]")
        end_date = datetime.now()
        start_date = end_date - timedelta(days=7)
        performance = await service.get_performance(start_date, end_date)

        total_cost = sum(p.cost for p in performance)
        total_revenue = sum(p.revenue for p in performance)
        total_conversions = sum(p.conversions for p in performance)

        print(f"  총 비용: {total_cost:,}원")
        print(f"  총 매출: {total_revenue:,}원")
        print(f"  총 전환: {total_conversions}건")
        print(f"  ROAS: {(total_revenue/total_cost*100) if total_cost > 0 else 0:.1f}%")

        # 6. 최적화 시뮬레이션 (실제 변경 없이 분석만)
        print(f"\n[6. 최적화 분석]")
        print(f"  ⚠️ 실제 입찰가 변경은 수행하지 않습니다 (테스트 모드)")

        # 최적화가 필요한 키워드 분석
        needs_increase = []
        needs_decrease = []
        needs_pause = []

        for kw in keywords:
            if kw.conversions > 0 and kw.cost > 0:
                roas = kw.roas
                cpa = kw.cost / kw.conversions

                if roas > 300 and cpa < 20000:
                    needs_increase.append({
                        "keyword": kw.keyword_text,
                        "current_bid": kw.bid_amount,
                        "suggested_bid": int(kw.bid_amount * 1.2),
                        "reason": f"고효율 (ROAS {roas:.0f}%, CPA {cpa:,.0f}원)"
                    })
                elif roas < 100 or cpa > 40000:
                    needs_decrease.append({
                        "keyword": kw.keyword_text,
                        "current_bid": kw.bid_amount,
                        "suggested_bid": int(kw.bid_amount * 0.8),
                        "reason": f"저효율 (ROAS {roas:.0f}%, CPA {cpa:,.0f}원)"
                    })
            elif kw.clicks >= 30 and kw.conversions == 0 and kw.cost > 20000:
                needs_pause.append({
                    "keyword": kw.keyword_text,
                    "current_bid": kw.bid_amount,
                    "reason": f"전환 없음 (클릭 {kw.clicks}회, 비용 {kw.cost:,}원)"
                })

        print(f"\n  📈 입찰가 인상 추천: {len(needs_increase)}개")
        for item in needs_increase[:3]:
            print(f"      - {item['keyword']}: {item['current_bid']:,}원 → {item['suggested_bid']:,}원")
            print(f"        ({item['reason']})")

        print(f"\n  📉 입찰가 인하 추천: {len(needs_decrease)}개")
        for item in needs_decrease[:3]:
            print(f"      - {item['keyword']}: {item['current_bid']:,}원 → {item['suggested_bid']:,}원")
            print(f"        ({item['reason']})")

        print(f"\n  ⏸️ 일시정지 추천: {len(needs_pause)}개")
        for item in needs_pause[:3]:
            print(f"      - {item['keyword']}")
            print(f"        ({item['reason']})")

        await service.disconnect()
        print(f"\n✅ 네이버 검색광고 테스트 완료")
        return True

    except Exception as e:
        print(f"\n❌ 테스트 실패: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """메인 테스트 함수"""
    print("\n" + "="*60)
    print("🚀 광고 플랫폼 API 실제 테스트")
    print("="*60)
    print(f"테스트 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    results = {}

    # 네이버 검색광고 테스트
    results["naver_searchad"] = await test_naver_searchad()

    # 결과 요약
    print("\n" + "="*60)
    print("📊 테스트 결과 요약")
    print("="*60)

    for platform, success in results.items():
        status = "✅ 성공" if success else "❌ 실패"
        print(f"  {platform}: {status}")

    print("\n")


if __name__ == "__main__":
    asyncio.run(main())
