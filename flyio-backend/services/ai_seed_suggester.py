"""
AI 씨앗/앵커 자동 생성 서비스 (관리자 전용)

사용자가 주제(예: "대출")와 목표 키워드 수(예: 100000)를 주면
GPT가 BFS 확장에 최적화된 씨앗/앵커/블랙리스트 + BFS 파라미터를 제안한다.
"""
import json
import logging
from typing import Dict, Any, Optional
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
    # cap 6000 → 3500 으로 축소 — GPT 응답 시간 ~30s 에서 ~50s 로 변동성 큰 거 차단,
    # ReadTimeout 다발 사고 (사용자 amplify 0~1 사고) 줄이고 fly proxy 60s 안에 안정적
    # 응답. target 800 일 때도 dyn_max 3500 이면 ~250 씨앗 발굴 가능 (실제 발굴 수가
    # 적은 것보다 안정적 1회 발굴이 효과 ↑).
    dyn_max = max(1500, min(3500, int(target * 12)))
    # 재시도 — OpenAI 5xx / 429 / Timeout 일시 장애에 죽지 않도록. 3 시도, 1s→3s backoff.
    # 사용자 화면 "amplify 실패: AI 제안 실패:" 가 한 번의 502 로 burst 전체를 죽이던 패턴 차단.
    import asyncio as _asyncio
    backoffs = [1.0, 3.0]
    last_msg = "unknown"
    # 스트리밍 — 비스트리밍 호출은 read timeout 이 "전체 생성 완료까지의 시간"이라
    # 시드 500개(~3500 토큰) 생성이 55s 를 넘기면 ReadTimeout 으로 burst 전체 사망.
    # stream=True 면 read timeout 은 "청크 간격"에만 적용 → 총 생성이 길어도 토큰이
    # 흐르는 한 안 죽고, 진짜 멈추면 60s 후 재시도. 이 함수는 _seed_amplify_tick
    # (백그라운드 cron, 10분 주기) 에서만 호출되므로 fly inbound proxy 60s 한계는
    # 적용 안 됨 (옛 사용자 엔드포인트 시절 잔재 우려라 read 60s 로 넉넉히 상향).
    stream_timeout = httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0)
    for attempt in range(3):
        try:
            content = ""
            async with httpx.AsyncClient(timeout=stream_timeout) as client:
                async with client.stream(
                    "POST",
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
                        "stream": True,
                    },
                ) as resp:
                    if resp.status_code != 200:
                        body = (await resp.aread()).decode("utf-8", "ignore")
                        last_msg = f"AI 서비스 오류 ({resp.status_code})"
                        logger.error(f"OpenAI amplify error attempt={attempt+1}: {resp.status_code} - {body[:200]}")
                        # 5xx / 429 만 재시도. 4xx (auth/bad request) 는 즉시 포기.
                        if resp.status_code >= 500 or resp.status_code == 429:
                            if attempt < len(backoffs):
                                await _asyncio.sleep(backoffs[attempt])
                                continue
                        return {"success": False, "message": last_msg}

                    # SSE 누적 — "data: {json}" 라인의 delta.content 만 모음.
                    chunks: list = []
                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        data = line[len("data:"):].strip()
                        if data == "[DONE]":
                            break
                        try:
                            obj = json.loads(data)
                            delta = (obj["choices"][0].get("delta") or {}).get("content")
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
                        if delta:
                            chunks.append(delta)
                    content = "".join(chunks).strip()

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
        except (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError) as e:
            last_msg = f"{type(e).__name__}: {str(e)[:150]}"
            logger.warning(f"AI amplify transient error attempt={attempt+1}: {last_msg}")
            if attempt < len(backoffs):
                await _asyncio.sleep(backoffs[attempt])
                continue
            return {"success": False, "message": f"AI 제안 실패: {last_msg}"}
        except Exception as e:
            logger.exception("AI amplify seeds failed")
            return {"success": False, "message": f"AI 제안 실패: {str(e)[:200]}"}
    return {"success": False, "message": f"AI 제안 실패: {last_msg}"}


CLASSIFY_SYSTEM_PROMPT = """당신은 네이버 키워드 도메인 분류기입니다.
사용자가 운영하는 광고주의 시드 키워드 목록과, 네이버 추천 후보 키워드 목록이 주어집니다.
후보 중 시드 도메인과 **관련 있는** KW 를 **관대하게** 골라내세요.

## 사용자 목표
광고주는 자기 도메인의 KW 를 최대한 많이 발굴해 등록하고 싶어합니다.
**과소 통과(false negative)가 과다 통과(false positive)보다 훨씬 나쁜 실패 모드**입니다.
잘못 통과한 KW 는 어차피 광고 클릭 데이터로 후속 cleanup 됩니다 — 통과시켜 보세요.

## 통과 (approved) — 관대하게
- 시드의 업종/주제와 **느슨하게라도 연결되면 통과**
- 동의어/상위어/하위어/시술명/상품명/약재명/관련행동
- 타겟 고객 / 지역 / 가격 / 후기 / 비교 / 효과 / 부작용 / 방법
- **인접 카테고리도 통과** (한의원 ↔ 침/뜸/체질/한약/탕약/처방/한방치료/건강기능식품)
- **광범위 일반명사도 통과** (건강, 효과, 후기, 추천, 잘하는곳, 잘함, 명의)
- 시드의 단어 일부를 포함하거나 의미적으로 연관 → 통과
- 예) 시드: "소잠한의원, 한방다이어트, 보약" → 통과: 한방, 한약, 한의원, 침, 뜸, 보약, 다이어트, 체질, 처방, 탕약, 한방치료, 건강, 효과, 후기, 강남, 잘하는곳, 명의, 추천 …

## 컷 (discarded) — 명확한 다른 업종만
- **명확히 다른 업종 점프**만 컷 (한의원 → "치과인플란트", "성형외과수술", "산부인과진료")
- **명확히 무관 카테고리** (한의원 → "주식투자", "부동산매매", "해외여행")
- **영업/마케팅 대행 명시** (한의원 → "한의원블로그마케팅대행", "병원SEO업체")
- **모호하면 통과**

## 판단 기준
- **70% 이상 통과시키는 게 정상** (입력 200개면 140개 이상)
- 모호하면 통과
- 시드의 단어가 한 글자라도 들어있거나 의미상 연결되면 통과
- 컷 사유는 "명확히 다른 업종" 또는 "광고 대행/SEO 업체" 정도만

반드시 아래 JSON 형식으로만 응답:
{
  "approved": ["통과키워드1", "통과키워드2", ...],
  "discarded": ["컷키워드1", ...],
  "rationale": "한줄 판단 근거"
}

approved + discarded 합집합 = 후보 전체. 누락 없이."""


CLASSIFY_STRICT_PROMPT = """당신은 네이버 키워드 도메인 분류기입니다 (엄격 모드).
광고주가 명시한 **도메인 키워드** 와 시드를 기준으로, 후보 KW 중 **확실히 도메인 안에 있는** 것만 골라냅니다.

## 광고주 의도 (중요)
사용자가 명시적으로 도메인 키워드를 등록했습니다 = "정확히 이 분야의 KW 만 등록하고 싶다" 의 신호.
**과다 통과(false positive)가 과소 통과(false negative)보다 훨씬 나쁜 실패 모드** (관대 모드와 반대).
무관 KW 가 통과해서 100k 등록되면 사용자가 직접 삭제해야 합니다 — 비용 큼.
모호하면 **컷**. 인접 카테고리도 도메인 키워드와 직접 연결 안 되면 **컷**.

## 통과 (approved) — 엄격하게
- 도메인 키워드 또는 시드의 단어가 **명확히 의미상 같은 분야**
- 도메인 키워드 atom 을 직접 포함 (예: 도메인 "아토피" → "아토피피부염", "아토피완치", "아토피한약")
- 시드와 동의어/상위어/하위어 관계가 **사전적으로 명백**
- 도메인 안에서의 행동/지역/효과 (예: "아토피잘하는곳", "강남아토피한약")

## 컷 (discarded) — 다음은 모두 컷
- **도메인 atom 매칭 없음** 그리고 시드 substring 매칭 없음 → 컷
- **광범위 일반명사 단독** (건강, 효과, 후기, 추천, 명의, 잘하는곳 등 도메인 atom 없이 단독) → 컷
- **다른 업종 점프** (한방 → 차/부동산/금융/IT/뷰티 등) → 컷
- **모호하면 컷** (관대 모드와 정반대)

## 판단 기준 (엄격)
- 도메인 키워드 atom 매칭이 1순위 신호
- 시드 substring 또는 atom 매칭이 2순위 신호
- 둘 다 없으면 **컷** (단어가 일부 비슷해 보여도)
- 70% 통과 아님 — **30~50% 통과가 정상**, 도메인 좁으면 10~20% 만 통과해도 OK

반드시 아래 JSON:
{
  "approved": ["통과키워드1", ...],
  "discarded": ["컷키워드1", ...],
  "rationale": "한줄 판단 근거"
}

approved + discarded 합집합 = 후보 전체. 누락 없이."""


async def classify_rejects(
    user_seeds: list,
    reject_candidates: list,
    *,
    seed_sample_size: int = 50,
    saved_relevance: Optional[list] = None,
) -> Dict[str, Any]:
    """reject KW 중 시드 도메인과 같은 것만 분류.

    Args:
        user_seeds: 광고주의 user_seed 리스트 (전체)
        reject_candidates: [{"keyword": str, "monthly_total": int}, ...]
        seed_sample_size: GPT에 보낼 시드 샘플 크기 (토큰 절약)
        saved_relevance: 사용자 명시 도메인 KW. 제공+≥3 이면 **strict 모드**.
            - 엄격 프롬프트 사용 (관대 70% 통과 X)
            - 누락 → discarded (관대 모드의 missing→approved 폴백 반대)
            - 광고주 도메인 분류를 saved_relevance 가 최우선 (user_seed 오염 무력화)

    Returns:
        {"success": True, "approved": [...], "discarded": [...], "rationale": "..."}
    """
    if not settings.OPENAI_API_KEY:
        return {"success": False, "message": "OpenAI API 키 미설정"}

    seeds = [s.strip() for s in user_seeds if isinstance(s, str) and s.strip()]
    cands = [
        c for c in reject_candidates
        if isinstance(c, dict) and (c.get("keyword") or "").strip()
    ]
    if not seeds and not saved_relevance:
        return {"success": False, "message": "user_seed 와 saved_relevance 모두 비어있음"}
    if not cands:
        return {"success": False, "message": "분류할 reject 후보 없음"}

    # strict 모드 판정 — saved_relevance ≥ 3 유효 atom
    rel = [s.strip() for s in (saved_relevance or []) if isinstance(s, str) and s.strip() and len(s.strip()) >= 2]
    strict_mode = len(rel) >= 3

    # 시드 샘플링 — 도메인 대표성 ↑.
    # 길이 짧은 30개 (atom 명확) + random 30개 (다양성). 짧은 것만 보내면 GPT 가
    # niche 도메인으로 인식해 보수적 분류 → 통과율 폭락. 긴 시드도 섞어 도메인 폭 인식.
    import random as _r
    if len(seeds) > seed_sample_size:
        seeds_sorted = sorted(seeds, key=lambda s: len(s))
        short_n = min(seed_sample_size // 2, len(seeds_sorted))
        short_part = seeds_sorted[:short_n]
        rest_pool = seeds_sorted[short_n:]
        random_n = min(seed_sample_size - short_n, len(rest_pool))
        random_part = _r.sample(rest_pool, random_n) if rest_pool else []
        seed_sample = short_part + random_part
    else:
        seed_sample = list(seeds)

    # 후보 cap — 한 번에 200개 초과면 GPT 응답 타임아웃 위험
    cands = cands[:200]
    cand_lines = [f"- {c['keyword']} ({c.get('monthly_total', 0):,})" for c in cands]
    seed_lines = [f"- {s}" for s in seed_sample]

    if strict_mode:
        # strict — saved_relevance 가 도메인 최우선, user_seed 는 참고용
        rel_lines = [f"- {s}" for s in rel[:60]]
        user_prompt = (
            f"## 광고주 명시 도메인 키워드 ({len(rel)}개) — 분류 최우선 기준\n"
            + "\n".join(rel_lines)
            + f"\n\n## user_seed 샘플 (참고용, 오염 가능, {len(seed_sample)}개)\n"
            + "\n".join(seed_lines)
            + f"\n\n## 분류할 후보 키워드 ({len(cands)}개, 괄호=월검색량)\n"
            + "\n".join(cand_lines)
            + "\n\n**엄격 모드** — 도메인 키워드 atom 매칭 없고 시드 매칭도 없으면 모두 컷. "
              "광범위 일반명사(건강/효과/후기/추천/명의) 단독은 컷. 모호하면 컷."
        )
        sys_prompt = CLASSIFY_STRICT_PROMPT
    else:
        user_prompt = (
            f"## 시드 키워드 (광고주가 운영하는 도메인, {len(seeds)}개 중 {len(seed_sample)}개 샘플)\n"
            + "\n".join(seed_lines)
            + f"\n\n## 분류할 후보 키워드 ({len(cands)}개, 괄호=월검색량)\n"
            + "\n".join(cand_lines)
            + "\n\n위 후보 중 시드와 같은 도메인인 것만 approved 에, 나머지는 discarded 에. "
              "approved+discarded 합집합 = 후보 전체."
        )
        sys_prompt = CLASSIFY_SYSTEM_PROMPT

    # 동적 max_tokens — 후보 수 × 평균 한글 토큰. 200개 ≈ 3000 토큰 + JSON 오버헤드.
    dyn_max = max(2000, min(5000, len(cands) * 20))
    try:
        # timeout 90s — 보험 광고주 시드 1370 + 후보 200 = 입력 토큰 큼, 55s 부족.
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                OPENAI_URL,
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": OPENAI_MODEL,
                    "messages": [
                        {"role": "system", "content": sys_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": dyn_max,
                    "temperature": 0.2 if strict_mode else 0.4,
                    "response_format": {"type": "json_object"},
                },
            )
            if resp.status_code != 200:
                logger.error(f"OpenAI classify error: {resp.status_code} - {resp.text}")
                return {"success": False, "message": f"AI 서비스 오류 ({resp.status_code})"}

            result = resp.json()
            content = result["choices"][0]["message"]["content"].strip()
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                return {"success": False, "message": "AI 응답 파싱 실패"}

            cand_set = {c["keyword"] for c in cands}
            raw_approved = parsed.get("approved") or []
            raw_discarded = parsed.get("discarded") or []
            # GPT 가 후보 외 키워드 hallucination 한 경우 컷
            approved = [
                k.strip() for k in raw_approved
                if isinstance(k, str) and k.strip() in cand_set
            ]
            discarded = [
                k.strip() for k in raw_discarded
                if isinstance(k, str) and k.strip() in cand_set
            ]
            classified = set(approved) | set(discarded)
            missing = [c["keyword"] for c in cands if c["keyword"] not in classified]
            if missing:
                if strict_mode:
                    # strict — 누락 = discarded (보수적). drift 차단 우선.
                    discarded.extend(missing)
                else:
                    # 관대 — 누락 = approved (현 동작 유지). cold start drift 위험 감수.
                    approved.extend(missing)

            return {
                "success": True,
                "approved": approved,
                "discarded": discarded,
                "rationale": parsed.get("rationale", ""),
                "candidates_total": len(cands),
                "seeds_sample": len(seed_sample),
                "strict_mode": strict_mode,
                "relevance_atoms": len(rel) if strict_mode else 0,
                "model": OPENAI_MODEL,
            }
    except Exception as e:
        logger.exception("AI classify rejects failed")
        return {"success": False, "message": f"AI 분류 실패: {str(e)[:200]}"}


# ============ 전자동 광맥 발굴 — Domain Profile 생성기 (Stage 2) ============

PROFILE_SYSTEM_PROMPT = """당신은 네이버 검색광고 키워드 도메인 설계 전문가입니다.
광고주의 사업 설명 한 줄을 받아, 그 도메인에서 월 검색량 있는 키워드를 **무한히 조합 폭발**
시킬 수 있는 "도메인 프로파일"을 설계합니다. 이건 사람이 손으로 짜던 키워드 사전을 대체합니다.

## 출력 4종

### 1) atom_library — 조합 폭발용 원자 사전 (가장 중요)
- 도메인을 2~4개의 **축(axis)** 으로 분해. 축끼리 cartesian 곱하면 자연스러운 키워드가 나와야 함.
- 각 축은 그 도메인의 실제 어휘로 30~50개씩 채움.
- 축 예시 패턴:
  * 의료대출: 대상[의사/치과의사/한의사/약사/수의사/간호사/전공의/개업의/봉직의…] × 상품[신용대출/개원자금/운영자금/마이너스통장/대환대출/담보대출…] × 의도[금리/한도/조건/후기/비교/서류/승인/갈아타기…]
  * 피부한의원: 질환[아토피/건선/여드름/두드러기/지루성피부염…] × 의도[치료/원인/한약/한의원/후기/완치/비용…] × 부위·연령·계절…
- "X대출"의 X처럼 좁은 도메인도 반드시 상위개념의 하위항목으로 축1을 만든다. "못 만들겠다" 금지.

### 2) relevance_keywords — 관련성 채점 기준 (150~250개)
- 수집된 키워드가 이 중 하나라도 의미상 포함하면 도메인으로 인정. 게이트/cleanup 점수 기준.
- atom_library 의 모든 축 항목 + 동의어/상위어/하위어/전문용어를 펼쳐 넣음.
- 너무 좁으면 통과율↓, 너무 넓으면 drift. 도메인 핵심 어휘를 빠짐없이.

### 3) negative_keywords — drift 차단 제외 토큰 (10~40개)
- 도메인과 무관하지만 축 단어 substring 으로 잘못 끌려올 것들.
- 예: "의료대출" → 자동차대출/전세대출/학자금/일반인/주택담보/카드론 (의료인 무관)
- 예: "피부한의원" → 료칸/도시락/자동차/부동산/마케팅대행 (실제 소잠 오염 사고 단어들)
- 마케팅/대행/SEO/블로그업체 류는 거의 항상 포함.

### 4) example_seeds — 검수용 예시 시드 30개
- atom_library 축을 곱해 만든 실제 시드 샘플 30개. 사람이 보고 "이 도메인 맞다" 판단용.

## 핵심 원칙
- 반드시 한국어. 자연스러운 검색어.
- atom_library 축 항목은 **실제 네이버에서 검색되는 어휘**여야 함 (가짜 단어 금지).
- drift 방지: 축이 너무 일반적이면("대출" 단독) 무관 업종이 섞임 — 도메인 한정 수식 포함.

반드시 아래 JSON 형식으로만 응답:
{
  "atom_library": {"축이름1": ["항목","..."], "축이름2": ["..."], "축이름3": ["..."]},
  "relevance_keywords": ["...", "..."],
  "negative_keywords": ["...", "..."],
  "example_seeds": ["...", "..."],
  "rationale": "축 구성 + 예상 키워드 규모 2~3줄"
}"""


async def generate_domain_profile(description: str, target_count: int = 100000) -> Dict[str, Any]:
    """사업 설명 한 줄 → 전자동 발굴용 도메인 프로파일(atom_library/relevance/negative/예시) 생성.

    사람이 손으로 짜던 키워드 사전을 LLM 이 대체. 검수 후 update_domain_profile 로 저장.
    """
    if not settings.OPENAI_API_KEY:
        return {"success": False, "message": "OpenAI API 키가 설정되지 않았습니다"}
    desc = (description or "").strip()
    if not desc:
        return {"success": False, "message": "사업 설명(description)이 비어있습니다"}

    user_prompt = (
        f"광고주 사업 설명: {desc}\n"
        f"목표 키워드 수집 규모: {target_count:,}개\n\n"
        "위 도메인의 전자동 키워드 발굴용 프로파일을 설계해주세요. "
        "atom_library 축은 각 30~50개, relevance_keywords 150~250개. "
        "출력이 잘리지 않도록 간결하게."
    )
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                OPENAI_URL,
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": OPENAI_MODEL,
                    "messages": [
                        {"role": "system", "content": PROFILE_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 14000,
                    "temperature": 0.4,
                    "response_format": {"type": "json_object"},
                },
            )
            if resp.status_code != 200:
                logger.error(f"OpenAI profile error: {resp.status_code} - {resp.text[:200]}")
                return {"success": False, "message": f"AI 서비스 오류 ({resp.status_code})"}
            rj = resp.json()
            finish = (rj.get("choices") or [{}])[0].get("finish_reason")
            content = rj["choices"][0]["message"]["content"].strip()
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                # 잘림/잡텍스트 폴백 — 최외곽 {...} 추출 재시도
                a, b = content.find("{"), content.rfind("}")
                parsed = None
                if a != -1 and b != -1 and b > a:
                    try:
                        parsed = json.loads(content[a:b + 1])
                    except json.JSONDecodeError:
                        parsed = None
                if parsed is None:
                    msg = "AI 응답 파싱 실패"
                    if finish == "length":
                        msg += " (출력 토큰 초과로 잘림 — 설명을 더 좁히거나 재시도)"
                    logger.error(f"profile parse fail finish={finish} len={len(content)}")
                    return {"success": False, "message": msg}

            # 정규화 + 방어
            def _clean_list(x, cap):
                return [s.strip() for s in (x or []) if isinstance(s, str) and s.strip()][:cap]

            atoms_raw = parsed.get("atom_library") or {}
            atom_library = {}
            if isinstance(atoms_raw, dict):
                for axis, items in atoms_raw.items():
                    cl = _clean_list(items, 120)
                    if cl:
                        atom_library[str(axis)[:30]] = cl
            profile = {
                "atom_library": atom_library,
                "relevance_keywords": _clean_list(parsed.get("relevance_keywords"), 800),
                "negative_keywords": _clean_list(parsed.get("negative_keywords"), 60),
                "example_seeds": _clean_list(parsed.get("example_seeds"), 50),
                "rationale": str(parsed.get("rationale") or "")[:500],
            }
            # 조합 규모 추정 (축 곱)
            combo = 1
            for items in atom_library.values():
                combo *= max(1, len(items))
            profile["estimated_combinations"] = combo
            return {"success": True, "profile": profile, "model": OPENAI_MODEL}
    except Exception as e:
        logger.exception("generate_domain_profile failed")
        return {"success": False, "message": f"프로파일 생성 실패: {str(e)[:200]}"}
