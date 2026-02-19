"""
퍼널 디자이너 — API 엔드포인트
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from collections import defaultdict
import logging
import time

from routers.auth_deps import get_user_id_with_fallback
from data.funnel_templates import INDUSTRY_PRESETS, FUNNEL_TEMPLATES, PERSONAS
from database.funnel_designer_db import (
    save_funnel, update_funnel, get_funnel, list_funnels, delete_funnel,
    update_funnel_health, save_ai_diagnosis, get_ai_diagnoses,
)
from services.funnel_designer_service import FunnelDesignerService

logger = logging.getLogger(__name__)

# Simple in-memory rate limiter for OpenAI endpoints
_ai_call_timestamps: Dict[int, list] = defaultdict(list)
_AI_RATE_LIMIT = 10  # max calls per window
_AI_RATE_WINDOW = 3600  # 1 hour window in seconds

def _check_ai_rate_limit(user_id: int):
    """Check if user has exceeded AI call rate limit"""
    now = time.time()
    timestamps = _ai_call_timestamps[user_id]
    # Remove expired timestamps
    _ai_call_timestamps[user_id] = [t for t in timestamps if now - t < _AI_RATE_WINDOW]
    if len(_ai_call_timestamps[user_id]) >= _AI_RATE_LIMIT:
        raise HTTPException(status_code=429, detail=f"AI 분석 요청이 너무 많습니다. 1시간에 {_AI_RATE_LIMIT}회까지 가능합니다.")
    _ai_call_timestamps[user_id].append(now)

router = APIRouter(prefix="/api/funnel-designer", tags=["퍼널디자이너"])

service = FunnelDesignerService()


# ========== Pydantic Models ==========

class FunnelCreateRequest(BaseModel):
    name: str
    industry: Optional[str] = None
    description: Optional[str] = None
    funnel_data: Dict[str, Any]


class FunnelUpdateRequest(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    funnel_data: Optional[Dict[str, Any]] = None


class PersonaWalkthroughRequest(BaseModel):
    persona_id: str


# ========== 정적 데이터 ==========

@router.get("/industry-presets")
async def get_industry_presets():
    """업종별 기본 전환율/CPC 프리셋"""
    return {"presets": INDUSTRY_PRESETS}


@router.get("/templates")
async def get_templates():
    """전체 템플릿 목록 (노드/엣지 제외 메타 정보만)"""
    result = {}
    for industry, templates in FUNNEL_TEMPLATES.items():
        result[industry] = [
            {"id": t["id"], "name": t["name"], "description": t["description"]}
            for t in templates
        ]
    return {"templates": result}


@router.get("/templates/{industry}")
async def get_industry_templates(industry: str):
    """특정 업종의 퍼널 템플릿 (노드+엣지 포함)"""
    templates = FUNNEL_TEMPLATES.get(industry)
    if not templates:
        raise HTTPException(status_code=404, detail=f"업종 '{industry}' 템플릿을 찾을 수 없습니다")
    return {"industry": industry, "templates": templates}


@router.get("/personas")
async def get_personas():
    """페르소나 목록"""
    return {"personas": PERSONAS}


# ========== 퍼널 CRUD ==========

@router.post("/funnels")
async def create_funnel(req: FunnelCreateRequest, user_id: int = Depends(get_user_id_with_fallback)):
    """퍼널 생성"""
    funnel_id = save_funnel(
        user_id=user_id,
        name=req.name,
        funnel_data=req.funnel_data,
        industry=req.industry,
        description=req.description,
    )
    return {"success": True, "funnel_id": funnel_id, "message": "퍼널이 생성되었습니다"}


@router.get("/funnels")
async def get_funnels(user_id: int = Depends(get_user_id_with_fallback)):
    """사용자의 퍼널 목록"""
    funnels = list_funnels(user_id)
    return {"funnels": funnels}


@router.get("/funnels/{funnel_id}")
async def get_funnel_detail(funnel_id: int, user_id: int = Depends(get_user_id_with_fallback)):
    """퍼널 상세"""
    funnel = get_funnel(funnel_id, user_id)
    if not funnel:
        raise HTTPException(status_code=404, detail="퍼널을 찾을 수 없습니다")
    return {"funnel": funnel}


@router.put("/funnels/{funnel_id}")
async def update_funnel_endpoint(funnel_id: int, req: FunnelUpdateRequest,
                                  user_id: int = Depends(get_user_id_with_fallback)):
    """퍼널 수정"""
    updated = update_funnel(
        funnel_id=funnel_id,
        user_id=user_id,
        name=req.name,
        industry=req.industry,
        description=req.description,
        funnel_data=req.funnel_data,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="퍼널을 찾을 수 없거나 수정할 내용이 없습니다")
    return {"success": True, "message": "퍼널이 수정되었습니다"}


@router.delete("/funnels/{funnel_id}")
async def delete_funnel_endpoint(funnel_id: int, user_id: int = Depends(get_user_id_with_fallback)):
    """퍼널 삭제 (soft)"""
    deleted = delete_funnel(funnel_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="퍼널을 찾을 수 없습니다")
    return {"success": True, "message": "퍼널이 삭제되었습니다"}


# ========== 헬스 스코어 ==========

@router.post("/funnels/{funnel_id}/health-score")
async def calculate_health_score(funnel_id: int, user_id: int = Depends(get_user_id_with_fallback)):
    """퍼널 헬스 스코어 계산"""
    funnel = get_funnel(funnel_id, user_id)
    if not funnel:
        raise HTTPException(status_code=404, detail="퍼널을 찾을 수 없습니다")

    result = service.calculate_health_score(funnel["funnel_data"])

    # DB에 캐싱
    update_funnel_health(funnel_id, user_id, result["total_score"], result)

    return {"success": True, "health_score": result}


# ========== AI 진단 ==========

@router.post("/funnels/{funnel_id}/ai-doctor")
async def ai_doctor(funnel_id: int, user_id: int = Depends(get_user_id_with_fallback)):
    """AI 퍼널 닥터 진단"""
    _check_ai_rate_limit(user_id)
    funnel = get_funnel(funnel_id, user_id)
    if not funnel:
        raise HTTPException(status_code=404, detail="퍼널을 찾을 수 없습니다")

    result = await service.ai_doctor_diagnosis(funnel["funnel_data"])

    if result.get("success"):
        save_ai_diagnosis(
            funnel_id=funnel_id,
            user_id=user_id,
            diagnosis_type="doctor",
            result_data=result["result"],
        )

    return result


@router.post("/funnels/{funnel_id}/persona-walkthrough")
async def persona_walkthrough(funnel_id: int, req: PersonaWalkthroughRequest,
                               user_id: int = Depends(get_user_id_with_fallback)):
    """페르소나 워크스루 시뮬레이션"""
    _check_ai_rate_limit(user_id)
    funnel = get_funnel(funnel_id, user_id)
    if not funnel:
        raise HTTPException(status_code=404, detail="퍼널을 찾을 수 없습니다")

    # 페르소나 찾기
    persona = None
    for p in PERSONAS.values():
        if p["id"] == req.persona_id:
            persona = p
            break

    if not persona:
        raise HTTPException(status_code=404, detail="페르소나를 찾을 수 없습니다")

    result = await service.persona_walkthrough(funnel["funnel_data"], persona)

    if result.get("success"):
        save_ai_diagnosis(
            funnel_id=funnel_id,
            user_id=user_id,
            diagnosis_type="persona",
            persona_name=persona["name"],
            result_data=result["result"],
        )

    return result


@router.get("/funnels/{funnel_id}/diagnoses")
async def get_diagnoses(funnel_id: int, user_id: int = Depends(get_user_id_with_fallback), diagnosis_type: Optional[str] = None):
    """진단 이력 조회"""
    # Verify funnel ownership first
    funnel = get_funnel(funnel_id, user_id)
    if not funnel:
        raise HTTPException(status_code=404, detail="퍼널을 찾을 수 없습니다")
    diagnoses = get_ai_diagnoses(funnel_id, diagnosis_type)
    return {"diagnoses": diagnoses}
