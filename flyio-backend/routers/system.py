"""
System router for health checks and system info
"""
from fastapi import APIRouter
from typing import Dict
import platform
import sys

from config import settings

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
