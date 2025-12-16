"""
System router for health checks and system info
"""
from fastapi import APIRouter, Depends, Request
from typing import Dict, Optional
import platform
import sys

from config import settings
from feature_config.feature_access import (
    FEATURES,
    CATEGORIES,
    PLAN_PRICING,
    get_feature_access,
    get_all_features_for_plan,
    get_features_by_category
)
from middleware.feature_gate import get_user_features
from routers.auth import get_current_user_optional

router = APIRouter()


@router.get("/info")
async def get_system_info() -> Dict:
    """Get system information"""
    return {
        "app_name": settings.APP_NAME,
        "version": settings.API_VERSION,
        "environment": settings.APP_ENV,
        "python_version": sys.version,
        "platform": platform.platform()
    }


@router.get("/config")
async def get_public_config() -> Dict:
    """Get public configuration (non-sensitive)"""
    return {
        "app_name": settings.APP_NAME,
        "api_version": settings.API_VERSION,
        "environment": settings.APP_ENV,
        "features": {
            "learning_engine": True,
            "related_keywords": True,
            "blog_analysis": True
        }
    }


@router.get("/features")
async def get_features(
    request: Request,
    current_user: Optional[dict] = Depends(get_current_user_optional)
) -> Dict:
    """
    Get all features with access info for current user
    Returns features grouped by category with access levels
    """
    return await get_user_features(request, current_user)


@router.get("/features/{feature_name}")
async def get_feature_info(
    feature_name: str,
    request: Request,
    current_user: Optional[dict] = Depends(get_current_user_optional)
) -> Dict:
    """
    Get specific feature access info for current user
    """
    from database.user_db import get_user_db

    if current_user:
        user_db = get_user_db()
        plan = user_db.get_user_effective_plan(current_user['id'])
    else:
        plan = 'guest'

    feature = FEATURES.get(feature_name)
    if not feature:
        return {
            "error": "feature_not_found",
            "message": f"Feature '{feature_name}' not found"
        }

    access_info = get_feature_access(feature_name, plan)
    return {
        "feature": feature_name,
        "display_name": feature.display_name,
        "description": feature.description,
        "category": feature.category,
        "plan": plan,
        **access_info
    }


@router.get("/features-catalog")
async def get_features_catalog() -> Dict:
    """
    Get full features catalog with categories and pricing
    (Public endpoint for pricing page)
    """
    features_by_category = get_features_by_category()

    # Add access info for each plan
    catalog = {}
    for category, features in features_by_category.items():
        catalog[category] = {
            "name": CATEGORIES[category],
            "features": []
        }
        for f in features:
            feature_config = FEATURES[f['name']]
            catalog[category]["features"].append({
                **f,
                "access": {
                    plan.value: feature_config.access.get(plan, "none").value
                    for plan in PLAN_PRICING.keys()
                }
            })

    return {
        "categories": catalog,
        "plans": {
            plan.value: {
                "name": info["name"],
                "price": info["price"],
                "daily_limit": info["daily_limit"]
            }
            for plan, info in PLAN_PRICING.items()
        }
    }
