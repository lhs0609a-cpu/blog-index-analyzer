"""
AI 브리핑 인용 점검 API.

한도를 왜 거는가 — 호출 한 번이 1~2MB SERP 를 받아 파싱한다. 이 박스는 동시
4명에서 무너진 전력이 있어(부하 중 SEO 페이지 78%가 500) 무제한으로 열 수 없다.
그래서 로그인을 요구하고 **키워드 검색 한도를 공유한다** — 성격이 같은 조회이고,
한도를 따로 만들면 화면이 "무슨 한도가 몇 개 남았는지"를 설명할 수 없게 된다.
"""
import logging
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from middleware.usage_limit import UsageGate, consume_usage, keyword_search_gate
from services.ai_citation import ai_citation

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai-citation", tags=["AI인용"])

_BLOG_ID = re.compile(r"^[A-Za-z0-9_-]{3,50}$")


class CitationRequest(BaseModel):
    keyword: str
    blog_id: str | None = None


@router.post("")
async def check_citation(
    req: CitationRequest,
    gate: UsageGate = Depends(keyword_search_gate),
):
    keyword = (req.keyword or "").strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword is required")
    if len(keyword) > 100:
        raise HTTPException(status_code=400, detail="keyword too long")

    blog_id = (req.blog_id or "").strip()
    if blog_id:
        m = re.search(r"blog\.naver\.com/([A-Za-z0-9_-]+)", blog_id)
        if m:
            blog_id = m.group(1)
        if not _BLOG_ID.match(blog_id):
            raise HTTPException(status_code=400, detail="invalid blog_id")

    result = await ai_citation(keyword, blog_id or None)
    if not result.get("ok"):
        # 실패는 한도를 먹지 않는다. 하루 몇 회짜리 한도에서 우리 쪽 오류가
        # 기회를 먹으면 사람은 제품이 아니라 자기를 탓하고 떠난다.
        raise HTTPException(status_code=502, detail=result.get("error", "failed"))

    # 캐시 히트도 차감한다. 안 그러면 같은 키워드를 무한히 조회해 한도가 무의미해진다.
    consume_usage(gate)
    return result
