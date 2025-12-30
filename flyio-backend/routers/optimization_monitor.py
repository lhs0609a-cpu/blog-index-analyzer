"""
최적화 모니터링 API
- 실시간 최적화 현황 조회
- 최적화 로직 설명
- 성과 변화 추적
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import logging

from database.optimization_db import (
    get_optimization_sessions, get_optimization_actions, get_action_summary,
    get_performance_history, get_performance_comparison,
    get_insights, mark_insights_read, create_insight,
    log_optimization_action, create_optimization_session, complete_optimization_session
)

router = APIRouter(prefix="/api/optimization", tags=["최적화 모니터링"])
logger = logging.getLogger(__name__)


# ============ 최적화 로직 설명 ============

OPTIMIZATION_STRATEGIES = {
    "target_roas": {
        "name": "목표 ROAS 최적화",
        "description": "광고 수익률(ROAS)을 목표치에 맞추도록 입찰가를 자동 조정합니다.",
        "how_it_works": [
            "현재 ROAS가 목표보다 20% 이상 높으면 → 입찰가 상향 (노출 확대)",
            "현재 ROAS가 목표보다 20% 이상 낮으면 → 입찰가 하향 (효율 개선)",
            "전환 데이터가 없으면 CTR 기반으로 보조 판단"
        ],
        "best_for": "전환 데이터가 충분하고 수익성을 중시하는 경우",
        "settings": ["target_roas (목표 ROAS %)"]
    },
    "target_cpa": {
        "name": "목표 CPA 최적화",
        "description": "전환당 비용(CPA)을 목표치 이하로 유지하면서 전환을 최대화합니다.",
        "how_it_works": [
            "실제 CPA가 목표의 70% 미만이면 → 입찰가 최대 30% 상향",
            "실제 CPA가 목표 달성 중이면 → 입찰가 10% 상향 (볼륨 확대)",
            "실제 CPA가 목표의 150% 초과면 → 입찰가 30% 하향",
            "전환 없이 비용 소진 중이면 → 빠르게 입찰가 축소"
        ],
        "best_for": "리드 수집, 앱 설치 등 전환당 비용이 중요한 경우",
        "settings": ["target_cpa (목표 전환당 비용)"]
    },
    "maximize_conversions": {
        "name": "전환수 최대화",
        "description": "CPA 한도 내에서 가능한 많은 전환을 확보합니다.",
        "how_it_works": [
            "전환 발생 키워드는 CPA 목표 내에서 최대 입찰",
            "전환 없는 키워드는 최소 입찰로 전환 후 테스트",
            "CTR이 양호한 키워드는 전환 가능성 있어 유지"
        ],
        "best_for": "전환 볼륨을 빠르게 늘려야 하는 경우",
        "settings": ["target_cpa (CPA 상한선)"]
    },
    "target_position": {
        "name": "목표 순위 최적화",
        "description": "검색 결과에서 원하는 순위를 유지합니다.",
        "how_it_works": [
            "현재 순위가 목표보다 1 이상 낮으면 → 입찰가 10% 상향",
            "현재 순위가 목표보다 1 이상 높으면 → 입찰가 5% 하향 (비용 절감)"
        ],
        "best_for": "브랜드 노출이 중요하거나 경쟁 키워드 선점이 필요한 경우",
        "settings": ["target_position (목표 순위, 1~10)"]
    },
    "maximize_clicks": {
        "name": "클릭수 최대화",
        "description": "예산 내에서 가능한 많은 클릭을 확보합니다.",
        "how_it_works": [
            "CTR이 3% 이상인 키워드 → 입찰가 10% 상향",
            "CTR이 1% 미만인 키워드 → 입찰가 15% 하향"
        ],
        "best_for": "트래픽 확보가 목표이거나 브랜드 인지도를 높이려는 경우",
        "settings": []
    },
    "minimize_cpc": {
        "name": "CPC 최소화",
        "description": "클릭당 비용을 최소화하여 효율적으로 트래픽을 확보합니다.",
        "how_it_works": [
            "실제 CPC가 입찰가의 90% 이상이면 → 입찰가 5% 하향 시도"
        ],
        "best_for": "제한된 예산으로 최대한 많은 방문자를 유도해야 하는 경우",
        "settings": []
    },
    "balanced": {
        "name": "균형 최적화",
        "description": "ROAS, CTR, 전환을 종합적으로 고려하여 균형잡힌 최적화를 수행합니다.",
        "how_it_works": [
            "전환이 있고 ROAS가 목표 이상이면 → 소폭 상향 (5%)",
            "전환이 있지만 ROAS가 목표의 70% 미만이면 → 소폭 하향 (10%)",
            "전환 없이 클릭 20회 이상이면 → 효율 조정 (15% 하향)",
            "노출 1000회 이상이고 CTR 3% 이상이면 → 유망 키워드로 소폭 상향"
        ],
        "best_for": "처음 최적화를 시작하거나 특정 목표가 없는 경우",
        "settings": ["target_roas (참고용 목표 ROAS)"]
    }
}

KEYWORD_EXCLUSION_RULES = {
    "low_ctr": {
        "name": "낮은 CTR 키워드",
        "rule": "노출 500회 이상 & CTR 1% 미만",
        "action": "일시정지",
        "reason": "광고 품질 저하 및 비용 낭비"
    },
    "high_cost_no_conversion": {
        "name": "고비용 무전환 키워드",
        "rule": "비용 5만원 이상 & 전환 0건",
        "action": "일시정지",
        "reason": "예산 낭비"
    },
    "low_quality_score": {
        "name": "낮은 품질지수 키워드",
        "rule": "품질지수 4점 미만",
        "action": "경고 또는 일시정지",
        "reason": "광고 노출 품질 저하"
    }
}


# ============ API 엔드포인트 ============

@router.get("/strategies")
async def get_optimization_strategies():
    """최적화 전략 목록 및 설명"""
    return {
        "strategies": OPTIMIZATION_STRATEGIES,
        "exclusion_rules": KEYWORD_EXCLUSION_RULES
    }


@router.get("/strategy/{strategy_id}")
async def get_strategy_detail(strategy_id: str):
    """특정 최적화 전략 상세 설명"""
    if strategy_id not in OPTIMIZATION_STRATEGIES:
        raise HTTPException(status_code=404, detail="존재하지 않는 전략입니다")
    return OPTIMIZATION_STRATEGIES[strategy_id]


@router.get("/sessions")
async def get_sessions(
    user_id: int = Query(...),
    platform: str = Query(None),
    limit: int = Query(20, ge=1, le=100)
):
    """최적화 세션 이력"""
    sessions = get_optimization_sessions(user_id, platform, limit)
    return {
        "sessions": sessions,
        "total": len(sessions)
    }


@router.get("/actions")
async def get_actions(
    user_id: int = Query(...),
    platform: str = Query(None),
    action_type: str = Query(None),
    limit: int = Query(50, ge=1, le=500),
    hours: int = Query(None, description="최근 N시간 이내")
):
    """최적화 액션 이력"""
    since = datetime.now() - timedelta(hours=hours) if hours else None
    actions = get_optimization_actions(user_id, platform, action_type, limit, since)

    # 액션별 상세 설명 추가
    for action in actions:
        action['description'] = _get_action_description(action)

    return {
        "actions": actions,
        "total": len(actions)
    }


@router.get("/actions/summary")
async def get_actions_summary(
    user_id: int = Query(...),
    days: int = Query(7, ge=1, le=90)
):
    """최적화 액션 요약"""
    summary = get_action_summary(user_id, days)
    return summary


@router.get("/actions/live")
async def get_live_actions(
    user_id: int = Query(...),
    platform: str = Query(None)
):
    """실시간 최적화 피드 (최근 1시간)"""
    actions = get_optimization_actions(
        user_id, platform, limit=20,
        since=datetime.now() - timedelta(hours=1)
    )

    # 실시간 포맷으로 변환
    live_feed = []
    for action in actions:
        created = datetime.fromisoformat(action['created_at'].replace('Z', '+00:00')) if action.get('created_at') else datetime.now()
        minutes_ago = int((datetime.now() - created.replace(tzinfo=None)).total_seconds() / 60)

        live_feed.append({
            "id": action['id'],
            "platform": action['platform'],
            "action": action['action_type'],
            "target": action['target_name'],
            "change": f"{action['old_value']} → {action['new_value']}",
            "reason": action['reason'],
            "time_ago": f"{minutes_ago}분 전" if minutes_ago < 60 else f"{minutes_ago // 60}시간 전",
            "description": _get_action_description(action)
        })

    return {"feed": live_feed}


@router.get("/performance/history")
async def get_performance(
    user_id: int = Query(...),
    platform: str = Query(...),
    days: int = Query(7, ge=1, le=90)
):
    """성과 이력"""
    history = get_performance_history(user_id, platform, days)
    return {
        "platform": platform,
        "period_days": days,
        "history": history
    }


@router.get("/performance/comparison")
async def compare_performance(
    user_id: int = Query(...),
    platform: str = Query(...)
):
    """성과 비교 (최근 7일 vs 이전 7일)"""
    comparison = get_performance_comparison(user_id, platform)
    return {
        "platform": platform,
        **comparison
    }


@router.get("/insights")
async def get_user_insights(
    user_id: int = Query(...),
    platform: str = Query(None),
    unread_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100)
):
    """최적화 인사이트"""
    insights = get_insights(user_id, platform, unread_only, limit)
    return {
        "insights": insights,
        "unread_count": len([i for i in insights if not i.get('is_read')])
    }


@router.post("/insights/read")
async def mark_read(
    user_id: int = Query(...),
    insight_ids: List[int] = None
):
    """인사이트 읽음 처리"""
    mark_insights_read(user_id, insight_ids)
    return {"success": True}


@router.get("/dashboard")
async def get_optimization_dashboard(
    user_id: int = Query(...),
    platform: str = Query(None)
):
    """최적화 대시보드 통합 데이터"""
    # 최근 세션
    sessions = get_optimization_sessions(user_id, platform, limit=5)

    # 최근 액션 요약
    action_summary = get_action_summary(user_id, days=7)

    # 실시간 피드
    recent_actions = get_optimization_actions(
        user_id, platform, limit=10,
        since=datetime.now() - timedelta(hours=24)
    )

    # 인사이트
    insights = get_insights(user_id, platform, unread_only=True, limit=5)

    # 성과 변화 (플랫폼별)
    platforms_to_check = [platform] if platform else ['naver_searchad', 'google_ads', 'meta_ads']
    performance_changes = {}
    for p in platforms_to_check:
        try:
            comparison = get_performance_comparison(user_id, p)
            if comparison.get('current_period', {}).get('cost'):
                performance_changes[p] = comparison
        except:
            pass

    return {
        "recent_sessions": sessions,
        "action_summary": action_summary,
        "recent_actions": [
            {
                **a,
                "description": _get_action_description(a)
            }
            for a in recent_actions
        ],
        "insights": insights,
        "performance_changes": performance_changes,
        "strategies_available": list(OPTIMIZATION_STRATEGIES.keys())
    }


@router.get("/explain/{action_id}")
async def explain_action(action_id: int, user_id: int = Query(...)):
    """특정 최적화 액션 상세 설명"""
    actions = get_optimization_actions(user_id, limit=1000)
    action = next((a for a in actions if a['id'] == action_id), None)

    if not action:
        raise HTTPException(status_code=404, detail="액션을 찾을 수 없습니다")

    return {
        "action": action,
        "explanation": _get_detailed_explanation(action),
        "related_strategy": _get_related_strategy(action)
    }


# ============ 헬퍼 함수 ============

def _get_action_description(action: dict) -> str:
    """액션에 대한 간단한 설명"""
    action_type = action.get('action_type', '')
    target_name = action.get('target_name', '')
    old_value = action.get('old_value', '')
    new_value = action.get('new_value', '')

    if action_type == 'bid_change':
        try:
            old_bid = int(old_value)
            new_bid = int(new_value)
            change_pct = ((new_bid - old_bid) / old_bid * 100) if old_bid > 0 else 0
            direction = "상향" if new_bid > old_bid else "하향"
            return f"'{target_name}' 키워드 입찰가 {direction} ({change_pct:+.1f}%)"
        except:
            pass
    elif action_type == 'keyword_pause':
        return f"'{target_name}' 키워드 일시정지"
    elif action_type == 'keyword_resume':
        return f"'{target_name}' 키워드 재개"
    elif action_type == 'budget_change':
        return f"예산 변경: {old_value} → {new_value}"

    return action.get('reason', '')


def _get_detailed_explanation(action: dict) -> dict:
    """액션에 대한 상세 설명"""
    action_type = action.get('action_type', '')
    reason = action.get('reason', '')

    explanation = {
        "what_happened": "",
        "why": reason,
        "expected_impact": "",
        "next_steps": []
    }

    if action_type == 'bid_change':
        try:
            old_bid = int(action.get('old_value', 0))
            new_bid = int(action.get('new_value', 0))

            if new_bid > old_bid:
                explanation["what_happened"] = f"입찰가를 {old_bid:,}원에서 {new_bid:,}원으로 상향 조정했습니다."
                explanation["expected_impact"] = "노출 및 클릭 증가가 예상됩니다."
                explanation["next_steps"] = [
                    "24시간 후 성과 변화 확인",
                    "CTR/전환율 모니터링",
                    "비용 대비 성과 검토"
                ]
            else:
                explanation["what_happened"] = f"입찰가를 {old_bid:,}원에서 {new_bid:,}원으로 하향 조정했습니다."
                explanation["expected_impact"] = "비용 절감이 예상됩니다. 노출은 소폭 감소할 수 있습니다."
                explanation["next_steps"] = [
                    "비용 절감 효과 확인",
                    "순위 변화 모니터링",
                    "전환율 유지 여부 확인"
                ]
        except:
            pass

    elif action_type == 'keyword_pause':
        explanation["what_happened"] = "비효율 키워드를 일시정지했습니다."
        explanation["expected_impact"] = "불필요한 비용 지출이 중단됩니다."
        explanation["next_steps"] = [
            "7일 후 재평가",
            "광고 소재 개선 후 재시도 가능",
            "유사 키워드로 대체 검토"
        ]

    return explanation


def _get_related_strategy(action: dict) -> dict:
    """액션과 관련된 전략 정보"""
    reason = action.get('reason', '').lower()

    if 'roas' in reason:
        return OPTIMIZATION_STRATEGIES.get('target_roas', {})
    elif 'cpa' in reason:
        return OPTIMIZATION_STRATEGIES.get('target_cpa', {})
    elif 'ctr' in reason:
        return OPTIMIZATION_STRATEGIES.get('maximize_clicks', {})
    elif '순위' in reason:
        return OPTIMIZATION_STRATEGIES.get('target_position', {})
    elif '전환' in reason:
        return OPTIMIZATION_STRATEGIES.get('maximize_conversions', {})

    return OPTIMIZATION_STRATEGIES.get('balanced', {})
