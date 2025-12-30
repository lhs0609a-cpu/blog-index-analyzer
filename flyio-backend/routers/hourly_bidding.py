"""
시간대별 입찰 최적화 API
- 시간대/요일별 입찰 가중치 설정
- 프리셋 템플릿 적용
- 성과 데이터 기반 자동 최적화
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from datetime import datetime
import logging

from routers.auth import get_current_user
from services.hourly_bid_optimizer import get_hourly_optimizer
from database.ad_optimization_db import (
    get_hourly_bid_schedule,
    save_hourly_bid_schedule,
    get_user_hourly_schedules,
    delete_hourly_bid_schedule,
    get_hourly_performance_aggregated,
    get_best_performing_hours,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ads/hourly-bidding", tags=["Hourly Bidding"])


# ============ Request/Response Models ============

class HourlyModifiersRequest(BaseModel):
    """시간대별 가중치 설정 요청"""
    platform_id: str
    hourly_modifiers: Dict[int, float] = Field(
        default_factory=lambda: {h: 1.0 for h in range(24)},
        description="시간대별 가중치 (0-23시)"
    )
    daily_modifiers: Dict[int, float] = Field(
        default_factory=lambda: {d: 1.0 for d in range(7)},
        description="요일별 가중치 (0=월요일, 6=일요일)"
    )
    auto_optimize: bool = Field(default=True, description="자동 최적화 활성화")
    campaign_id: Optional[str] = None


class SpecialSlotRequest(BaseModel):
    """특별 시간대 설정 요청"""
    platform_id: str
    hour: int = Field(ge=0, le=23)
    modifier: float = Field(ge=0.3, le=2.0)
    day_of_week: Optional[int] = Field(default=None, ge=0, le=6)


class PresetApplyRequest(BaseModel):
    """프리셋 적용 요청"""
    platform_id: str
    preset_name: str


class AutoOptimizeRequest(BaseModel):
    """자동 최적화 요청"""
    platform_id: str
    optimization_target: str = Field(
        default="conversions",
        description="최적화 목표 (conversions, roas, ctr)"
    )


class ScheduleSummaryResponse(BaseModel):
    """스케줄 요약 응답"""
    platform_id: str
    hourly_modifiers: Dict[int, float]
    daily_modifiers: Dict[int, float]
    special_slots: List[Dict[str, Any]]
    auto_optimize: bool
    insights: Dict[str, Any]


# ============ API Endpoints ============

@router.get("/schedule/{platform_id}")
async def get_schedule(
    platform_id: str,
    current_user: dict = Depends(get_current_user)
):
    """시간대별 입찰 스케줄 조회"""
    user_id = current_user.get("id")
    optimizer = get_hourly_optimizer()

    summary = optimizer.get_schedule_summary(user_id, platform_id)

    return {
        "success": True,
        "data": summary
    }


@router.get("/schedules")
async def get_all_schedules(
    current_user: dict = Depends(get_current_user)
):
    """사용자의 모든 시간대별 스케줄 조회"""
    user_id = current_user.get("id")
    schedules = get_user_hourly_schedules(user_id)

    return {
        "success": True,
        "data": schedules
    }


@router.post("/schedule")
async def save_schedule(
    request: HourlyModifiersRequest,
    current_user: dict = Depends(get_current_user)
):
    """시간대별 입찰 스케줄 저장"""
    user_id = current_user.get("id")
    optimizer = get_hourly_optimizer()

    # 가중치 일괄 설정
    optimizer.set_bulk_modifiers(
        user_id=user_id,
        platform_id=request.platform_id,
        hourly=request.hourly_modifiers,
        daily=request.daily_modifiers
    )

    # auto_optimize 설정 업데이트
    schedule = optimizer.get_schedule(user_id, request.platform_id)
    schedule.auto_optimize = request.auto_optimize

    return {
        "success": True,
        "message": "시간대별 입찰 스케줄이 저장되었습니다.",
        "data": optimizer.get_schedule_summary(user_id, request.platform_id)
    }


@router.put("/schedule/{platform_id}/hourly/{hour}")
async def update_hourly_modifier(
    platform_id: str,
    hour: int,
    modifier: float,
    current_user: dict = Depends(get_current_user)
):
    """특정 시간대 가중치 업데이트"""
    if hour < 0 or hour > 23:
        raise HTTPException(status_code=400, detail="시간은 0-23 범위여야 합니다.")

    if modifier < 0.3 or modifier > 2.0:
        raise HTTPException(status_code=400, detail="가중치는 0.3-2.0 범위여야 합니다.")

    user_id = current_user.get("id")
    optimizer = get_hourly_optimizer()

    optimizer.set_hourly_modifier(user_id, platform_id, hour, modifier)

    return {
        "success": True,
        "message": f"{hour}시 가중치가 {modifier}로 설정되었습니다."
    }


@router.put("/schedule/{platform_id}/daily/{day}")
async def update_daily_modifier(
    platform_id: str,
    day: int,
    modifier: float,
    current_user: dict = Depends(get_current_user)
):
    """특정 요일 가중치 업데이트"""
    if day < 0 or day > 6:
        raise HTTPException(status_code=400, detail="요일은 0-6 범위여야 합니다 (0=월요일).")

    if modifier < 0.3 or modifier > 2.0:
        raise HTTPException(status_code=400, detail="가중치는 0.3-2.0 범위여야 합니다.")

    user_id = current_user.get("id")
    optimizer = get_hourly_optimizer()

    optimizer.set_daily_modifier(user_id, platform_id, day, modifier)

    day_names = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]

    return {
        "success": True,
        "message": f"{day_names[day]} 가중치가 {modifier}로 설정되었습니다."
    }


@router.post("/schedule/special-slot")
async def add_special_slot(
    request: SpecialSlotRequest,
    current_user: dict = Depends(get_current_user)
):
    """특별 시간대 추가 (예: 금요일 저녁 할증)"""
    user_id = current_user.get("id")
    optimizer = get_hourly_optimizer()

    optimizer.add_special_slot(
        user_id=user_id,
        platform_id=request.platform_id,
        hour=request.hour,
        modifier=request.modifier,
        day_of_week=request.day_of_week
    )

    day_names = ["월", "화", "수", "목", "금", "토", "일"]
    day_str = day_names[request.day_of_week] if request.day_of_week is not None else "매일"

    return {
        "success": True,
        "message": f"특별 시간대가 추가되었습니다: {day_str} {request.hour}시 (x{request.modifier})"
    }


@router.delete("/schedule/{platform_id}")
async def delete_schedule(
    platform_id: str,
    current_user: dict = Depends(get_current_user)
):
    """시간대별 스케줄 삭제"""
    user_id = current_user.get("id")

    result = delete_hourly_bid_schedule(user_id, platform_id)

    if result:
        return {"success": True, "message": "스케줄이 삭제되었습니다."}
    else:
        raise HTTPException(status_code=404, detail="스케줄을 찾을 수 없습니다.")


# ============ Presets ============

@router.get("/presets")
async def get_presets(current_user: dict = Depends(get_current_user)):
    """사용 가능한 프리셋 목록 조회"""
    optimizer = get_hourly_optimizer()
    presets = optimizer.get_preset_schedules()

    return {
        "success": True,
        "data": presets
    }


@router.post("/presets/apply")
async def apply_preset(
    request: PresetApplyRequest,
    current_user: dict = Depends(get_current_user)
):
    """프리셋 적용"""
    user_id = current_user.get("id")
    optimizer = get_hourly_optimizer()

    result = optimizer.apply_preset(
        user_id=user_id,
        platform_id=request.platform_id,
        preset_name=request.preset_name
    )

    if result.get("success"):
        return {
            "success": True,
            "message": f"'{result['name']}' 프리셋이 적용되었습니다.",
            "data": result
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=result.get("error", "프리셋 적용에 실패했습니다.")
        )


# ============ Auto Optimization ============

@router.post("/auto-optimize")
async def auto_optimize_modifiers(
    request: AutoOptimizeRequest,
    current_user: dict = Depends(get_current_user)
):
    """성과 데이터 기반 시간대별 가중치 자동 계산"""
    user_id = current_user.get("id")
    optimizer = get_hourly_optimizer()

    result = optimizer.auto_calculate_modifiers(
        user_id=user_id,
        platform_id=request.platform_id,
        optimization_target=request.optimization_target
    )

    if result.get("success"):
        return {
            "success": True,
            "message": f"시간대별 가중치가 '{request.optimization_target}' 기준으로 최적화되었습니다.",
            "data": result
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=result.get("error", "자동 최적화에 실패했습니다.")
        )


# ============ Performance Analysis ============

@router.get("/performance/{platform_id}")
async def get_hourly_performance(
    platform_id: str,
    days: int = 14,
    current_user: dict = Depends(get_current_user)
):
    """시간대별 성과 데이터 조회"""
    user_id = current_user.get("id")

    data = get_hourly_performance_aggregated(user_id, platform_id, days)

    return {
        "success": True,
        "data": data
    }


@router.get("/performance/{platform_id}/best-hours")
async def get_best_hours(
    platform_id: str,
    metric: str = "conversions",
    top_n: int = 5,
    current_user: dict = Depends(get_current_user)
):
    """최고 성과 시간대 조회"""
    user_id = current_user.get("id")

    if metric not in ["conversions", "roas", "ctr", "revenue"]:
        raise HTTPException(status_code=400, detail="유효하지 않은 지표입니다.")

    data = get_best_performing_hours(user_id, platform_id, metric, top_n)

    return {
        "success": True,
        "data": data,
        "metric": metric
    }


# ============ Current Time Bid Preview ============

@router.get("/preview/{platform_id}")
async def preview_current_bid(
    platform_id: str,
    base_bid: int = 1000,
    current_user: dict = Depends(get_current_user)
):
    """현재 시간 기준 조정된 입찰가 미리보기"""
    user_id = current_user.get("id")
    optimizer = get_hourly_optimizer()

    adjusted_bid, modifier, reason = optimizer.calculate_adjusted_bid(
        base_bid=base_bid,
        user_id=user_id,
        platform_id=platform_id
    )

    now = datetime.now()

    return {
        "success": True,
        "data": {
            "base_bid": base_bid,
            "adjusted_bid": adjusted_bid,
            "modifier": modifier,
            "reason": reason,
            "current_time": now.strftime("%Y-%m-%d %H:%M"),
            "hour": now.hour,
            "day_of_week": now.weekday(),
            "difference": adjusted_bid - base_bid,
            "difference_percent": round((modifier - 1) * 100, 1)
        }
    }


@router.get("/preview/{platform_id}/24h")
async def preview_24h_bids(
    platform_id: str,
    base_bid: int = 1000,
    current_user: dict = Depends(get_current_user)
):
    """24시간 입찰가 미리보기"""
    user_id = current_user.get("id")
    optimizer = get_hourly_optimizer()
    schedule = optimizer.get_schedule(user_id, platform_id)

    now = datetime.now()
    day_of_week = now.weekday()
    day_names = ["월", "화", "수", "목", "금", "토", "일"]

    preview = []
    for hour in range(24):
        modifier = schedule.get_modifier(hour, day_of_week)
        adjusted_bid = int(base_bid * modifier)
        adjusted_bid = max(70, adjusted_bid)  # 최소 입찰가

        preview.append({
            "hour": hour,
            "time_label": f"{hour:02d}:00",
            "modifier": modifier,
            "adjusted_bid": adjusted_bid,
            "is_current": hour == now.hour
        })

    return {
        "success": True,
        "data": {
            "base_bid": base_bid,
            "day_of_week": day_of_week,
            "day_name": day_names[day_of_week],
            "preview": preview
        }
    }


@router.get("/preview/{platform_id}/week")
async def preview_week_bids(
    platform_id: str,
    base_bid: int = 1000,
    current_user: dict = Depends(get_current_user)
):
    """주간 입찰가 히트맵 데이터"""
    user_id = current_user.get("id")
    optimizer = get_hourly_optimizer()
    schedule = optimizer.get_schedule(user_id, platform_id)

    day_names = ["월", "화", "수", "목", "금", "토", "일"]

    heatmap = []
    for day in range(7):
        day_data = {
            "day": day,
            "day_name": day_names[day],
            "hours": []
        }

        for hour in range(24):
            modifier = schedule.get_modifier(hour, day)
            adjusted_bid = int(base_bid * modifier)

            day_data["hours"].append({
                "hour": hour,
                "modifier": modifier,
                "adjusted_bid": adjusted_bid,
                "intensity": min(1.0, max(0.0, (modifier - 0.5) / 1.0))  # 0-1 범위로 정규화
            })

        heatmap.append(day_data)

    return {
        "success": True,
        "data": {
            "base_bid": base_bid,
            "heatmap": heatmap
        }
    }
