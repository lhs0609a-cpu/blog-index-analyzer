"""
Learning Engine API Module

Usage:
    from backend_learning_api import router
    app.include_router(router)
"""
from .routes import router

__all__ = ['router']
