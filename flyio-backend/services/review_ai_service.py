"""
리뷰 AI 답변 생성 + 삭제/신고 가이드 + AI 인사이트 리포트 서비스
"""
import httpx
import logging
import json
from typing import Dict, Optional, List
from config import settings

logger = logging.getLogger(__name__)


class ReviewAIService:
    """AI 리뷰 답변 생성 + 플랫폼별 신고 가이드"""

    def __init__(self):
        self.model = "gpt-4o-mini"

    async def generate_response(
        self,
        review_content: str,
        rating: int,
        store_name: str,
        tone: str = "professional",
        category: str = None,
        custom_instruction: str = None,
    ) -> Dict:
        """AI 리뷰 답변 생성"""
        if not settings.OPENAI_API_KEY:
            return {
                "success": False,
                "message": "OpenAI API가 설정되지 않았습니다",
                "response": None,
            }

        tone_descriptions = {
            "professional": "전문적이고 정중한 톤. 사업주로서의 신뢰감을 전달합니다.",
            "friendly": "따뜻하고 친근한 톤. 마치 이웃처럼 편안하게 답변합니다.",
            "apologetic": "진심으로 사과하는 톤. 고객의 불편에 깊이 공감합니다.",
        }

        category_hints = {
            "food": "음식의 맛이나 품질에 대한 불만입니다. 레시피 개선이나 재료 점검을 언급하세요.",
            "service": "직원의 서비스 태도에 대한 불만입니다. 직원 교육 강화를 언급하세요.",
            "hygiene": "위생에 대한 불만입니다. 위생 관리 강화 조치를 구체적으로 언급하세요.",
            "price": "가격 대비 만족도에 대한 불만입니다. 가치를 설명하거나 이벤트를 안내하세요.",
            "other": "기타 불만 사항입니다. 구체적인 내용에 맞춰 답변하세요.",
        }

        system_prompt = f"""당신은 '{store_name}' 사장님을 대신하여 고객 리뷰에 답변하는 전문가입니다.

톤: {tone_descriptions.get(tone, tone_descriptions['professional'])}

답변 규칙:
1. 방문해주신 것에 감사 인사로 시작
2. 고객이 언급한 불만/칭찬 포인트를 구체적으로 언급하며 공감
3. 부정 리뷰인 경우: 개선 의지나 구체적 해결 방안 제시
4. 긍정 리뷰인 경우: 감사와 함께 재방문 유도
5. 150~200자 내외로 간결하게
6. 과도한 사과나 변명은 지양
7. 자연스러운 한국어 존댓말 사용
8. 이모지 사용 금지"""

        if category and category in category_hints:
            system_prompt += f"\n\n불만 카테고리 힌트: {category_hints[category]}"

        if custom_instruction:
            system_prompt += f"\n\n사장님 추가 지침: {custom_instruction}"

        user_prompt = f"""다음 리뷰에 답변해주세요:

별점: {rating}/5
리뷰 내용: {review_content}

바로 복사해서 붙여넣을 수 있는 답변만 작성해주세요."""

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "max_tokens": 500,
                        "temperature": 0.7,
                    },
                )

                if resp.status_code == 200:
                    result = resp.json()
                    response_text = result["choices"][0]["message"]["content"].strip()
                    return {
                        "success": True,
                        "response": response_text,
                        "model": self.model,
                    }
                else:
                    logger.error(f"OpenAI error: {resp.status_code} - {resp.text}")
                    return {
                        "success": False,
                        "message": f"AI 서비스 오류 ({resp.status_code})",
                        "response": None,
                    }
        except Exception as e:
            logger.error(f"AI response generation failed: {e}")
            return {
                "success": False,
                "message": str(e),
                "response": None,
            }

    # ===== AI 인사이트 리포트 =====

    async def generate_weekly_insight(
        self,
        store_name: str,
        reviews: List[Dict],
        stats: Dict,
        category_breakdown: List[Dict],
        keyword_frequency: List[Dict],
    ) -> Dict:
        """
        AI 주간 인사이트 리포트 생성
        리뷰 데이터를 분석하여 강점, 약점, 개선 포인트, 실행 제안을 생성
        """
        if not settings.OPENAI_API_KEY:
            return {"success": False, "message": "OpenAI API가 설정되지 않았습니다", "report": None}

        # 최근 리뷰 요약 (최대 30개)
        recent_reviews_text = ""
        for r in reviews[:30]:
            sentiment_kr = {"positive": "긍정", "negative": "부정", "neutral": "중립"}.get(r.get("sentiment", ""), "")
            recent_reviews_text += f"- [{sentiment_kr}] 별점 {r.get('rating', 0)}/5: {r.get('content', '')[:100]}\n"

        # 카테고리 요약
        category_text = ""
        for c in category_breakdown:
            category_text += f"- {c.get('label', c.get('category', ''))}: {c.get('count', 0)}건\n"

        # 키워드 요약
        pos_kw = [k["keyword"] for k in keyword_frequency if k.get("type") == "positive"][:8]
        neg_kw = [k["keyword"] for k in keyword_frequency if k.get("type") == "negative"][:8]

        system_prompt = f"""당신은 '{store_name}'의 평판 분석 전문 컨설턴트입니다.
고객 리뷰 데이터를 분석하여 실질적인 인사이트 리포트를 작성해주세요.

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이 JSON만):
{{
  "summary": "전체 요약 (2-3문장)",
  "strengths": ["강점 1", "강점 2", "강점 3"],
  "weaknesses": ["약점 1", "약점 2", "약점 3"],
  "improvements": [
    {{"title": "개선 제목", "description": "구체적 실행 방안", "priority": "high/medium/low"}},
    {{"title": "개선 제목", "description": "구체적 실행 방안", "priority": "high/medium/low"}}
  ],
  "risk_alert": "가장 시급한 위험 요소 (없으면 null)",
  "positive_highlight": "가장 눈에 띄는 긍정적 트렌드",
  "recommended_actions": ["이번 주 실행할 액션 1", "액션 2", "액션 3"]
}}"""

        user_prompt = f"""다음 데이터를 분석하여 인사이트 리포트를 작성해주세요.

📊 전체 통계:
- 총 리뷰: {stats.get('total_reviews', 0)}건
- 평균 평점: {stats.get('avg_rating', 0)}/5
- 긍정: {stats.get('sentiment_counts', {}).get('positive', 0)}건
- 부정: {stats.get('sentiment_counts', {}).get('negative', 0)}건
- 중립: {stats.get('sentiment_counts', {}).get('neutral', 0)}건
- 최근 7일 새 리뷰: {stats.get('recent_7d_reviews', 0)}건
- 답변율: {stats.get('response_rate', 0)}%

📝 부정 리뷰 원인 분포:
{category_text or '(데이터 없음)'}

🔑 긍정 키워드: {', '.join(pos_kw) if pos_kw else '(없음)'}
🔑 부정 키워드: {', '.join(neg_kw) if neg_kw else '(없음)'}

📋 최근 리뷰:
{recent_reviews_text or '(리뷰 없음)'}"""

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "max_tokens": 1500,
                        "temperature": 0.5,
                    },
                )

                if resp.status_code == 200:
                    result = resp.json()
                    content = result["choices"][0]["message"]["content"].strip()
                    # JSON 파싱
                    try:
                        # 코드 블록 제거
                        if content.startswith("```"):
                            content = content.split("```")[1]
                            if content.startswith("json"):
                                content = content[4:]
                        report = json.loads(content)
                    except json.JSONDecodeError:
                        report = {"summary": content, "strengths": [], "weaknesses": [], "improvements": [], "recommended_actions": []}

                    return {"success": True, "report": report, "model": self.model}
                else:
                    logger.error(f"OpenAI insight error: {resp.status_code}")
                    return {"success": False, "message": f"AI 서비스 오류 ({resp.status_code})", "report": None}

        except Exception as e:
            logger.error(f"AI insight generation failed: {e}")
            return {"success": False, "message": str(e), "report": None}

    async def generate_competitor_analysis(
        self,
        store_name: str,
        store_stats: Dict,
        competitors: List[Dict],
    ) -> Dict:
        """경쟁업체 비교 분석 AI 리포트"""
        if not settings.OPENAI_API_KEY:
            return {"success": False, "message": "OpenAI API가 설정되지 않았습니다", "analysis": None}

        competitor_text = ""
        for c in competitors:
            competitor_text += f"- {c.get('name', '')}: 평점 {c.get('avg_rating', 0)}/5, 리뷰 {c.get('total_reviews', 0)}건, 부정 {c.get('negative_count', 0)}건\n"

        system_prompt = f"""당신은 '{store_name}'의 마케팅 전략 컨설턴트입니다.
경쟁업체 데이터를 비교 분석하여 전략적 인사이트를 제공해주세요.

반드시 JSON 형식으로만 응답:
{{
  "position": "시장 내 위치 요약 (1문장)",
  "advantages": ["경쟁 우위 1", "경쟁 우위 2"],
  "disadvantages": ["열위 요소 1", "열위 요소 2"],
  "strategies": [
    {{"title": "전략 제목", "description": "구체적 방안"}}
  ],
  "benchmark": "벤치마킹할 경쟁업체와 이유"
}}"""

        user_prompt = f"""내 가게 ({store_name}):
- 평점: {store_stats.get('avg_rating', 0)}/5
- 총 리뷰: {store_stats.get('total_reviews', 0)}건
- 긍정: {store_stats.get('sentiment_counts', {}).get('positive', 0)}건
- 부정: {store_stats.get('sentiment_counts', {}).get('negative', 0)}건

경쟁업체:
{competitor_text or '(등록된 경쟁업체 없음)'}"""

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "max_tokens": 1000,
                        "temperature": 0.5,
                    },
                )

                if resp.status_code == 200:
                    result = resp.json()
                    content = result["choices"][0]["message"]["content"].strip()
                    try:
                        if content.startswith("```"):
                            content = content.split("```")[1]
                            if content.startswith("json"):
                                content = content[4:]
                        analysis = json.loads(content)
                    except json.JSONDecodeError:
                        analysis = {"position": content, "advantages": [], "disadvantages": [], "strategies": []}

                    return {"success": True, "analysis": analysis}
                else:
                    return {"success": False, "message": f"AI 서비스 오류 ({resp.status_code})", "analysis": None}

        except Exception as e:
            logger.error(f"AI competitor analysis failed: {e}")
            return {"success": False, "message": str(e), "analysis": None}

    # ===== 삭제/신고 가이드 =====

    @staticmethod
    def get_deletion_guide(platform: str, review_type: str = "general") -> Dict:
        """플랫폼별 리뷰 삭제/신고 가이드"""

        guides = {
            "naver_place": {
                "platform_name": "네이버 플레이스",
                "can_delete": False,
                "can_report": True,
                "report_reasons": [
                    "허위/사실과 다른 내용",
                    "욕설/비방/인신공격",
                    "광고/스팸",
                    "개인정보 노출",
                    "경쟁업체 악의적 리뷰",
                ],
                "steps": [
                    "네이버 플레이스 앱 또는 웹에서 내 업체 관리 접속",
                    "해당 리뷰 찾기 → 오른쪽 '...' 메뉴 → '신고'",
                    "신고 사유 선택 (가장 적절한 항목 선택)",
                    "상세 사유 작성 (구체적일수록 처리 가능성 높음)",
                    "증빙자료 첨부 (CCTV 캡처, 예약/결제 기록 등)",
                    "신고 접수 → 처리 결과 알림 대기",
                ],
                "processing_time": "영업일 기준 3~7일",
                "tips": [
                    "방문일자/예약 기록이 없는 리뷰는 '방문 사실 불일치'로 신고",
                    "욕설이 포함된 경우 신고 성공률이 높음",
                    "신고 전에 사장님 답변을 먼저 달아두면 다른 고객에게 신뢰감 제공",
                    "같은 리뷰를 여러 번 신고하면 역효과 — 1회 정확하게 신고",
                    "네이버 고객센터 (1588-3820) 전화 문의도 가능",
                ],
                "legal_options": {
                    "defamation": {
                        "title": "명예훼손 (형법 제307조)",
                        "description": "공연히 사실/허위사실을 적시하여 명예를 훼손한 경우",
                        "steps": [
                            "리뷰 내용 캡처 (URL, 날짜, 내용 포함)",
                            "허위사실 입증 자료 준비",
                            "가까운 경찰서 사이버수사팀에 고소장 접수",
                            "또는 변호사를 통해 민사 손해배상 청구",
                        ],
                        "estimated_cost": "변호사 비용 50~200만원, 소송 시 추가",
                    },
                    "insult": {
                        "title": "모욕죄 (형법 제311조)",
                        "description": "공연히 사람을 모욕한 경우 (욕설, 비하 표현 등)",
                        "steps": [
                            "욕설/모욕 표현이 담긴 리뷰 캡처",
                            "경찰서 사이버수사팀에 고소장 접수",
                        ],
                        "estimated_cost": "고소 자체는 무료, 변호사 선임 시 50만원~",
                    },
                },
            },
            "google": {
                "platform_name": "구글 리뷰",
                "can_delete": False,
                "can_report": True,
                "report_reasons": [
                    "스팸 또는 가짜 콘텐츠",
                    "관련 없는 콘텐츠",
                    "이해 충돌",
                    "욕설",
                    "괴롭힘 또는 따돌림",
                    "차별 또는 혐오 발언",
                ],
                "steps": [
                    "Google Maps에서 내 업체 찾기",
                    "해당 리뷰 옆 깃발(🚩) 아이콘 클릭",
                    "신고 사유 선택",
                    "Google 검토팀이 확인 후 조치",
                ],
                "processing_time": "수 일 ~ 수 주 (Google 기준)",
                "tips": [
                    "Google 비즈니스 프로필에서 '리뷰 관리'로 더 쉽게 신고 가능",
                    "같은 사용자가 여러 업체에 유사한 악평을 남긴 경우 '스팸' 신고",
                    "사장님 답변을 달면 다른 고객에게 프로페셔널한 인상 전달",
                    "Google은 욕설/혐오 표현에 비교적 빠르게 대응",
                ],
                "legal_options": {
                    "defamation": {
                        "title": "명예훼손 (형법 제307조)",
                        "description": "허위사실 기재 시 적용 가능",
                        "steps": [
                            "리뷰 캡처 + 허위사실 입증 자료 준비",
                            "경찰서 사이버수사팀에 고소장 접수",
                            "Google에도 별도로 법적 삭제 요청 가능 (Legal Removal Request)",
                        ],
                        "estimated_cost": "변호사 비용 50~200만원",
                    },
                },
            },
            "kakao": {
                "platform_name": "카카오맵",
                "can_delete": False,
                "can_report": True,
                "report_reasons": [
                    "허위/광고성 리뷰",
                    "욕설/비방",
                    "개인정보 노출",
                    "관련 없는 내용",
                ],
                "steps": [
                    "카카오맵 앱에서 내 업체 찾기",
                    "해당 리뷰 → '신고' 버튼",
                    "신고 사유 선택 및 상세 내용 작성",
                    "카카오 검토팀 확인 후 조치",
                ],
                "processing_time": "영업일 기준 3~5일",
                "tips": [
                    "카카오 고객센터를 통한 문의도 가능",
                    "욕설/비방 리뷰는 비교적 빠르게 처리",
                ],
                "legal_options": {
                    "defamation": {
                        "title": "명예훼손 (형법 제307조)",
                        "description": "네이버와 동일한 법적 절차 적용",
                        "steps": [
                            "리뷰 캡처 보존",
                            "경찰서 사이버수사팀에 고소장 접수",
                        ],
                        "estimated_cost": "변호사 비용 50~200만원",
                    },
                },
            },
        }

        guide = guides.get(platform, guides["naver_place"])

        # 리뷰 유형별 추가 가이드
        if review_type == "defamation" and "defamation" in guide.get("legal_options", {}):
            guide["recommended_action"] = guide["legal_options"]["defamation"]
        elif review_type == "insult" and "insult" in guide.get("legal_options", {}):
            guide["recommended_action"] = guide["legal_options"]["insult"]
        else:
            guide["recommended_action"] = {
                "title": "사장님 답변 달기 (권장)",
                "description": "대부분의 부정 리뷰는 정중한 답변으로 대응하는 것이 가장 효과적입니다.",
                "steps": [
                    "감정적 대응 대신 전문적인 답변 작성",
                    "고객 불만에 공감 표현",
                    "개선 의지 전달",
                    "다른 잠재 고객들도 답변을 보게 됨을 인식",
                ],
            }

        return guide
