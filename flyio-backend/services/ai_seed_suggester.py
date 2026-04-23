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
**좁은 서브-니치(예: "의사대출", "쌍꺼풀재수술")라도 반드시 축 분해 시도**:
- 축1을 못 찾겠으면 **상위 개념의 하위 항목**을 뽑아라 (의사대출 → 의사/치과의사/한의사/수의사/간호사/약사/의대생/전공의 + 개업의/페이닥터/공중보건의/교수 등)
- 축2를 못 찾겠으면 **행동/지역/금액대/조건** 어휘를 붙여라 (대출 한도/금리/후기/비교/1억/5천만원/무담보/담보/신용/저금리/정책자금/은행별 등)
- **최소 seeds 150개 이상을 만든다** — 아무리 좁아도. "못 만들겠다"로 끝내지 말고 주제를 억지로 축 두 개로 쪼개라.

예: 주제 "소상공인 대출"
- 축1 (업종 40개): 미용실, 헬스장, 치과, 성형외과, 피부과, 카페, 편의점, 학원, 병원, 세탁소, PC방, 노래방, 음식점, 주점, 학습지, 요양원, 약국, 안경점, 꽃집, 네일샵, 마사지, 애견, 키즈카페, 스터디카페, 펜션, 모텔, 빌라, 공방, 공인중개사, 세무사, 법무사, 회계사, 병의원, 한의원, 물리치료, 정형외과, 이비인후과, 산부인과, 소아과, 내과
- 축2 (금융상품/행동 15개): 대출, 신용대출, 운영자금, 창업자금, 개원자금, 개업자금, 시설자금, 햇살론, 새희망홀씨, 중소기업대출, 소상공인대출, 무담보대출, 자영업자대출, 저금리대출, 정책자금
- 조합 seeds 최대 500개까지 생성 (40 × 13 = 520 수준, 상한 500개로 잘라냄)
- 조합 품질이 낮은 것 (의미 부족)은 제외

예: 주제 "의사대출" (좁은 서브-니치)
- 축1 (직군 20개): 의사, 치과의사, 한의사, 수의사, 약사, 간호사, 의대생, 전공의, 레지던트, 인턴, 전문의, 페이닥터, 공중보건의, 봉직의, 개업의, 원장, 의료진, 병원장, 의료인, 의사면허
- 축2 (금융 상품/행동 15개): 대출, 신용대출, 개원자금, 개업자금, 면허대출, 닥터론, 무담보대출, 저금리대출, 마이너스통장, 한도, 금리비교, 대환대출, 추가대출, 창업대출, 병원대출
- 20 × 15 = 300개 조합 → 의미 약한 것 제거 후 200~300개

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

4. **BFS 파라미터** (타겟별 가이드):
   - target < 10,000: max_depth 3, top_n 100~300, max_api_calls 1000~3000
   - target 10,000~50,000: max_depth 4, top_n 300~800, max_api_calls 3000~8000
   - target 50,000~200,000: max_depth 4~5, top_n 1000~1500, max_api_calls 8000~15000
   - target 200,000~500,000: **max_depth 5, top_n 1500~2000, max_api_calls 15000~30000**
   - target 500,000+: max_depth 5, top_n 2000, max_api_calls 30000~50000 (상한)
   - 소요 시간: 0.35초/호출 → 10000 = 58분, 30000 = 175분, 50000 = 292분
   - 씨앗 500개면 seeds만 돌리는 데 3분. 충분히 크게.

5. **estimated_keywords**: 현실적 예상 범위 (네이버 /keywordstool 실제 커버리지)
   - 단일 서브니치(의사대출, 쌍꺼풀재수술): 3K~10K
   - 단일 소카테고리 (소상공인 대출): 10K~25K
   - 단일 버티컬 (대출 전체, 성형외과 전체): 30K~80K
   - 복합 버티컬 (대출+자영업+의료): 80K~200K
   - 크로스 버티컬 메가셋 (금융+부동산+의료+교육+창업): **200K~500K가 현실 상한**
   - 500K 이상 뽑으려면 사용자가 여러 주제로 나눠 여러 번 돌려야 함을 rationale에 명시
   - 1M은 네이버 고검색량 키워드 우주 자체가 그 규모가 아니라 물리 불가. 솔직히 말할 것.

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

    # 동적 max_tokens — target_count 기준. 500 씨앗 + 앵커 60 + blacklist 15 ≈ 6000 토큰 여유
    sug_dyn_max = max(2000, min(6000, int(target_count / 100)))
    try:
        async with httpx.AsyncClient(timeout=55.0) as client:
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
                    "max_tokens": sug_dyn_max,
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
            parsed["suggested_max_api_calls"] = max(100, min(50000, mc))

            return {"success": True, "suggestion": parsed, "model": OPENAI_MODEL}

    except Exception as e:
        logger.exception("AI suggest keyword setup failed")
        return {"success": False, "message": f"AI 제안 실패: {str(e)[:200]}"}


AMPLIFY_SYSTEM_PROMPT = """당신은 네이버 키워드 수집 전문가입니다.
사용자가 입력한 씨앗 몇 개의 **패턴을 분석**해서 같은 의도의 씨앗을 N배로 펼칩니다.

## 작업
1. 입력 씨앗의 공통 패턴 찾기
   - 접미사 패턴: "X대출" (X는 업종/직군), "X자금" (X는 용도)
   - 접두사 패턴: "개원X", "창업X"
   - 카테고리 패턴: 모두 금융 관련, 모두 의료 관련 등
2. 같은 패턴으로 **semantically adjacent** 씨앗 추가 생성
   - X축 확장: 업종이면 미등록 업종 추가 (카페→음식점/편의점/학원/헬스장)
   - Y축 확장: 상품/행동이면 유사 상품 추가 (대출→자금/론/대환/마이너스통장)
   - cartesian으로 조합 폭발
3. 품질 필터: 네이버에서 실제 월검색량 있을 법한 자연스러운 한국어 키워드만
4. 드리프트 컷: 원본 의도에서 벗어나는 건 넣지 말 것 (대출→마케팅대행 X)

## 예시

입력: 의사대출, 약사대출, 한의사대출 (3개, 3배 요청 = 목표 9개)
→ 의사대출, 약사대출, 한의사대출, 치과의사대출, 수의사대출, 간호사대출, 의사신용대출, 의사마이너스통장, 의사개원자금

입력: 헬스장대출, 카페대출 (2개, 10배 요청 = 목표 20개)
→ 헬스장대출, 카페대출, 음식점대출, 편의점대출, 학원대출, 미용실대출, 약국대출, 병원대출,
  헬스장창업자금, 카페창업자금, 음식점창업자금, 편의점창업자금,
  헬스장운영자금, 카페운영자금, 음식점운영자금,
  헬스장대환대출, 카페소상공인대출, 음식점정책자금, 편의점신용대출, 학원무담보대출

입력: 쌍꺼풀수술, 코성형 (2개, 15배 = 목표 30개)
→ 쌍꺼풀수술, 코성형, 안면윤곽, 턱수술, 광대축소, 이마성형, 가슴성형, 지방흡입, 보톡스, 필러, 리프팅,
  눈밑지방, 모발이식, 쌍꺼풀재수술, 코재수술, 쌍꺼풀잘하는곳, 코성형잘하는곳, 쌍꺼풀수술비용, 코성형비용,
  강남쌍꺼풀, 강남코성형, 쌍꺼풀추천, 코성형추천, 쌍꺼풀후기, 코성형후기, 쌍꺼풀상담, 쌍꺼풀재수술잘하는곳,
  코수술명의, 코수술유명한곳, 쌍꺼풀전문

## 반드시 지킬 규칙
- 목표 개수(target_count)만큼 정확히 생성 (±10% 허용)
- 최대 500개
- 중복 없음 (원본 씨앗 포함해서 모두 유니크)
- 원본 씨앗은 반드시 결과에 포함
- 반드시 아래 JSON:

{
  "seeds": ["씨앗1", "씨앗2", ...],
  "detected_pattern": "패턴 설명 한 줄",
  "axes": {"축1_이름": ["항목1", "항목2"], "축2_이름": ["항목1", "항목2"]}
}"""


async def amplify_seeds(seeds: list, target_count: int) -> Dict[str, Any]:
    """씨앗 N개를 패턴 분석해서 target_count개로 펼침.

    Args:
        seeds: 원본 씨앗 (1~100)
        target_count: 목표 씨앗 수 (2~500)
    """
    if not settings.OPENAI_API_KEY:
        return {"success": False, "message": "OpenAI API 키 미설정"}

    clean_seeds = [s.strip() for s in seeds if isinstance(s, str) and s.strip()]
    if not clean_seeds:
        return {"success": False, "message": "씨앗이 비어있습니다"}
    if len(clean_seeds) > 100:
        clean_seeds = clean_seeds[:100]
    target = max(len(clean_seeds), min(500, int(target_count)))

    user_prompt = (
        f"입력 씨앗 ({len(clean_seeds)}개):\n"
        + "\n".join(f"- {s}" for s in clean_seeds)
        + f"\n\n목표 씨앗 수: {target}개\n\n"
        "위 패턴으로 {target}개 씨앗 생성해주세요. 원본 씨앗 포함 + 중복 없이.".format(target=target)
    )

    # 동적 max_tokens: 한글 씨앗 1개 ≈ 8~15 토큰 + JSON 오버헤드. 여유 있게 1.5배.
    # 500 씨앗이면 약 4500 토큰. 8000 박으면 GPT가 더 오래 생각해서 Fly proxy 60s 초과.
    dyn_max = max(1500, min(6000, int(target * 12)))
    try:
        async with httpx.AsyncClient(timeout=55.0) as client:
            resp = await client.post(
                OPENAI_URL,
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": OPENAI_MODEL,
                    "messages": [
                        {"role": "system", "content": AMPLIFY_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": dyn_max,
                    "temperature": 0.4,
                    "response_format": {"type": "json_object"},
                },
            )
            if resp.status_code != 200:
                logger.error(f"OpenAI amplify error: {resp.status_code} - {resp.text}")
                return {"success": False, "message": f"AI 서비스 오류 ({resp.status_code})"}

            result = resp.json()
            content = result["choices"][0]["message"]["content"].strip()
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                return {"success": False, "message": "AI 응답 파싱 실패"}

            raw_seeds = parsed.get("seeds") or []
            # 원본 포함 보장 + 중복 제거 (순서 유지)
            seen = set()
            final_seeds: list = []
            for s in list(clean_seeds) + [x for x in raw_seeds if isinstance(x, str)]:
                s = s.strip()
                if not s:
                    continue
                k = s.replace(" ", "").lower()
                if k in seen:
                    continue
                seen.add(k)
                final_seeds.append(s)
                if len(final_seeds) >= 500:
                    break

            return {
                "success": True,
                "seeds": final_seeds,
                "input_count": len(clean_seeds),
                "output_count": len(final_seeds),
                "detected_pattern": parsed.get("detected_pattern", ""),
                "axes": parsed.get("axes", {}),
                "model": OPENAI_MODEL,
            }
    except Exception as e:
        logger.exception("AI amplify seeds failed")
        return {"success": False, "message": f"AI 제안 실패: {str(e)[:200]}"}
