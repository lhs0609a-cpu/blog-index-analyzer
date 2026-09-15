"""
성장 진단 API (관리자 전용).

"유저가 들어오는데 왜 가입을 안 하고, 왜 결제가 안 되는가" 에 답하는 화면의 백엔드.
집계는 전부 services/growth_diagnostics 에 있고 여기는 인증과 노출만 한다.
"""
import logging

from fastapi import APIRouter, Depends, Query

from routers.admin import require_admin
from services import growth_diagnostics as gd

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/growth", tags=["성장진단"])


@router.get("/diagnostics")
async def diagnostics(
    days: int = Query(30, ge=1, le=180),
    admin: dict = Depends(require_admin),
):
    """
    퍼널 점수 + 처방.

    인증: 관리자만. 전환율과 매출은 영업 정보다.
    """
    return gd.diagnose(days=days)


@router.get("/benchmarks")
async def benchmarks(admin: dict = Depends(require_admin)):
    """
    점수의 기준이 되는 세계 SaaS 벤치마크 원본.

    별도 엔드포인트로 뺀 이유: "이 점수 기준이 뭐냐" 는 질문에 화면 안에서
    바로 답할 수 있어야 하고, 기준을 갱신했는지도 여기서 확인된다.
    """
    return {
        "benchmarks": [
            {
                "key": b.key, "label": b.label,
                "floor": b.floor, "median": b.median, "great": b.great,
                "source": b.source, "grade": b.grade, "note": b.note,
            }
            for b in gd.BENCHMARKS.values()
        ],
        "no_benchmark": gd.NO_BENCHMARK_REASON,
        "scoring": {
            "method": "관측 비율을 로그오즈 공간에서 floor/median/great 세 지점으로 0~100 환산",
            "anchors": {"floor": 0, "median": 50, "great": 90},
            "why_logit": (
                "2%→4% 와 40%→57% 은 같은 크기의 성취다. 선형 보간은 저전환 구간을 "
                "전부 0점 근처에 뭉개 구분을 없앤다."
            ),
            "gates": {
                "min_conversions": gd.MIN_CONVERSIONS,
                "min_denominator": gd.MIN_DENOM,
                "confident_conversions": gd.CONFIDENT_CONVERSIONS,
                "note": (
                    f"전환 {gd.MIN_CONVERSIONS}건 미만 또는 분모 {gd.MIN_DENOM}명 미만이면 "
                    f"점수를 내지 않는다. 전환 {gd.CONFIDENT_CONVERSIONS}건 미만은 윌슨 "
                    "하한으로 보수적으로 채점하고 중앙값 쪽으로 수축시킨다."
                ),
            },
        },
        "toss_buckets": {
            code: {"bucket": b, "label": label, "fix": fix}
            for code, (b, label, fix) in gd.TOSS_BUCKETS.items()
        },
        "product_facts": gd.PRODUCT_FACTS,
    }
