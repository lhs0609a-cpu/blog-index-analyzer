"""
시간대별 입찰 최적화 서비스
- 시간대별 성과 데이터 수집 및 분석
- 전환율/ROAS 기반 시간대별 입찰 가중치 자동 계산
- 실시간 입찰가 조정
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
import statistics

logger = logging.getLogger(__name__)


class DayOfWeek(Enum):
    """요일"""
    MONDAY = 0
    TUESDAY = 1
    WEDNESDAY = 2
    THURSDAY = 3
    FRIDAY = 4
    SATURDAY = 5
    SUNDAY = 6


@dataclass
class HourlyPerformance:
    """시간대별 성과 데이터"""
    hour: int  # 0-23
    day_of_week: int  # 0-6 (월-일)
    impressions: int = 0
    clicks: int = 0
    cost: int = 0
    conversions: int = 0
    revenue: int = 0

    @property
    def ctr(self) -> float:
        return (self.clicks / self.impressions * 100) if self.impressions > 0 else 0

    @property
    def cvr(self) -> float:
        return (self.conversions / self.clicks * 100) if self.clicks > 0 else 0

    @property
    def cpc(self) -> float:
        return self.cost / self.clicks if self.clicks > 0 else 0

    @property
    def cpa(self) -> float:
        return self.cost / self.conversions if self.conversions > 0 else 0

    @property
    def roas(self) -> float:
        return (self.revenue / self.cost * 100) if self.cost > 0 else 0


@dataclass
class TimeSlotConfig:
    """시간대 설정"""
    hour: int  # 0-23
    day_of_week: Optional[int] = None  # None이면 모든 요일
    bid_modifier: float = 1.0  # 입찰 가중치 (0.5 = 50%, 1.5 = 150%)
    is_enabled: bool = True
    min_modifier: float = 0.3  # 최소 가중치
    max_modifier: float = 2.0  # 최대 가중치


@dataclass
class HourlyBidSchedule:
    """시간대별 입찰 스케줄"""
    user_id: int
    platform_id: str
    campaign_id: Optional[str] = None

    # 시간대별 가중치 (24시간)
    hourly_modifiers: Dict[int, float] = field(default_factory=lambda: {h: 1.0 for h in range(24)})

    # 요일별 가중치 (0=월요일, 6=일요일)
    daily_modifiers: Dict[int, float] = field(default_factory=lambda: {d: 1.0 for d in range(7)})

    # 특정 시간대+요일 조합 가중치 (예: 금요일 저녁)
    special_slots: List[TimeSlotConfig] = field(default_factory=list)

    # 설정
    auto_optimize: bool = True  # 자동 가중치 계산
    min_data_days: int = 7  # 최소 데이터 수집 기간
    learning_rate: float = 0.1  # 가중치 조정 속도

    def get_modifier(self, hour: int, day_of_week: int) -> float:
        """현재 시간의 입찰 가중치 계산"""
        # 1. 특별 슬롯 체크 (가장 우선)
        for slot in self.special_slots:
            if slot.hour == hour and slot.is_enabled:
                if slot.day_of_week is None or slot.day_of_week == day_of_week:
                    return slot.bid_modifier

        # 2. 시간별 + 요일별 가중치 조합
        hourly = self.hourly_modifiers.get(hour, 1.0)
        daily = self.daily_modifiers.get(day_of_week, 1.0)

        # 가중치 조합 (곱셈)
        combined = hourly * daily

        # 범위 제한 (0.3 ~ 2.0)
        return max(0.3, min(2.0, combined))


class HourlyBidOptimizer:
    """시간대별 입찰 최적화 엔진"""

    def __init__(self, db=None):
        self.db = db
        self._schedules: Dict[str, HourlyBidSchedule] = {}  # key: user_id_platform_id
        self._hourly_data: Dict[str, List[HourlyPerformance]] = {}  # 시간대별 성과 데이터

    def get_schedule(self, user_id: int, platform_id: str) -> HourlyBidSchedule:
        """스케줄 조회 (없으면 생성)"""
        key = f"{user_id}_{platform_id}"
        if key not in self._schedules:
            # DB에서 로드 시도
            schedule = self._load_schedule_from_db(user_id, platform_id)
            if schedule:
                self._schedules[key] = schedule
            else:
                # 기본 스케줄 생성
                self._schedules[key] = HourlyBidSchedule(
                    user_id=user_id,
                    platform_id=platform_id
                )
        return self._schedules[key]

    def set_hourly_modifier(
        self,
        user_id: int,
        platform_id: str,
        hour: int,
        modifier: float
    ):
        """시간대별 가중치 설정"""
        schedule = self.get_schedule(user_id, platform_id)
        schedule.hourly_modifiers[hour] = max(0.3, min(2.0, modifier))
        self._save_schedule_to_db(schedule)

    def set_daily_modifier(
        self,
        user_id: int,
        platform_id: str,
        day_of_week: int,
        modifier: float
    ):
        """요일별 가중치 설정"""
        schedule = self.get_schedule(user_id, platform_id)
        schedule.daily_modifiers[day_of_week] = max(0.3, min(2.0, modifier))
        self._save_schedule_to_db(schedule)

    def set_bulk_modifiers(
        self,
        user_id: int,
        platform_id: str,
        hourly: Optional[Dict[int, float]] = None,
        daily: Optional[Dict[int, float]] = None
    ):
        """시간대/요일 가중치 일괄 설정"""
        schedule = self.get_schedule(user_id, platform_id)

        if hourly:
            for hour, mod in hourly.items():
                schedule.hourly_modifiers[int(hour)] = max(0.3, min(2.0, mod))

        if daily:
            for day, mod in daily.items():
                schedule.daily_modifiers[int(day)] = max(0.3, min(2.0, mod))

        self._save_schedule_to_db(schedule)

    def add_special_slot(
        self,
        user_id: int,
        platform_id: str,
        hour: int,
        modifier: float,
        day_of_week: Optional[int] = None
    ):
        """특별 시간대 추가 (예: 금요일 저녁 할증)"""
        schedule = self.get_schedule(user_id, platform_id)

        # 기존 슬롯 제거
        schedule.special_slots = [
            s for s in schedule.special_slots
            if not (s.hour == hour and s.day_of_week == day_of_week)
        ]

        # 새 슬롯 추가
        schedule.special_slots.append(TimeSlotConfig(
            hour=hour,
            day_of_week=day_of_week,
            bid_modifier=max(0.3, min(2.0, modifier)),
            is_enabled=True
        ))

        self._save_schedule_to_db(schedule)

    def calculate_adjusted_bid(
        self,
        base_bid: int,
        user_id: int,
        platform_id: str,
        timestamp: Optional[datetime] = None
    ) -> Tuple[int, float, str]:
        """
        시간대 기반 조정된 입찰가 계산

        Returns:
            (adjusted_bid, modifier, reason)
        """
        if timestamp is None:
            timestamp = datetime.now()

        schedule = self.get_schedule(user_id, platform_id)
        hour = timestamp.hour
        day_of_week = timestamp.weekday()

        modifier = schedule.get_modifier(hour, day_of_week)
        adjusted_bid = int(base_bid * modifier)

        # 최소 입찰가 보장 (네이버 70원)
        adjusted_bid = max(70, adjusted_bid)

        # 이유 생성
        day_names = ["월", "화", "수", "목", "금", "토", "일"]
        if modifier > 1.0:
            reason = f"{day_names[day_of_week]} {hour}시 고효율 시간대 (+{(modifier-1)*100:.0f}%)"
        elif modifier < 1.0:
            reason = f"{day_names[day_of_week]} {hour}시 저효율 시간대 ({(modifier-1)*100:.0f}%)"
        else:
            reason = f"{day_names[day_of_week]} {hour}시 기본 입찰"

        return adjusted_bid, modifier, reason

    def record_hourly_performance(
        self,
        user_id: int,
        platform_id: str,
        hour: int,
        day_of_week: int,
        impressions: int,
        clicks: int,
        cost: int,
        conversions: int,
        revenue: int
    ):
        """시간대별 성과 기록"""
        key = f"{user_id}_{platform_id}"
        if key not in self._hourly_data:
            self._hourly_data[key] = []

        self._hourly_data[key].append(HourlyPerformance(
            hour=hour,
            day_of_week=day_of_week,
            impressions=impressions,
            clicks=clicks,
            cost=cost,
            conversions=conversions,
            revenue=revenue
        ))

        # DB에도 저장
        self._save_hourly_performance_to_db(
            user_id, platform_id, hour, day_of_week,
            impressions, clicks, cost, conversions, revenue
        )

    def auto_calculate_modifiers(
        self,
        user_id: int,
        platform_id: str,
        optimization_target: str = "conversions"  # "conversions", "roas", "ctr"
    ) -> Dict[str, Any]:
        """
        성과 데이터 기반 시간대별 가중치 자동 계산

        Args:
            optimization_target: 최적화 목표
                - "conversions": 전환수 기준
                - "roas": ROAS 기준
                - "ctr": CTR 기준
        """
        key = f"{user_id}_{platform_id}"
        schedule = self.get_schedule(user_id, platform_id)

        # 데이터 로드 (DB 또는 메모리)
        hourly_data = self._load_hourly_data_from_db(user_id, platform_id, days=14)

        if not hourly_data or len(hourly_data) < 24 * 7:  # 최소 1주일 데이터 필요
            return {
                "success": False,
                "error": "데이터 부족 (최소 7일 필요)",
                "data_count": len(hourly_data) if hourly_data else 0
            }

        # 시간대별 성과 집계
        hourly_metrics = self._aggregate_hourly_metrics(hourly_data, optimization_target)
        daily_metrics = self._aggregate_daily_metrics(hourly_data, optimization_target)

        # 가중치 계산
        new_hourly_modifiers = self._calculate_modifiers_from_metrics(hourly_metrics)
        new_daily_modifiers = self._calculate_modifiers_from_metrics(daily_metrics)

        # 점진적 적용 (learning_rate 적용)
        for hour in range(24):
            old = schedule.hourly_modifiers.get(hour, 1.0)
            new = new_hourly_modifiers.get(hour, 1.0)
            schedule.hourly_modifiers[hour] = old + (new - old) * schedule.learning_rate

        for day in range(7):
            old = schedule.daily_modifiers.get(day, 1.0)
            new = new_daily_modifiers.get(day, 1.0)
            schedule.daily_modifiers[day] = old + (new - old) * schedule.learning_rate

        self._save_schedule_to_db(schedule)

        return {
            "success": True,
            "hourly_modifiers": schedule.hourly_modifiers,
            "daily_modifiers": schedule.daily_modifiers,
            "data_points": len(hourly_data),
            "optimization_target": optimization_target
        }

    def _aggregate_hourly_metrics(
        self,
        data: List[HourlyPerformance],
        target: str
    ) -> Dict[int, float]:
        """시간대별 성과 집계"""
        hourly_values: Dict[int, List[float]] = {h: [] for h in range(24)}

        for perf in data:
            if target == "conversions":
                value = perf.cvr if perf.clicks > 0 else 0
            elif target == "roas":
                value = perf.roas
            else:  # ctr
                value = perf.ctr

            if value > 0:  # 0인 데이터는 제외
                hourly_values[perf.hour].append(value)

        # 평균 계산
        result = {}
        for hour, values in hourly_values.items():
            if values:
                result[hour] = statistics.mean(values)
            else:
                result[hour] = 0

        return result

    def _aggregate_daily_metrics(
        self,
        data: List[HourlyPerformance],
        target: str
    ) -> Dict[int, float]:
        """요일별 성과 집계"""
        daily_values: Dict[int, List[float]] = {d: [] for d in range(7)}

        for perf in data:
            if target == "conversions":
                value = perf.cvr if perf.clicks > 0 else 0
            elif target == "roas":
                value = perf.roas
            else:  # ctr
                value = perf.ctr

            if value > 0:
                daily_values[perf.day_of_week].append(value)

        result = {}
        for day, values in daily_values.items():
            if values:
                result[day] = statistics.mean(values)
            else:
                result[day] = 0

        return result

    def _calculate_modifiers_from_metrics(
        self,
        metrics: Dict[int, float]
    ) -> Dict[int, float]:
        """성과 지표를 가중치로 변환"""
        values = [v for v in metrics.values() if v > 0]

        if not values:
            return {k: 1.0 for k in metrics.keys()}

        avg = statistics.mean(values)

        if avg == 0:
            return {k: 1.0 for k in metrics.keys()}

        modifiers = {}
        for key, value in metrics.items():
            if value > 0 and avg > 0:
                # 평균 대비 비율을 가중치로 변환
                ratio = value / avg
                # 범위 제한 (0.5 ~ 1.5)
                modifier = max(0.5, min(1.5, ratio))
            else:
                modifier = 0.7  # 데이터 없으면 낮은 가중치

            modifiers[key] = round(modifier, 2)

        return modifiers

    def get_schedule_summary(
        self,
        user_id: int,
        platform_id: str
    ) -> Dict[str, Any]:
        """스케줄 요약 정보"""
        schedule = self.get_schedule(user_id, platform_id)

        # 고효율/저효율 시간대 찾기
        high_hours = [h for h, m in schedule.hourly_modifiers.items() if m >= 1.2]
        low_hours = [h for h, m in schedule.hourly_modifiers.items() if m <= 0.7]

        high_days = [d for d, m in schedule.daily_modifiers.items() if m >= 1.2]
        low_days = [d for d, m in schedule.daily_modifiers.items() if m <= 0.7]

        day_names = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]

        return {
            "user_id": user_id,
            "platform_id": platform_id,
            "auto_optimize": schedule.auto_optimize,
            "hourly_modifiers": schedule.hourly_modifiers,
            "daily_modifiers": schedule.daily_modifiers,
            "special_slots": [
                {
                    "hour": s.hour,
                    "day_of_week": s.day_of_week,
                    "modifier": s.bid_modifier,
                    "enabled": s.is_enabled
                }
                for s in schedule.special_slots
            ],
            "insights": {
                "high_performance_hours": high_hours,
                "low_performance_hours": low_hours,
                "high_performance_days": [day_names[d] for d in high_days],
                "low_performance_days": [day_names[d] for d in low_days],
                "potential_savings": self._estimate_savings(schedule)
            }
        }

    def _estimate_savings(self, schedule: HourlyBidSchedule) -> Dict[str, Any]:
        """예상 절감액 계산"""
        # 저효율 시간대 비활성화 시 절감 추정
        low_hours = [h for h, m in schedule.hourly_modifiers.items() if m <= 0.7]

        # 대략적인 추정 (전체의 30%가 저효율 시간대라고 가정)
        low_hour_ratio = len(low_hours) / 24

        return {
            "low_efficiency_hours": len(low_hours),
            "estimated_cost_reduction_percent": round(low_hour_ratio * 20, 1),  # 20% 절감 가능
            "recommendation": "저효율 시간대 입찰 감소로 비용 절감 가능" if low_hours else "현재 최적화된 상태"
        }

    def get_preset_schedules(self) -> Dict[str, Dict[str, Any]]:
        """사전 정의된 스케줄 템플릿"""
        return {
            "b2c_retail": {
                "name": "B2C 리테일 (일반 소비자)",
                "description": "점심/저녁 시간대 집중, 주말 강화",
                "hourly": {
                    0: 0.4, 1: 0.3, 2: 0.3, 3: 0.3, 4: 0.3, 5: 0.4,
                    6: 0.6, 7: 0.8, 8: 0.9, 9: 1.0, 10: 1.1, 11: 1.2,
                    12: 1.3, 13: 1.2, 14: 1.1, 15: 1.0, 16: 1.0, 17: 1.1,
                    18: 1.3, 19: 1.4, 20: 1.5, 21: 1.4, 22: 1.2, 23: 0.8
                },
                "daily": {
                    0: 0.9, 1: 0.95, 2: 1.0, 3: 1.0, 4: 1.1, 5: 1.3, 6: 1.2
                }
            },
            "b2b_service": {
                "name": "B2B 서비스 (기업 대상)",
                "description": "평일 업무시간 집중, 주말 최소화",
                "hourly": {
                    0: 0.3, 1: 0.3, 2: 0.3, 3: 0.3, 4: 0.3, 5: 0.3,
                    6: 0.5, 7: 0.7, 8: 0.9, 9: 1.2, 10: 1.4, 11: 1.3,
                    12: 0.9, 13: 1.2, 14: 1.4, 15: 1.3, 16: 1.2, 17: 1.0,
                    18: 0.7, 19: 0.5, 20: 0.4, 21: 0.4, 22: 0.3, 23: 0.3
                },
                "daily": {
                    0: 1.2, 1: 1.3, 2: 1.3, 3: 1.2, 4: 1.1, 5: 0.4, 6: 0.4
                }
            },
            "ecommerce_24h": {
                "name": "이커머스 24시간",
                "description": "전환율 기반 동적 조정, 새벽 할인",
                "hourly": {
                    0: 0.6, 1: 0.5, 2: 0.4, 3: 0.4, 4: 0.4, 5: 0.5,
                    6: 0.7, 7: 0.9, 8: 1.0, 9: 1.1, 10: 1.2, 11: 1.2,
                    12: 1.1, 13: 1.1, 14: 1.1, 15: 1.0, 16: 1.0, 17: 1.1,
                    18: 1.2, 19: 1.3, 20: 1.4, 21: 1.3, 22: 1.1, 23: 0.8
                },
                "daily": {
                    0: 1.0, 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0, 5: 1.1, 6: 1.1
                }
            },
            "payday_focused": {
                "name": "급여일 집중",
                "description": "월말/월초 강화 (25일~5일)",
                "hourly": {h: 1.0 for h in range(24)},
                "daily": {d: 1.0 for d in range(7)},
                "special_rules": "25일~5일: +30% 가중치"
            },
            "night_owl": {
                "name": "야간 특화",
                "description": "야간 시간대 집중 (게임, 엔터테인먼트)",
                "hourly": {
                    0: 1.2, 1: 1.1, 2: 0.9, 3: 0.7, 4: 0.5, 5: 0.4,
                    6: 0.4, 7: 0.5, 8: 0.6, 9: 0.7, 10: 0.8, 11: 0.9,
                    12: 0.9, 13: 0.9, 14: 0.9, 15: 0.9, 16: 1.0, 17: 1.0,
                    18: 1.1, 19: 1.2, 20: 1.3, 21: 1.4, 22: 1.4, 23: 1.3
                },
                "daily": {
                    0: 0.9, 1: 0.9, 2: 0.9, 3: 0.9, 4: 1.2, 5: 1.3, 6: 1.2
                }
            }
        }

    def apply_preset(
        self,
        user_id: int,
        platform_id: str,
        preset_name: str
    ) -> Dict[str, Any]:
        """프리셋 적용"""
        presets = self.get_preset_schedules()

        if preset_name not in presets:
            return {"success": False, "error": f"Unknown preset: {preset_name}"}

        preset = presets[preset_name]
        schedule = self.get_schedule(user_id, platform_id)

        schedule.hourly_modifiers = preset["hourly"].copy()
        schedule.daily_modifiers = preset["daily"].copy()

        self._save_schedule_to_db(schedule)

        return {
            "success": True,
            "preset": preset_name,
            "name": preset["name"],
            "description": preset["description"]
        }

    # ============ DB 연동 메서드 ============

    def _load_schedule_from_db(
        self,
        user_id: int,
        platform_id: str
    ) -> Optional[HourlyBidSchedule]:
        """DB에서 스케줄 로드"""
        if self.db is None:
            return None

        try:
            from database.ad_optimization_db import get_hourly_bid_schedule
            data = get_hourly_bid_schedule(user_id, platform_id)

            if data:
                schedule = HourlyBidSchedule(
                    user_id=user_id,
                    platform_id=platform_id,
                    hourly_modifiers=data.get("hourly_modifiers", {h: 1.0 for h in range(24)}),
                    daily_modifiers=data.get("daily_modifiers", {d: 1.0 for d in range(7)}),
                    auto_optimize=data.get("auto_optimize", True)
                )

                # 특별 슬롯 로드
                for slot_data in data.get("special_slots", []):
                    schedule.special_slots.append(TimeSlotConfig(
                        hour=slot_data["hour"],
                        day_of_week=slot_data.get("day_of_week"),
                        bid_modifier=slot_data["modifier"],
                        is_enabled=slot_data.get("enabled", True)
                    ))

                return schedule
        except Exception as e:
            logger.error(f"Failed to load schedule from DB: {e}")

        return None

    def _save_schedule_to_db(self, schedule: HourlyBidSchedule):
        """스케줄을 DB에 저장"""
        try:
            from database.ad_optimization_db import save_hourly_bid_schedule

            data = {
                "hourly_modifiers": schedule.hourly_modifiers,
                "daily_modifiers": schedule.daily_modifiers,
                "auto_optimize": schedule.auto_optimize,
                "special_slots": [
                    {
                        "hour": s.hour,
                        "day_of_week": s.day_of_week,
                        "modifier": s.bid_modifier,
                        "enabled": s.is_enabled
                    }
                    for s in schedule.special_slots
                ]
            }

            save_hourly_bid_schedule(
                user_id=schedule.user_id,
                platform_id=schedule.platform_id,
                schedule_data=data
            )
        except Exception as e:
            logger.error(f"Failed to save schedule to DB: {e}")

    def _save_hourly_performance_to_db(
        self,
        user_id: int,
        platform_id: str,
        hour: int,
        day_of_week: int,
        impressions: int,
        clicks: int,
        cost: int,
        conversions: int,
        revenue: int
    ):
        """시간대별 성과를 DB에 저장"""
        try:
            from database.ad_optimization_db import save_hourly_performance
            save_hourly_performance(
                user_id=user_id,
                platform_id=platform_id,
                recorded_at=datetime.now(),
                hour=hour,
                day_of_week=day_of_week,
                impressions=impressions,
                clicks=clicks,
                cost=cost,
                conversions=conversions,
                revenue=revenue
            )
        except Exception as e:
            logger.error(f"Failed to save hourly performance to DB: {e}")

    def _load_hourly_data_from_db(
        self,
        user_id: int,
        platform_id: str,
        days: int = 14
    ) -> List[HourlyPerformance]:
        """DB에서 시간대별 성과 데이터 로드"""
        try:
            from database.ad_optimization_db import get_hourly_performance_history
            data = get_hourly_performance_history(user_id, platform_id, days)

            return [
                HourlyPerformance(
                    hour=d["hour"],
                    day_of_week=d["day_of_week"],
                    impressions=d.get("impressions", 0),
                    clicks=d.get("clicks", 0),
                    cost=d.get("cost", 0),
                    conversions=d.get("conversions", 0),
                    revenue=d.get("revenue", 0)
                )
                for d in data
            ]
        except Exception as e:
            logger.error(f"Failed to load hourly data from DB: {e}")
            return []


# 싱글톤 인스턴스
_hourly_optimizer: Optional[HourlyBidOptimizer] = None


def get_hourly_optimizer() -> HourlyBidOptimizer:
    """시간대별 최적화 인스턴스 반환"""
    global _hourly_optimizer
    if _hourly_optimizer is None:
        _hourly_optimizer = HourlyBidOptimizer()
    return _hourly_optimizer
