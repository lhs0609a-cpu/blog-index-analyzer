"""
Revenue management API router
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import logging

from database.revenue_db import (
    init_revenue_tables,
    save_monthly_revenue,
    get_monthly_revenue,
    get_revenue_history,
    get_revenue_summary,
    add_revenue_item,
    get_revenue_items,
    delete_revenue_item
)
from .auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/revenue", tags=["revenue"])

# Initialize tables on module load
init_revenue_tables()


class MonthlyRevenueInput(BaseModel):
    year: int
    month: int
    adpost_revenue: int = 0
    adpost_clicks: int = 0
    sponsorship_revenue: int = 0
    sponsorship_count: int = 0
    affiliate_revenue: int = 0
    affiliate_clicks: int = 0
    affiliate_conversions: int = 0
    memo: str = ""


class RevenueItemInput(BaseModel):
    revenue_type: str  # 'adpost', 'sponsorship', 'affiliate'
    title: str
    amount: int
    date: str  # YYYY-MM-DD format
    description: str = ""


@router.post("/monthly")
async def save_monthly(data: MonthlyRevenueInput, current_user: dict = Depends(get_current_user)):
    """Save or update monthly revenue data"""
    try:
        success = save_monthly_revenue(
            user_id=current_user["id"],
            year=data.year,
            month=data.month,
            adpost_revenue=data.adpost_revenue,
            adpost_clicks=data.adpost_clicks,
            sponsorship_revenue=data.sponsorship_revenue,
            sponsorship_count=data.sponsorship_count,
            affiliate_revenue=data.affiliate_revenue,
            affiliate_clicks=data.affiliate_clicks,
            affiliate_conversions=data.affiliate_conversions,
            memo=data.memo
        )

        if success:
            return {"success": True, "message": "수익 데이터가 저장되었습니다"}
        else:
            raise HTTPException(status_code=500, detail="저장 실패")
    except Exception as e:
        logger.error(f"Error saving monthly revenue: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/monthly/{year}/{month}")
async def get_monthly(year: int, month: int, current_user: dict = Depends(get_current_user)):
    """Get monthly revenue data"""
    try:
        data = get_monthly_revenue(current_user["id"], year, month)
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error getting monthly revenue: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_history(months: int = 12, current_user: dict = Depends(get_current_user)):
    """Get revenue history"""
    try:
        history = get_revenue_history(current_user["id"], months)
        return {"success": True, "data": history}
    except Exception as e:
        logger.error(f"Error getting revenue history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary")
async def get_summary(year: Optional[int] = None, current_user: dict = Depends(get_current_user)):
    """Get revenue summary"""
    try:
        summary = get_revenue_summary(current_user["id"], year)
        return {"success": True, "data": summary}
    except Exception as e:
        logger.error(f"Error getting revenue summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/item")
async def add_item(data: RevenueItemInput, current_user: dict = Depends(get_current_user)):
    """Add individual revenue item"""
    try:
        item_id = add_revenue_item(
            user_id=current_user["id"],
            revenue_type=data.revenue_type,
            title=data.title,
            amount=data.amount,
            date=data.date,
            description=data.description
        )

        if item_id:
            return {"success": True, "item_id": item_id, "message": "수익 항목이 추가되었습니다"}
        else:
            raise HTTPException(status_code=500, detail="추가 실패")
    except Exception as e:
        logger.error(f"Error adding revenue item: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/items")
async def get_items(
    revenue_type: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get revenue items"""
    try:
        items = get_revenue_items(current_user["id"], revenue_type, limit)
        return {"success": True, "data": items}
    except Exception as e:
        logger.error(f"Error getting revenue items: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/item/{item_id}")
async def delete_item(item_id: int, current_user: dict = Depends(get_current_user)):
    """Delete a revenue item"""
    try:
        success = delete_revenue_item(item_id, current_user["id"])
        if success:
            return {"success": True, "message": "삭제되었습니다"}
        else:
            raise HTTPException(status_code=500, detail="삭제 실패")
    except Exception as e:
        logger.error(f"Error deleting revenue item: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dashboard")
async def get_dashboard(current_user: dict = Depends(get_current_user)):
    """Get complete dashboard data"""
    try:
        now = datetime.now()
        current_year = now.year
        current_month = now.month

        # Get current month data
        current_data = get_monthly_revenue(current_user["id"], current_year, current_month)

        # Get last 12 months history
        history = get_revenue_history(current_user["id"], 12)

        # Get yearly summary
        yearly_summary = get_revenue_summary(current_user["id"], current_year)

        # Get all-time summary
        total_summary = get_revenue_summary(current_user["id"])

        # Calculate month-over-month growth
        prev_month = current_month - 1 if current_month > 1 else 12
        prev_year = current_year if current_month > 1 else current_year - 1
        prev_data = get_monthly_revenue(current_user["id"], prev_year, prev_month)

        current_total = 0
        prev_total = 0

        if current_data:
            current_total = (
                current_data.get("adpost_revenue", 0) +
                current_data.get("sponsorship_revenue", 0) +
                current_data.get("affiliate_revenue", 0)
            )

        if prev_data:
            prev_total = (
                prev_data.get("adpost_revenue", 0) +
                prev_data.get("sponsorship_revenue", 0) +
                prev_data.get("affiliate_revenue", 0)
            )

        growth = 0
        if prev_total > 0:
            growth = round(((current_total - prev_total) / prev_total) * 100, 1)

        return {
            "success": True,
            "data": {
                "current_month": current_data,
                "history": history,
                "yearly_summary": yearly_summary,
                "total_summary": total_summary,
                "growth": growth,
                "current_year": current_year,
                "current_month_num": current_month
            }
        }
    except Exception as e:
        logger.error(f"Error getting dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))
