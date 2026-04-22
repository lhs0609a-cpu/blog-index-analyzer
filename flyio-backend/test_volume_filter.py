"""VolumeFilterService 단위 테스트 - Mock 네이버 API로 필터 로직 검증"""
import asyncio
import os
import sys
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

os.environ["DATA_DIR"] = tempfile.mkdtemp()
sys.path.insert(0, ".")
sys.modules.setdefault("jose", MagicMock())

from database.naver_ad_db import (
    init_naver_ad_tables,
    create_volume_filter_job,
    get_volume_filter_job,
    get_volume_filter_results,
    count_volume_filter_results,
)
from services.volume_filter import VolumeFilterService, VolumeFilterConfig

init_naver_ad_tables()


def make_mock_api(volume_map):
    """volume_map: { keyword: monthly_total } - 언급 없는 키워드는 응답 없음 (=검색량 0 취급)"""
    api = MagicMock()

    async def get_keywords_volume_batch(batch):
        result = {}
        for kw in batch:
            if kw in volume_map:
                total = volume_map[kw]
                result[kw] = {
                    "monthly_pc": total // 2,
                    "monthly_mobile": total - total // 2,
                    "monthly_total": total,
                    "comp_idx": "중간",
                }
        return result

    api.get_keywords_volume_batch = AsyncMock(side_effect=get_keywords_volume_batch)
    return api


async def test_basic_threshold_10():
    """월 10 이상만 통과"""
    volumes = {
        "높은검색량": 5000,
        "중간검색량": 50,
        "딱_10": 10,
        "낮은검색량": 9,    # 9 → 탈락
        "매우낮음": 2,       # 2 → 탈락
        # "검색량없음" → 응답에 없음 → 탈락
    }
    api = make_mock_api(volumes)
    svc = VolumeFilterService(api)
    keywords = list(volumes.keys()) + ["검색량없음", "유령키워드"]

    job_id = create_volume_filter_job(user_id=1, filename="t.xlsx", min_volume=10, total_keywords=len(keywords))
    cfg = VolumeFilterConfig(job_id=job_id, user_id=1, min_volume=10)

    with patch("services.volume_filter.API_DELAY", 0):
        result = await svc.run(cfg, keywords)

    assert result["success"]
    assert result["total"] == 7
    assert result["passed"] == 3, f"통과 3개 예상, 실제 {result['passed']}"
    results = get_volume_filter_results(job_id)
    passed_kws = {r["keyword"] for r in results}
    assert passed_kws == {"높은검색량", "중간검색량", "딱_10"}
    print(f"[PASS] 임계치 10: 통과 {result['passed']}/{result['total']} (높은/중간/딱_10)")


async def test_dedup():
    """중복 키워드 제거"""
    volumes = {"키워드A": 100, "키워드B": 50}
    api = make_mock_api(volumes)
    svc = VolumeFilterService(api)
    keywords = ["키워드A", "키워드A", "키워드B", "키워드A"]  # 4개 중 2개 유니크

    job_id = create_volume_filter_job(user_id=1, filename="t.xlsx", min_volume=10, total_keywords=4)
    cfg = VolumeFilterConfig(job_id=job_id, user_id=1, min_volume=10)
    with patch("services.volume_filter.API_DELAY", 0):
        result = await svc.run(cfg, keywords)

    assert result["total"] == 2
    assert result["passed"] == 2
    print(f"[PASS] 중복 제거 → 4개 입력 → 2개 유니크 → 2개 통과")


async def test_high_threshold_100():
    """임계치를 100으로 높이면 중간검색량(50)도 탈락"""
    volumes = {"높은": 5000, "중간": 50, "딱100": 100, "낮음": 99}
    api = make_mock_api(volumes)
    svc = VolumeFilterService(api)
    job_id = create_volume_filter_job(user_id=1, filename="t.xlsx", min_volume=100, total_keywords=4)
    cfg = VolumeFilterConfig(job_id=job_id, user_id=1, min_volume=100)
    with patch("services.volume_filter.API_DELAY", 0):
        result = await svc.run(cfg, ["높은", "중간", "딱100", "낮음"])

    assert result["passed"] == 2, f"expected 2 (높은, 딱100), got {result['passed']}"
    passed = {r["keyword"] for r in get_volume_filter_results(job_id)}
    assert passed == {"높은", "딱100"}
    print(f"[PASS] 임계치 100 → 2개 (높은, 딱100)")


async def test_api_batch_size_5():
    """API가 5개씩 호출되는지"""
    volumes = {f"kw{i}": 100 for i in range(23)}
    api = make_mock_api(volumes)
    svc = VolumeFilterService(api)
    job_id = create_volume_filter_job(user_id=1, filename="t.xlsx", min_volume=10, total_keywords=23)
    cfg = VolumeFilterConfig(job_id=job_id, user_id=1, min_volume=10)
    with patch("services.volume_filter.API_DELAY", 0):
        await svc.run(cfg, list(volumes.keys()))

    # 23개 / 5 = 5배치 (5+5+5+5+3)
    assert api.get_keywords_volume_batch.call_count == 5
    # 각 호출 크기 확인
    sizes = [len(c.args[0]) for c in api.get_keywords_volume_batch.call_args_list]
    assert sizes == [5, 5, 5, 5, 3], f"배치 크기 {sizes}"
    print(f"[PASS] 23개 → 5개씩 5배치 [5,5,5,5,3]")


async def test_api_failure_tolerance():
    """일부 API 호출이 실패해도 job 전체는 계속 진행"""
    api = MagicMock()
    call_count = {"n": 0}

    async def side_effect(batch):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise Exception("네이버 API 타임아웃")
        return {kw: {"monthly_pc": 50, "monthly_mobile": 50, "monthly_total": 100, "comp_idx": ""} for kw in batch}

    api.get_keywords_volume_batch = AsyncMock(side_effect=side_effect)

    svc = VolumeFilterService(api)
    keywords = [f"kw{i}" for i in range(15)]  # 3배치 (5+5+5)
    job_id = create_volume_filter_job(user_id=1, filename="t.xlsx", min_volume=10, total_keywords=15)
    cfg = VolumeFilterConfig(job_id=job_id, user_id=1, min_volume=10)
    with patch("services.volume_filter.API_DELAY", 0):
        result = await svc.run(cfg, keywords)

    # 2번째 배치 5개 실패, 나머지 10개 통과
    assert result["passed"] == 10, f"expected 10, got {result['passed']}"
    assert result["failed_api"] == 5
    print(f"[PASS] API 중간 실패 내성 → 10 통과 + 5 API실패")


async def test_space_insensitive_match():
    """공백 차이 있는 키워드도 매칭"""
    api = MagicMock()

    async def side_effect(batch):
        # 네이버가 "블로그 마케팅" 형태로 응답
        return {"블로그 마케팅": {"monthly_pc": 500, "monthly_mobile": 500, "monthly_total": 1000, "comp_idx": ""}}

    api.get_keywords_volume_batch = AsyncMock(side_effect=side_effect)
    svc = VolumeFilterService(api)
    # 사용자는 "블로그마케팅" 공백없이 입력
    keywords = ["블로그마케팅"]
    job_id = create_volume_filter_job(user_id=1, filename="t.xlsx", min_volume=10, total_keywords=1)
    cfg = VolumeFilterConfig(job_id=job_id, user_id=1, min_volume=10)
    with patch("services.volume_filter.API_DELAY", 0):
        result = await svc.run(cfg, keywords)

    assert result["passed"] == 1, f"공백 무관 매칭 실패: {result}"
    print(f"[PASS] 공백 차이 매칭 → 1개 통과")


async def test_large_scale_5000():
    """5000개 시뮬레이션 - 절반만 검색량 있음"""
    volumes = {f"kw{i}": (i % 3) * 50 + 10 for i in range(5000)}  # 전부 10 이상
    # 그 중 1/3은 검색량 없음으로 만듦
    api = MagicMock()

    async def side_effect(batch):
        return {
            kw: {
                "monthly_pc": volumes[kw] // 2,
                "monthly_mobile": volumes[kw] - volumes[kw] // 2,
                "monthly_total": volumes[kw],
                "comp_idx": "",
            }
            for kw in batch if int(kw[2:]) % 3 != 0  # 3의 배수는 응답 없음
        }

    api.get_keywords_volume_batch = AsyncMock(side_effect=side_effect)
    svc = VolumeFilterService(api)
    keywords = list(volumes.keys())
    job_id = create_volume_filter_job(user_id=1, filename="t.xlsx", min_volume=10, total_keywords=5000)
    cfg = VolumeFilterConfig(job_id=job_id, user_id=1, min_volume=10)
    with patch("services.volume_filter.API_DELAY", 0):
        result = await svc.run(cfg, keywords)

    # 3의 배수 제외: 5000 - 1667 = 3333 정도 예상
    assert 3300 < result["passed"] < 3400, f"expected ~3333, got {result['passed']}"
    assert count_volume_filter_results(job_id) == result["passed"]
    print(f"[PASS] 5000개 중 {result['passed']}개 통과 (3배수 응답 없는 것 제외)")


async def test_job_status_completed():
    """완료 후 job 상태가 completed로 세팅"""
    api = make_mock_api({"a": 100})
    svc = VolumeFilterService(api)
    job_id = create_volume_filter_job(user_id=1, filename="t.xlsx", min_volume=10, total_keywords=1)
    cfg = VolumeFilterConfig(job_id=job_id, user_id=1, min_volume=10)
    with patch("services.volume_filter.API_DELAY", 0):
        await svc.run(cfg, ["a"])

    job = get_volume_filter_job(job_id)
    assert job["status"] == "completed"
    assert job["processed_count"] == 1
    assert job["passed_count"] == 1
    assert job["completed_at"] is not None
    print(f"[PASS] job 상태 completed 정상 세팅")


async def test_empty_input():
    """빈 입력도 깔끔히 처리"""
    api = make_mock_api({})
    svc = VolumeFilterService(api)
    job_id = create_volume_filter_job(user_id=1, filename="t.xlsx", min_volume=10, total_keywords=0)
    cfg = VolumeFilterConfig(job_id=job_id, user_id=1, min_volume=10)
    result = await svc.run(cfg, [])

    assert result["success"]
    assert result["passed"] == 0
    print(f"[PASS] 빈 입력 처리")


async def main():
    tests = [
        test_basic_threshold_10,
        test_dedup,
        test_high_threshold_100,
        test_api_batch_size_5,
        test_api_failure_tolerance,
        test_space_insensitive_match,
        test_large_scale_5000,
        test_job_status_completed,
        test_empty_input,
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
    sys.exit(asyncio.run(main()))
