"""
블로그 챌린지 API 라우터
30일 챌린지, 게이미피케이션, 동기부여 콘텐츠
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import logging

from database.challenge_db import (
    init_challenge_tables,
    start_challenge,
    get_challenge_status,
    get_today_missions,
    complete_mission,
    get_gamification_profile,
    get_leaderboard,
    get_motivation,
    get_all_badges,
    log_writing,
    get_challenge_content,
    get_progress_calendar,
    CHALLENGE_CONTENT,
    LEVEL_REQUIREMENTS
)
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


# ========== Pydantic 모델 ==========

class StartChallengeRequest(BaseModel):
    challenge_type: str = "30day"


class CompleteMissionRequest(BaseModel):
    day_number: int
    mission_id: str
    mission_type: str  # learn, mission
    notes: Optional[str] = None


class LogWritingRequest(BaseModel):
    day_number: int
    mission_id: str
    title: str
    content_preview: Optional[str] = None
    word_count: int = 0
    blog_url: Optional[str] = None


# ========== 챌린지 API ==========

@router.get("/status")
async def get_status(current_user: dict = Depends(get_current_user)):
    """현재 챌린지 상태 조회"""
    try:
        status = get_challenge_status(current_user["id"])

        if not status:
            return {
                "success": True,
                "has_challenge": False,
                "message": "아직 챌린지를 시작하지 않았습니다."
            }

        return {
            "success": True,
            "has_challenge": True,
            "status": status
        }
    except Exception as e:
        logger.error(f"챌린지 상태 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/start")
async def start(
    request: StartChallengeRequest,
    current_user: dict = Depends(get_current_user)
):
    """챌린지 시작"""
    try:
        result = start_challenge(current_user["id"], request.challenge_type)
        return result
    except Exception as e:
        logger.error(f"챌린지 시작 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/today")
async def get_today(current_user: dict = Depends(get_current_user)):
    """오늘의 미션 조회"""
    try:
        # 챌린지 상태 확인
        status = get_challenge_status(current_user["id"])

        if not status or status.get("status") != "active":
            return {
                "success": False,
                "message": "진행 중인 챌린지가 없습니다.",
                "redirect": "start"
            }

        missions = get_today_missions(current_user["id"])
        motivation = get_motivation()

        return {
            "success": True,
            "missions": missions,
            "motivation": motivation,
            "status": status
        }
    except Exception as e:
        logger.error(f"오늘의 미션 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/complete")
async def complete(
    request: CompleteMissionRequest,
    current_user: dict = Depends(get_current_user)
):
    """미션 완료 처리"""
    try:
        result = complete_mission(
            user_id=current_user["id"],
            day_number=request.day_number,
            mission_id=request.mission_id,
            mission_type=request.mission_type,
            notes=request.notes
        )

        # 완료 후 프로필 조회
        profile = get_gamification_profile(current_user["id"])

        return {
            **result,
            "profile": profile
        }
    except Exception as e:
        logger.error(f"미션 완료 처리 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/progress")
async def get_progress(current_user: dict = Depends(get_current_user)):
    """전체 진행률 조회"""
    try:
        status = get_challenge_status(current_user["id"])
        calendar = get_progress_calendar(current_user["id"])
        profile = get_gamification_profile(current_user["id"])

        if not status:
            return {
                "success": False,
                "message": "챌린지를 시작해주세요."
            }

        return {
            "success": True,
            "status": status,
            "calendar": calendar,
            "profile": profile
        }
    except Exception as e:
        logger.error(f"진행률 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/leaderboard")
async def leaderboard(limit: int = 20):
    """랭킹 조회 (로그인 불필요)"""
    try:
        rankings = get_leaderboard(limit)
        return {
            "success": True,
            "rankings": rankings,
            "total_participants": len(rankings)
        }
    except Exception as e:
        logger.error(f"랭킹 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/day/{day}")
async def get_day_content(day: int):
    """특정 일차 콘텐츠 조회 (로그인 불필요 - 미리보기)"""
    try:
        if day < 1 or day > 30:
            raise HTTPException(status_code=400, detail="일차는 1-30 사이여야 합니다.")

        content = get_challenge_content(day)

        if not content:
            raise HTTPException(status_code=404, detail="콘텐츠를 찾을 수 없습니다.")

        return {
            "success": True,
            "day": day,
            "content": content
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"일차 콘텐츠 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/overview")
async def get_overview():
    """챌린지 전체 개요 (로그인 불필요)"""
    try:
        weeks = {}
        for day, content in CHALLENGE_CONTENT.items():
            week = content["week"]
            if week not in weeks:
                weeks[week] = {
                    "week": week,
                    "theme": content["theme"],
                    "days": []
                }
            weeks[week]["days"].append({
                "day": day,
                "learn_title": content["learn"]["title"],
                "mission_title": content["mission"]["title"],
                "xp": content["xp"] + 30
            })

        return {
            "success": True,
            "title": "30일 블로그 챌린지",
            "description": "블로그 초보자를 위한 30일 성장 프로그램",
            "total_days": 30,
            "total_xp": sum(c["xp"] + 30 for c in CHALLENGE_CONTENT.values()),
            "weeks": list(weeks.values()),
            "levels": [
                {"level": k, "name": v["name"], "min_xp": v["min_xp"]}
                for k, v in LEVEL_REQUIREMENTS.items()
            ]
        }
    except Exception as e:
        logger.error(f"개요 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== 게이미피케이션 API ==========

@router.get("/gamification/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    """게이미피케이션 프로필 조회"""
    try:
        profile = get_gamification_profile(current_user["id"])
        return {
            "success": True,
            "profile": profile
        }
    except Exception as e:
        logger.error(f"프로필 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/gamification/badges")
async def get_badges(current_user: dict = Depends(get_current_user)):
    """배지 목록 조회"""
    try:
        all_badges = get_all_badges()
        profile = get_gamification_profile(current_user["id"])
        earned_badges = profile.get("badges", [])

        badges_with_status = []
        for badge in all_badges:
            badges_with_status.append({
                **badge,
                "earned": badge["id"] in earned_badges
            })

        return {
            "success": True,
            "badges": badges_with_status,
            "earned_count": len(earned_badges),
            "total_count": len(all_badges)
        }
    except Exception as e:
        logger.error(f"배지 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== 글쓰기 로그 API ==========

@router.post("/writing/log")
async def log_writing_entry(
    request: LogWritingRequest,
    current_user: dict = Depends(get_current_user)
):
    """글쓰기 로그 기록"""
    try:
        log_id = log_writing(
            user_id=current_user["id"],
            day_number=request.day_number,
            mission_id=request.mission_id,
            title=request.title,
            content_preview=request.content_preview,
            word_count=request.word_count,
            blog_url=request.blog_url
        )

        return {
            "success": True,
            "log_id": log_id,
            "message": "글쓰기가 기록되었습니다."
        }
    except Exception as e:
        logger.error(f"글쓰기 로그 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== 동기부여 API ==========

@router.get("/motivation")
async def get_motivation_content():
    """동기부여 콘텐츠 조회 (로그인 불필요)"""
    try:
        motivation = get_motivation()
        return {
            "success": True,
            "motivation": motivation
        }
    except Exception as e:
        logger.error(f"동기부여 콘텐츠 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== 체크리스트 API ==========

@router.get("/checklist")
async def get_checklist():
    """글 발행 전 체크리스트 (로그인 불필요)"""
    checklist = [
        {"id": "title", "category": "제목", "item": "키워드가 제목 앞부분에 포함되어 있나요?", "tip": "키워드는 앞에 있을수록 좋습니다."},
        {"id": "title_length", "category": "제목", "item": "제목이 20-40자 사이인가요?", "tip": "너무 짧거나 길면 클릭률이 낮아집니다."},
        {"id": "thumbnail", "category": "썸네일", "item": "대표 이미지가 설정되어 있나요?", "tip": "눈에 띄는 썸네일이 클릭을 유도합니다."},
        {"id": "intro", "category": "본문", "item": "첫 문단에 키워드가 자연스럽게 들어가 있나요?", "tip": "검색엔진은 첫 문단을 중요하게 봅니다."},
        {"id": "structure", "category": "본문", "item": "소제목(H2, H3)으로 구조화되어 있나요?", "tip": "가독성이 좋아지고 SEO에도 유리합니다."},
        {"id": "images", "category": "이미지", "item": "이미지가 5장 이상 포함되어 있나요?", "tip": "적절한 이미지는 체류시간을 늘립니다."},
        {"id": "image_alt", "category": "이미지", "item": "이미지에 대체 텍스트를 넣었나요?", "tip": "이미지 검색 노출에 도움이 됩니다."},
        {"id": "content_length", "category": "본문", "item": "본문이 1,500자 이상인가요?", "tip": "너무 짧은 글은 정보가 부족하다고 판단됩니다."},
        {"id": "hashtags", "category": "해시태그", "item": "관련 해시태그를 10-15개 넣었나요?", "tip": "너무 많거나 적으면 효과가 떨어집니다."},
        {"id": "category", "category": "분류", "item": "적절한 카테고리에 분류했나요?", "tip": "관련성 있는 카테고리가 노출에 유리합니다."},
        {"id": "proofread", "category": "검수", "item": "맞춤법 검사를 했나요?", "tip": "오타는 신뢰도를 떨어뜨립니다."},
        {"id": "mobile", "category": "검수", "item": "모바일에서 미리보기를 확인했나요?", "tip": "대부분의 독자는 모바일로 봅니다."},
    ]

    return {
        "success": True,
        "checklist": checklist,
        "total_items": len(checklist)
    }
