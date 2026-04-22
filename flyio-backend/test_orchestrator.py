"""BulkUploadOrchestrator 단위 테스트 - 실제 API 호출 없이 Mock으로 검증.
검증 포인트:
1. 키워드 수에 따른 캠페인/광고그룹 분할 정확성
2. 500개/그룹, 1000그룹/캠페인 제한 준수
3. DB 진행률 추적
4. 실패 키워드 기록
"""
import asyncio
import os
import sys
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

# 테스트용 임시 DB 경로
os.environ["DATA_DIR"] = tempfile.mkdtemp()
sys.path.insert(0, ".")

# jose가 없어도 DB 모듈은 독립적으로 임포트 가능하게
sys.modules.setdefault("jose", MagicMock())
sys.modules.setdefault("jose.JWTError", MagicMock())
sys.modules.setdefault("jose.jwt", MagicMock())


from database.naver_ad_db import (
    init_naver_ad_tables,
    create_bulk_upload_job,
    get_bulk_upload_job,
    get_bulk_upload_failures,
)
from services.bulk_upload_orchestrator import (
    BulkUploadOrchestrator,
    BulkJobConfig,
    MAX_AD_GROUPS_PER_CAMPAIGN,
)

init_naver_ad_tables()


def make_mock_api():
    """네이버 API 클라이언트 Mock - 캠페인/그룹/키워드 생성 응답 흉내"""
    api = MagicMock()
    campaign_counter = {"n": 0}
    adgroup_counter = {"n": 0}

    async def create_campaign(name, daily_budget=10000, **kw):
        campaign_counter["n"] += 1
        return {"nccCampaignId": f"camp_{campaign_counter['n']:03d}", "name": name}

    async def create_ad_group(campaign_id, name, bid_amt=70):
        adgroup_counter["n"] += 1
        return {"nccAdgroupId": f"grp_{adgroup_counter['n']:05d}", "name": name}

    async def create_keywords(payload):
        # 모든 키워드 성공 응답
        return [{"nccKeywordId": f"kw_{i}", "keyword": p["keyword"]} for i, p in enumerate(payload)]

    api.create_campaign = AsyncMock(side_effect=create_campaign)
    api.create_ad_group = AsyncMock(side_effect=create_ad_group)
    api.create_keywords = AsyncMock(side_effect=create_keywords)
    return api


async def test_small_scale_500():
    """500개 → 캠페인 1개, 광고그룹 1개"""
    api = make_mock_api()
    orch = BulkUploadOrchestrator(api)
    keywords = [f"키워드{i}" for i in range(500)]

    job_id = create_bulk_upload_job(
        user_id=1, filename="test.xlsx", campaign_prefix="test",
        keywords_per_group=500, bid=100, daily_budget=10000, total_keywords=500,
    )
    cfg = BulkJobConfig(job_id=job_id, user_id=1, campaign_prefix="test", bid=100)

    with patch("services.bulk_upload_orchestrator.API_RATE_LIMIT_DELAY", 0):
        result = await orch.run(cfg, keywords)

    assert result["success"]
    assert result["campaigns"] == 1, f"expected 1 campaign, got {result['campaigns']}"
    assert result["ad_groups"] == 1, f"expected 1 ad group, got {result['ad_groups']}"
    assert result["succeeded"] == 500
    assert result["failed"] == 0

    job = get_bulk_upload_job(job_id)
    assert job["status"] == "completed"
    assert job["processed_count"] == 500
    print(f"[PASS] 500개 → 캠페인 1 + 그룹 1 + 전부 성공")


async def test_medium_scale_2500():
    """2500개 → 500개씩 5그룹 (캠페인 1개)"""
    api = make_mock_api()
    orch = BulkUploadOrchestrator(api)
    keywords = [f"키워드{i}" for i in range(2500)]

    job_id = create_bulk_upload_job(
        user_id=1, filename="test.xlsx", campaign_prefix="test2",
        keywords_per_group=500, bid=100, daily_budget=10000, total_keywords=2500,
    )
    cfg = BulkJobConfig(job_id=job_id, user_id=1, campaign_prefix="test2", bid=100)

    with patch("services.bulk_upload_orchestrator.API_RATE_LIMIT_DELAY", 0):
        result = await orch.run(cfg, keywords)

    assert result["campaigns"] == 1
    assert result["ad_groups"] == 5
    assert result["succeeded"] == 2500
    assert result["failed"] == 0
    # 키워드 배치 호출 횟수: 100개씩 × 5그룹 = 25회
    assert api.create_keywords.call_count == 25, f"expected 25 calls, got {api.create_keywords.call_count}"
    print(f"[PASS] 2500개 → 그룹 5 + 배치 25회 + 모두 성공")


async def test_large_scale_100k():
    """10만개 → 500개씩 200그룹 → 캠페인 1개 (200 <= 1000)"""
    api = make_mock_api()
    orch = BulkUploadOrchestrator(api)
    total = 100_000
    keywords = [f"kw{i}" for i in range(total)]

    job_id = create_bulk_upload_job(
        user_id=1, filename="test.xlsx", campaign_prefix="mass",
        keywords_per_group=500, bid=100, daily_budget=10000, total_keywords=total,
    )
    cfg = BulkJobConfig(job_id=job_id, user_id=1, campaign_prefix="mass", bid=100)

    with patch("services.bulk_upload_orchestrator.API_RATE_LIMIT_DELAY", 0):
        result = await orch.run(cfg, keywords)

    assert result["campaigns"] == 1, f"expected 1 campaign, got {result['campaigns']}"
    assert result["ad_groups"] == 200, f"expected 200 ad groups, got {result['ad_groups']}"
    assert result["succeeded"] == total
    assert result["failed"] == 0
    print(f"[PASS] 10만개 → 캠페인 1 + 그룹 200 + 전부 성공")


async def test_campaign_overflow():
    """60만개 → 500개 × 1200그룹 = 캠페인 2개 필요 (1000그룹/캠페인)"""
    api = make_mock_api()
    orch = BulkUploadOrchestrator(api)
    total = 600_000
    keywords = [f"kw{i}" for i in range(total)]

    job_id = create_bulk_upload_job(
        user_id=1, filename="x.xlsx", campaign_prefix="big",
        keywords_per_group=500, bid=100, daily_budget=10000, total_keywords=total,
    )
    cfg = BulkJobConfig(job_id=job_id, user_id=1, campaign_prefix="big", bid=100)

    with patch("services.bulk_upload_orchestrator.API_RATE_LIMIT_DELAY", 0):
        result = await orch.run(cfg, keywords)

    assert result["campaigns"] == 2, f"expected 2 campaigns, got {result['campaigns']}"
    assert result["ad_groups"] == 1200
    assert result["succeeded"] == total
    print(f"[PASS] 60만개 → 캠페인 2 + 그룹 1200 (1000 overflow 분할)")


async def test_ad_group_creation_failure():
    """그룹 생성 실패 시 해당 청크가 실패 기록에 들어가고 나머지는 계속 진행"""
    api = make_mock_api()
    # 두 번째 광고그룹 생성에서 실패
    call_count = {"n": 0}
    original = api.create_ad_group.side_effect

    async def ag_side_effect(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise Exception("네이버 API 500 에러 (시뮬레이션)")
        return await original(*args, **kwargs)

    api.create_ad_group = AsyncMock(side_effect=ag_side_effect)

    orch = BulkUploadOrchestrator(api)
    keywords = [f"키워드{i}" for i in range(1500)]  # 3그룹
    job_id = create_bulk_upload_job(
        user_id=1, filename="x.xlsx", campaign_prefix="err",
        keywords_per_group=500, bid=100, daily_budget=10000, total_keywords=1500,
    )
    cfg = BulkJobConfig(job_id=job_id, user_id=1, campaign_prefix="err", bid=100)

    with patch("services.bulk_upload_orchestrator.API_RATE_LIMIT_DELAY", 0):
        result = await orch.run(cfg, keywords)

    # 2그룹 성공(1000개) + 1그룹 실패(500개)
    assert result["succeeded"] == 1000, f"expected 1000, got {result['succeeded']}"
    assert result["failed"] == 500, f"expected 500 failures, got {result['failed']}"
    failures = get_bulk_upload_failures(job_id)
    assert len(failures) == 500
    assert all("광고그룹 생성 실패" in f["reason"] for f in failures)
    print(f"[PASS] 그룹 생성 실패 시 해당 청크만 실패 기록, 나머지 정상 진행")


async def test_keyword_api_partial_failure():
    """키워드 배치에서 일부만 응답 올 때 차이를 실패로 기록"""
    api = make_mock_api()

    async def partial_response(payload):
        # 80개만 성공 반환 (100개 보냈는데 20개 누락)
        if len(payload) == 100:
            return [{"nccKeywordId": f"kw_{i}", "keyword": p["keyword"]} for i, p in enumerate(payload[:80])]
        return [{"nccKeywordId": f"kw_{i}", "keyword": p["keyword"]} for i, p in enumerate(payload)]

    api.create_keywords = AsyncMock(side_effect=partial_response)

    orch = BulkUploadOrchestrator(api)
    keywords = [f"키워드{i}" for i in range(100)]  # 1그룹, 1배치
    job_id = create_bulk_upload_job(
        user_id=1, filename="x.xlsx", campaign_prefix="partial",
        keywords_per_group=500, bid=100, daily_budget=10000, total_keywords=100,
    )
    cfg = BulkJobConfig(job_id=job_id, user_id=1, campaign_prefix="partial", bid=100)

    with patch("services.bulk_upload_orchestrator.API_RATE_LIMIT_DELAY", 0):
        result = await orch.run(cfg, keywords)

    assert result["succeeded"] == 80
    assert result["failed"] == 20
    print(f"[PASS] 부분 응답 처리 → 성공 80 + 실패 20")


async def test_keyword_batch_exception():
    """키워드 API 호출 자체가 예외 던질 때 해당 배치 전부 실패 기록"""
    api = make_mock_api()

    async def always_fail(payload):
        raise Exception("타임아웃")

    api.create_keywords = AsyncMock(side_effect=always_fail)

    orch = BulkUploadOrchestrator(api)
    keywords = [f"키워드{i}" for i in range(250)]
    job_id = create_bulk_upload_job(
        user_id=1, filename="x.xlsx", campaign_prefix="fail",
        keywords_per_group=500, bid=100, daily_budget=10000, total_keywords=250,
    )
    cfg = BulkJobConfig(job_id=job_id, user_id=1, campaign_prefix="fail", bid=100)

    with patch("services.bulk_upload_orchestrator.API_RATE_LIMIT_DELAY", 0):
        result = await orch.run(cfg, keywords)

    assert result["succeeded"] == 0
    assert result["failed"] == 250
    failures = get_bulk_upload_failures(job_id)
    assert all("타임아웃" in f["reason"] for f in failures)
    job = get_bulk_upload_job(job_id)
    assert job["status"] == "completed_with_errors"
    print(f"[PASS] 키워드 API 전체 실패 → 250개 모두 실패 기록 + 상태 completed_with_errors")


async def test_custom_per_group():
    """광고그룹당 키워드 수를 100개로 설정 → 10개 그룹"""
    api = make_mock_api()
    orch = BulkUploadOrchestrator(api)
    keywords = [f"키워드{i}" for i in range(1000)]
    job_id = create_bulk_upload_job(
        user_id=1, filename="x.xlsx", campaign_prefix="small",
        keywords_per_group=100, bid=100, daily_budget=10000, total_keywords=1000,
    )
    cfg = BulkJobConfig(
        job_id=job_id, user_id=1, campaign_prefix="small",
        bid=100, keywords_per_group=100,
    )

    with patch("services.bulk_upload_orchestrator.API_RATE_LIMIT_DELAY", 0):
        result = await orch.run(cfg, keywords)

    assert result["ad_groups"] == 10
    assert result["succeeded"] == 1000
    print(f"[PASS] 그룹당 100개 커스텀 → 10그룹 생성")


async def test_bid_applied_to_all():
    """모든 키워드 페이로드의 bidAmt가 cfg.bid와 일치하는지"""
    api = make_mock_api()
    orch = BulkUploadOrchestrator(api)
    keywords = [f"키워드{i}" for i in range(300)]

    captured_payloads = []

    async def capture(payload):
        captured_payloads.append(payload)
        return [{"nccKeywordId": f"k{i}", "keyword": p["keyword"]} for i, p in enumerate(payload)]

    api.create_keywords = AsyncMock(side_effect=capture)

    job_id = create_bulk_upload_job(
        user_id=1, filename="x.xlsx", campaign_prefix="bid",
        keywords_per_group=500, bid=777, daily_budget=10000, total_keywords=300,
    )
    cfg = BulkJobConfig(job_id=job_id, user_id=1, campaign_prefix="bid", bid=777)

    with patch("services.bulk_upload_orchestrator.API_RATE_LIMIT_DELAY", 0):
        await orch.run(cfg, keywords)

    # 모든 페이로드 bidAmt 검증
    all_items = [item for batch in captured_payloads for item in batch]
    assert len(all_items) == 300
    assert all(item["bidAmt"] == 777 for item in all_items), \
        f"bid 불일치: {set(item['bidAmt'] for item in all_items)}"
    print(f"[PASS] 입찰가 777원이 300개 키워드 전부에 일괄 적용")


async def main():
    tests = [
        test_small_scale_500,
        test_medium_scale_2500,
        test_large_scale_100k,
        test_campaign_overflow,
        test_ad_group_creation_failure,
        test_keyword_api_partial_failure,
        test_keyword_batch_exception,
        test_custom_per_group,
        test_bid_applied_to_all,
    ]
    passed = 0
    failed = 0
    for t in tests:
        try:
            await t()
            passed += 1
        except AssertionError as e:
            print(f"[FAIL] {t.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"[ERROR] {t.__name__}: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            failed += 1
    print(f"\n{'='*60}")
    print(f"Total {passed + failed} / Passed {passed} / Failed {failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
