"""
Feature Gate Middleware
Check if user has access to specific features based on their plan
"""
from typing import Optional, Callable, Any
from functools import wraps
from fastapi import HTTPException, Depends, Request
from fastapi.responses import JSONResponse

from feature_config.feature_access import (
    get_feature_access,
    AccessLevel,
    FEATURES,
    PLAN_PRICING,
    Plan
)
from routers.auth import get_current_user_optional
from database.user_db import get_user_db


class FeatureAccessDenied(HTTPException):
    """Exception for feature access denied"""
    def __init__(self, feature_name: str, current_plan: str, upgrade_hint: str = None):
        feature = FEATURES.get(feature_name)
        feature_display = feature.display_name if feature else feature_name

        detail = {
            "error": "feature_access_denied",
            "feature": feature_name,
            "feature_display": feature_display,
            "current_plan": current_plan,
            "message": f"'{feature_display}' 기능은 현재 플랜에서 사용할 수 없습니다",
            "upgrade_hint": upgrade_hint,
            "upgrade_url": "/pricing"
        }
        super().__init__(status_code=403, detail=detail)


async def check_feature_access(
    feature_name: str,
    request: Request,
    current_user: Optional[dict] = None
) -> dict:
    """
    Check if user has access to a feature

    Returns:
        dict with access info including allowed, access_level, limits
    """
    # Determine user's plan
    if current_user:
        user_db = get_user_db()
        plan = user_db.get_user_effective_plan(current_user['id'])
    else:
        plan = 'guest'

    # Get feature access info
    access_info = get_feature_access(feature_name, plan)
    access_info['plan'] = plan

    return access_info


def require_feature(feature_name: str):
    """
    Dependency that requires access to a specific feature

    Usage:
        @router.get("/some-endpoint")
        async def endpoint(access: dict = Depends(require_feature("feature_name"))):
            # access contains: allowed, access_level, limits, plan
            pass
    """
    async def dependency(
        request: Request,
        current_user: Optional[dict] = Depends(get_current_user_optional)
    ) -> dict:
        access_info = await check_feature_access(feature_name, request, current_user)

        if not access_info['allowed']:
            raise FeatureAccessDenied(
                feature_name=feature_name,
                current_plan=access_info['plan'],
                upgrade_hint=access_info.get('upgrade_hint')
            )

        return access_info

    return dependency


def feature_gate(feature_name: str):
    """
    Decorator for feature-gated endpoints

    Usage:
        @router.get("/endpoint")
        @feature_gate("feature_name")
        async def endpoint():
            pass
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get request and current_user from kwargs
            request = kwargs.get('request')
            current_user = kwargs.get('current_user')

            if not request:
                # Try to find request in args
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            access_info = await check_feature_access(feature_name, request, current_user)

            if not access_info['allowed']:
                raise FeatureAccessDenied(
                    feature_name=feature_name,
                    current_plan=access_info['plan'],
                    upgrade_hint=access_info.get('upgrade_hint')
                )

            # Add access_info to kwargs for use in endpoint
            kwargs['feature_access'] = access_info
            return await func(*args, **kwargs)

        return wrapper
    return decorator


async def get_user_features(
    request: Request,
    current_user: Optional[dict] = Depends(get_current_user_optional)
) -> dict:
    """
    Get all features access info for current user

    Returns dict with all feature access info
    """
    if current_user:
        user_db = get_user_db()
        plan = user_db.get_user_effective_plan(current_user['id'])
    else:
        plan = 'guest'

    from feature_config.feature_access import get_all_features_for_plan
    features = get_all_features_for_plan(plan)

    return {
        "plan": plan,
        "plan_info": PLAN_PRICING.get(Plan(plan), PLAN_PRICING[Plan.FREE]),
        "features": features
    }


def apply_feature_limits(feature_name: str, data: Any, access_info: dict) -> Any:
    """
    Apply feature-specific limits to response data

    This is a helper function to truncate/limit results based on plan limits
    """
    limits = access_info.get('limits')
    if not limits or access_info['access_level'] == AccessLevel.FULL.value:
        return data

    # Apply limits based on feature type
    if feature_name == 'title' and 'max_titles' in limits:
        max_titles = limits['max_titles']
        if max_titles > 0 and isinstance(data, dict) and 'titles' in data:
            data['titles'] = data['titles'][:max_titles]
            data['limited'] = True
            data['limit_message'] = f"무료 플랜은 {max_titles}개까지만 표시됩니다"

    elif feature_name == 'blueocean' and 'max_keywords' in limits:
        max_keywords = limits['max_keywords']
        if max_keywords > 0 and isinstance(data, dict) and 'keywords' in data:
            data['keywords'] = data['keywords'][:max_keywords]
            data['limited'] = True
            data['limit_message'] = f"현재 플랜은 {max_keywords}개까지만 표시됩니다"

    elif feature_name == 'ranktrack' and 'max_keywords' in limits:
        max_keywords = limits['max_keywords']
        if max_keywords > 0 and isinstance(data, dict) and 'tracked_keywords' in data:
            if len(data['tracked_keywords']) >= max_keywords:
                data['at_limit'] = True
                data['limit_message'] = f"현재 플랜은 최대 {max_keywords}개 키워드만 추적 가능합니다"

    elif feature_name == 'lowquality' and 'checks' in limits:
        max_checks = limits['checks']
        if max_checks > 0 and isinstance(data, dict) and 'checks' in data:
            data['checks'] = data['checks'][:max_checks]
            data['limited'] = True
            data['limit_message'] = "상세 분석은 베이직 플랜부터 이용 가능합니다"

    return data
