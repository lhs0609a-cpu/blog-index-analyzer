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

## 목표 수집량에 따른 전략 분기

**[표준 모드] target_count < 50,000**
- seeds 20~50개 (주제의 핵심 하위 카테고리)
- max_depth 3~4, top_n_per_level 100~300

**[대규모 모드 - 조합 폭발] target_count ≥ 50,000**
핵심: 씨앗을 "축1 × 축2" cartesian product으로 생성해 수백 개로 폭발시킴.

예: 주제 "소상공인 대출"
- 축1 (업종 40개): 미용실, 헬스장, 치과, 성형외과, 피부과, 카페, 편의점, 학원, 병원, 세탁소, PC방, 노래방, 음식점, 주점, 학습지, 요양원, 약국, 안경점, 꽃집, 네일샵, 마사지, 애견, 키즈카페, 스터디카페, 펜션, 모텔, 빌라, 공방, 공인중개사, 세무사, 법무사, 회계사, 병의원, 한의원, 물리치료, 정형외과, 이비인후과, 산부인과, 소아과, 내과
- 축2 (금융상품/행동 15개): 대출, 신용대출, 운영자금, 창업자금, 개원자금, 개업자금, 시설자금, 햇살론, 새희망홀씨, 중소기업대출, 소상공인대출, 무담보대출, 자영업자대출, 저금리대출, 정책자금
- 조합 seeds 최대 500개까지 생성 (40 × 13 = 520 수준, 상한 500개로 잘라냄)
- 조합 품질이 낮은 것 (의미 부족)은 제외

예: 주제 "성형외과"
- 축1 (시술 50개): 쌍꺼풀, 코성형, 안면윤곽, 가슴성형, 지방흡입, 보톡스, 필러, 리프팅, 눈밑지방, 콧대, 턱수술, 광대축소, 이마성형, 입술, 모발이식 등
- 축2 (행동/지역 15개): 잘하는곳, 추천, 후기, 가격, 비용, 잘함, 유명한, 강남, 서울, 부산, 병원, 수술, 1위, 명의, 전문
- 조합 seeds 수백 개

예: 주제 "인테리어"
- 축1 (공간 40개): 거실, 주방, 침실, 욕실, 현관, 서재, 원룸, 오피스텔, 아파트, 빌라, 상가, 카페, 사무실, 학원, 병원, 미용실 등
- 축2 (스타일/행동 20개): 모던, 북유럽, 빈티지, 미니멀, 리모델링, 셀프, 견적, 시공, 업체, 비용, 추천 등

## 제안할 것

1. **seeds**: BFS 출발점
   - 표준 모드: 20~50개
   - 대규모 모드: 200~500개 (조합 활용. 중복/의미없는 조합 배제)
   - 반드시 한국어. 띄어쓰기 자연스럽게.

2. **core_terms (앵커 단어)**: 수집된 키워드가 이 중 하나라도 포함해야 채택
   - 주제와 의미적으로 같은 계열 (유의어/상위어/하위어/전문용어)
   - 씨앗은 자동 추가되니 넣지 말고, 그 외 확장 단어만
   - 표준: 15~30개 / 대규모: 30~60개
   - 너무 좁으면 수집량 낮아지고 너무 넓으면 드리프트

3. **blacklist**: 포함되면 즉시 컷
   - 업종과 무관, 영업 대행 관련, 부정적 의미
   - 금융이면: 마케팅, 대행, 블로그, SNS, 광고업체, 홍보
   - 5~15개

4. **BFS 파라미터**:
   - max_depth: 표준 3~4, 대규모 4~5
   - top_n_per_level: 표준 100~300, 대규모 500~1500
   - suggested_max_api_calls: 0.35초/호출 기준으로 산출
     - 2000 = 12분, 5000 = 30분, 8000 = 47분, 10000 = 60분
     - 씨앗이 500개면 seeds만 돌리는 데 이미 3분 필요. 충분히 크게.

5. **estimated_keywords**: 현실적 예상 범위
   - 단일 소카테고리 (소상공인 대출 같은): 5,000~15,000
   - 대출 전체: 30,000~50,000
   - 금융 전체: 80,000~150,000
   - 100만은 어떤 버티컬에서도 실제로 불가능. 솔직히 한계 언급.

6. **rationale**: 제안 근거 2~3줄. 조합 폭발을 썼으면 "축 구성" 명시.

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
                    "max_tokens": 8000,
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
            parsed["seeds"] = [s for s in (parsed.get("seeds") or []) if isinstance(s, str) and s.strip()][:500]
            parsed["core_terms"] = [s for s in (parsed.get("core_terms") or []) if isinstance(s, str) and s.strip()][:100]
            parsed["blacklist"] = [s for s in (parsed.get("blacklist") or []) if isinstance(s, str) and s.strip()][:50]

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
