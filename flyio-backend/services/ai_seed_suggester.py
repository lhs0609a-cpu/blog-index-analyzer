"""
AI 씨앗/앵커 자동 생성 서비스 (관리자 전용)

사용자가 주제(예: "대출")와 목표 키워드 수(예: 100000)를 주면
GPT가 BFS 확장에 최적화된 씨앗/앵커/블랙리스트 + BFS 파라미터를 제안한다.
"""
import json
import logging
from typing import Dict, Any
import httpx

from config import settings

logger = logging.getLogger(__name__)

OPENAI_MODEL = "gpt-4o-mini"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"

SYSTEM_PROMPT = """당신은 네이버 검색광고 키워드 전략 전문가입니다.
사용자가 주제와 목표 키워드 수집 개수를 주면, 그 주제에서 월 검색량이 있는 키워드를
BFS로 수집하기 위한 최적 세팅을 제안합니다.

제안할 것:
1. seeds (씨앗 키워드): 네이버 연관어 API의 BFS 출발점. 주제의 주요 서브 카테고리/하위 유형/전문 분야를 망라.
   - 목표 수집량이 크면 더 많이 (최대 50개).
   - 지나치게 좁거나 겹치지 않게. 서로 다른 결과 집합을 만들 수 있는 다양성 확보.

2. core_terms (앵커 단어): 수집된 키워드에 이 중 하나라도 포함돼야 채택. 드리프트 방지용.
   - 주제와 의미적으로 같은 계열의 단어들 (유의어, 상위어, 하위어, 전문용어).
   - 씨앗 자체는 나중에 자동 추가되니 넣지 말고, 그 외 확장 대상 단어들만.
   - 10~30개.

3. blacklist (제외 단어): 포함되면 즉시 컷. 업종과 무관한 것, 영업 대행 관련, 부정적 의미.
   - 주제가 금융이면: 마케팅, 대행, 블로그, SNS, 광고업체, 홍보 등.
   - 5~15개.

4. BFS 파라미터:
   - max_depth: 3~5. 목표 큰 경우 5, 작은 경우 3.
   - top_n_per_level: 각 depth에서 다음 확장 대상 상위 개수. 기본 50. 10만 목표면 500~1000.
   - suggested_max_api_calls: 네이버 API 총 호출 상한. 0.35초/호출이므로 2000=12분, 5000=30분, 10000=60분.

5. estimated_keywords: 현실적으로 얻을 수 있는 예상 개수 범위 (예: "8,000~15,000개").
   - 한국 네이버 생태계에서 월검색량 ≥5인 단일 버티컬 고유 키워드는 보통 2~4만이 한계.
   - 10만 목표면 인접 버티컬 포함 필요. rationale에 솔직히 언급.

6. rationale: 제안 근거 2~3줄.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "seeds": ["씨앗1", "씨앗2", ...],
  "core_terms": ["앵커1", "앵커2", ...],
  "blacklist": ["제외1", "제외2", ...],
  "max_depth": 4,
  "top_n_per_level": 300,
  "suggested_max_api_calls": 5000,
  "estimated_keywords": "20,000~35,000개",
  "rationale": "..."
}"""


async def suggest_keyword_setup(topic: str, target_count: int = 10000) -> Dict[str, Any]:
    """주제와 목표 수에 맞춰 AI가 씨앗/앵커/블랙리스트/파라미터 제안"""
    if not settings.OPENAI_API_KEY:
        return {"success": False, "message": "OpenAI API 키가 설정되지 않았습니다"}

    topic = (topic or "").strip()
    if not topic:
        return {"success": False, "message": "주제(topic)가 비어있습니다"}

    user_prompt = (
        f"주제: {topic}\n"
        f"목표 수집 키워드 수: {target_count:,}개\n\n"
        f"위 조건에 맞는 네이버 키워드 수집 세팅을 제안해주세요."
    )

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                OPENAI_URL,
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": OPENAI_MODEL,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 2000,
                    "temperature": 0.5,
                    "response_format": {"type": "json_object"},
                },
            )

            if resp.status_code != 200:
                logger.error(f"OpenAI suggest error: {resp.status_code} - {resp.text}")
                return {"success": False, "message": f"AI 서비스 오류 ({resp.status_code})"}

            result = resp.json()
            content = result["choices"][0]["message"]["content"].strip()
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                return {"success": False, "message": "AI 응답 파싱 실패"}

            # 방어적 검증 + 정규화
            parsed["seeds"] = [s for s in (parsed.get("seeds") or []) if isinstance(s, str) and s.strip()][:50]
            parsed["core_terms"] = [s for s in (parsed.get("core_terms") or []) if isinstance(s, str) and s.strip()][:50]
            parsed["blacklist"] = [s for s in (parsed.get("blacklist") or []) if isinstance(s, str) and s.strip()][:30]

            # 파라미터 범위 클램프
            md = int(parsed.get("max_depth") or 3)
            parsed["max_depth"] = max(1, min(5, md))
            tn = int(parsed.get("top_n_per_level") or 50)
            parsed["top_n_per_level"] = max(10, min(2000, tn))
            mc = int(parsed.get("suggested_max_api_calls") or 2000)
            parsed["suggested_max_api_calls"] = max(100, min(20000, mc))

            return {"success": True, "suggestion": parsed, "model": OPENAI_MODEL}

    except Exception as e:
        logger.exception("AI suggest keyword setup failed")
        return {"success": False, "message": f"AI 제안 실패: {str(e)[:200]}"}
