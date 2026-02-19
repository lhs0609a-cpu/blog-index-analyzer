"""
퍼널 디자이너 — 헬스 스코어 계산 + OpenAI 호출 서비스
"""
import httpx
import logging
import json
from typing import Dict, List, Any
from config import settings

logger = logging.getLogger(__name__)


class FunnelDesignerService:
    """퍼널 헬스 스코어 + AI 진단 서비스"""

    def __init__(self):
        self.model = "gpt-4o-mini"

    # ========== 헬스 스코어 (규칙 기반) ==========

    def calculate_health_score(self, funnel_data: dict) -> Dict[str, Any]:
        """
        5개 카테고리 규칙 기반 100점 채점
        - 채널 다양성 (25점)
        - 전환 논리 (25점)
        - 이탈 방지 (20점)
        - 데이터 추적 (15점)
        - 비용 효율 (15점)
        """
        nodes = funnel_data.get("nodes", [])
        edges = funnel_data.get("edges", [])

        categories = {}
        recommendations = []

        # 노드 타입별 분류
        traffic_nodes = [n for n in nodes if n.get("type") == "traffic"]
        content_nodes = [n for n in nodes if n.get("type") == "content"]
        conversion_nodes = [n for n in nodes if n.get("type") == "conversion"]
        revenue_nodes = [n for n in nodes if n.get("type") == "revenue"]

        # 1. 채널 다양성 (25점)
        channel_score = 25
        traffic_count = len(traffic_nodes)
        if traffic_count == 0:
            channel_score = 0
            recommendations.append({
                "category": "채널 다양성",
                "severity": "high",
                "message": "유입 채널이 없습니다. 최소 1개 이상의 트래픽 소스를 추가하세요."
            })
        elif traffic_count == 1:
            channel_score = 10
            recommendations.append({
                "category": "채널 다양성",
                "severity": "medium",
                "message": "유입 채널이 1개뿐입니다. 2~3개로 다양화하면 리스크가 줄어듭니다."
            })
        elif traffic_count == 2:
            channel_score = 20
            recommendations.append({
                "category": "채널 다양성",
                "severity": "low",
                "message": "유입 채널이 2개입니다. 1개 더 추가하면 최적입니다."
            })
        categories["채널 다양성"] = {"score": channel_score, "max": 25}

        # 2. 전환 논리 (25점)
        logic_score = 25
        # 유입 → 매출 사이에 중간 단계가 있는지
        has_middle_step = len(content_nodes) > 0 or len(conversion_nodes) > 0
        has_content = len(content_nodes) > 0
        has_conversion = len(conversion_nodes) > 0

        if not has_middle_step:
            logic_score -= 20
            recommendations.append({
                "category": "전환 논리",
                "severity": "high",
                "message": "유입에서 매출까지 중간 단계가 없습니다. 콘텐츠나 전환 단계를 추가하세요."
            })
        if not has_content:
            logic_score -= 5
            recommendations.append({
                "category": "전환 논리",
                "severity": "medium",
                "message": "신뢰를 구축하는 콘텐츠 단계가 없습니다. 후기/상세페이지를 추가하세요."
            })
        if not has_conversion and len(revenue_nodes) > 0:
            logic_score -= 5
            recommendations.append({
                "category": "전환 논리",
                "severity": "medium",
                "message": "명시적인 전환 단계(상담/장바구니)가 없습니다."
            })

        # 엣지 연결 검사 - 고립된 노드가 없는지
        connected_nodes = set()
        for edge in edges:
            connected_nodes.add(edge.get("source"))
            connected_nodes.add(edge.get("target"))
        isolated = [n for n in nodes if n.get("id") not in connected_nodes]
        if isolated:
            logic_score = max(0, logic_score - 5 * len(isolated))
            recommendations.append({
                "category": "전환 논리",
                "severity": "medium",
                "message": f"연결되지 않은 노드가 {len(isolated)}개 있습니다."
            })

        logic_score = max(0, logic_score)
        categories["전환 논리"] = {"score": logic_score, "max": 25}

        # 3. 이탈 방지 (20점)
        retention_score = 20
        node_labels = " ".join([
            (n.get("data", {}).get("label", "") or "").lower()
            for n in nodes
        ])
        has_retargeting = any(kw in node_labels for kw in ["리타겟", "리마케팅", "retarget", "remarketing"])
        has_reminder = any(kw in node_labels for kw in ["리마인드", "이메일", "알림", "remind", "email", "sms", "카톡"])

        if not has_retargeting:
            retention_score -= 10
            recommendations.append({
                "category": "이탈 방지",
                "severity": "medium",
                "message": "리타겟팅 단계가 없습니다. 이탈 고객 재유입 전략을 추가하세요."
            })
        if not has_reminder:
            retention_score -= 5
            recommendations.append({
                "category": "이탈 방지",
                "severity": "low",
                "message": "리마인드 채널(이메일/SMS/카톡)이 없습니다."
            })

        # 복수 경로 존재 여부 (동일 target에 여러 source)
        target_counts = {}
        for edge in edges:
            t = edge.get("target")
            target_counts[t] = target_counts.get(t, 0) + 1
        has_multi_path = any(v > 1 for v in target_counts.values())
        if not has_multi_path and len(nodes) > 3:
            retention_score -= 5
            recommendations.append({
                "category": "이탈 방지",
                "severity": "low",
                "message": "단일 경로 퍼널입니다. 복수 유입 경로를 만들면 이탈 위험이 줄어듭니다."
            })

        retention_score = max(0, retention_score)
        categories["이탈 방지"] = {"score": retention_score, "max": 20}

        # 4. 데이터 추적 (15점)
        tracking_score = 15
        missing_data_count = 0
        for node in nodes:
            data = node.get("data", {})
            if not data.get("conversionRate") and not data.get("traffic"):
                missing_data_count += 1

        if missing_data_count > 0:
            deduction = min(15, missing_data_count * 5)
            tracking_score -= deduction
            recommendations.append({
                "category": "데이터 추적",
                "severity": "medium" if missing_data_count >= 2 else "low",
                "message": f"{missing_data_count}개 노드에 전환율/트래픽 데이터가 없습니다."
            })

        tracking_score = max(0, tracking_score)
        categories["데이터 추적"] = {"score": tracking_score, "max": 15}

        # 5. 비용 효율 (15점)
        efficiency_score = 15
        total_traffic_in = sum(n.get("data", {}).get("traffic", 0) for n in traffic_nodes)
        total_output = sum(n.get("data", {}).get("traffic", 0) for n in revenue_nodes)

        if total_traffic_in > 0 and total_output > 0:
            overall_rate = (total_output / total_traffic_in) * 100
            if overall_rate < 0.5:
                efficiency_score -= 10
                recommendations.append({
                    "category": "비용 효율",
                    "severity": "high",
                    "message": f"전체 전환율이 {overall_rate:.2f}%로 매우 낮습니다. 중간 단계 최적화가 필요합니다."
                })
            elif overall_rate < 1.0:
                efficiency_score -= 5
                recommendations.append({
                    "category": "비용 효율",
                    "severity": "medium",
                    "message": f"전체 전환율이 {overall_rate:.2f}%입니다. 개선 여지가 있습니다."
                })
        elif total_traffic_in == 0:
            efficiency_score = 0

        categories["비용 효율"] = {"score": efficiency_score, "max": 15}

        total_score = sum(c["score"] for c in categories.values())

        return {
            "total_score": total_score,
            "categories": categories,
            "recommendations": recommendations,
            "grade": self._get_grade(total_score),
        }

    @staticmethod
    def _get_grade(score: int) -> str:
        if score >= 90:
            return "S"
        elif score >= 80:
            return "A"
        elif score >= 65:
            return "B"
        elif score >= 50:
            return "C"
        elif score >= 30:
            return "D"
        else:
            return "F"

    # ========== AI 퍼널 닥터 ==========

    async def ai_doctor_diagnosis(self, funnel_data: dict) -> Dict[str, Any]:
        """GPT 기반 퍼널 구조 진단"""
        if not settings.OPENAI_API_KEY:
            return {"success": False, "message": "OpenAI API가 설정되지 않았습니다"}

        funnel_text = self._summarize_funnel_for_prompt(funnel_data)

        system_prompt = """당신은 디지털 마케팅 퍼널 전문 컨설턴트입니다.
주어진 마케팅 퍼널 구조를 분석하여 논리적 허점, 개선 포인트, 최적화 방안을 진단해주세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "diagnosis": [
    {
      "issue": "문제 제목",
      "severity": "high/medium/low",
      "description": "문제 상세 설명",
      "suggestion": "구체적 개선 방안",
      "estimated_impact": "예상 효과 (예: 전환율 20% 향상)"
    }
  ],
  "summary": "전체 진단 요약 (2-3문장)",
  "overall_rating": "A/B/C/D/F"
}"""

        user_prompt = f"""다음 마케팅 퍼널 구조를 진단해주세요:

{funnel_text}

주요 진단 포인트:
1. 퍼널 단계 간 논리적 연결이 자연스러운가?
2. 고객 이탈 포인트는 어디인가?
3. 빠진 단계나 불필요한 단계는 없는가?
4. 전환율 개선 여지가 있는 구간은?
5. 업종 특성에 맞는 퍼널인가?"""

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
                        "response_format": {"type": "json_object"},
                    },
                )

                if resp.status_code == 200:
                    result = resp.json()
                    content = result["choices"][0]["message"]["content"].strip()
                    try:
                        diagnosis = json.loads(content)
                    except json.JSONDecodeError:
                        diagnosis = {"summary": content, "diagnosis": []}
                    return {"success": True, "result": diagnosis, "model": self.model}
                else:
                    logger.error(f"OpenAI doctor error: {resp.status_code} - {resp.text}")
                    return {"success": False, "message": f"AI 서비스 오류 ({resp.status_code})"}

        except Exception as e:
            logger.error(f"AI doctor diagnosis failed: {e}")
            return {"success": False, "message": "AI 진단 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."}

    # ========== 페르소나 워크스루 ==========

    async def persona_walkthrough(self, funnel_data: dict, persona: dict) -> Dict[str, Any]:
        """GPT 기반 가상 고객 퍼널 시뮬레이션"""
        if not settings.OPENAI_API_KEY:
            return {"success": False, "message": "OpenAI API가 설정되지 않았습니다"}

        funnel_text = self._summarize_funnel_for_prompt(funnel_data)
        persona_text = self._format_persona(persona)

        system_prompt = """당신은 마케팅 퍼널 UX 전문가입니다.
주어진 페르소나가 마케팅 퍼널을 경험하는 과정을 1인칭 시점으로 시뮬레이션해주세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "steps": [
    {
      "node_id": "해당 노드 ID",
      "node_label": "노드 이름",
      "reaction": "1인칭 반응 (예: '음, 이 광고가 눈에 띄네. 클릭해볼까?')",
      "pass_probability": 0.0~1.0,
      "drop_reason": "이탈 시 사유 (통과 시 null)"
    }
  ],
  "overall_pass_rate": 0.0~1.0,
  "final_reaction": "최종 구매/이탈 후 소감",
  "improvement_suggestions": ["개선 제안 1", "개선 제안 2"]
}"""

        user_prompt = f"""다음 페르소나가 이 퍼널을 경험하는 과정을 시뮬레이션해주세요.

== 페르소나 ==
{persona_text}

== 퍼널 구조 ==
{funnel_text}

각 단계마다 이 페르소나의 성격, 소비습관, 디지털 역량을 고려하여 현실적인 반응을 생성해주세요."""

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
                        "max_tokens": 2000,
                        "temperature": 0.7,
                        "response_format": {"type": "json_object"},
                    },
                )

                if resp.status_code == 200:
                    result = resp.json()
                    content = result["choices"][0]["message"]["content"].strip()
                    try:
                        walkthrough = json.loads(content)
                    except json.JSONDecodeError:
                        walkthrough = {
                            "steps": [],
                            "overall_pass_rate": 0,
                            "improvement_suggestions": [content]
                        }
                    return {"success": True, "result": walkthrough, "model": self.model}
                else:
                    logger.error(f"OpenAI persona error: {resp.status_code} - {resp.text}")
                    return {"success": False, "message": f"AI 서비스 오류 ({resp.status_code})"}

        except Exception as e:
            logger.error(f"Persona walkthrough failed: {e}")
            return {"success": False, "message": "AI 진단 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."}

    # ========== 내부 헬퍼 ==========

    @staticmethod
    def _summarize_funnel_for_prompt(funnel_data: dict) -> str:
        """퍼널 데이터를 프롬프트용 텍스트로 변환"""
        nodes = funnel_data.get("nodes", [])
        edges = funnel_data.get("edges", [])

        lines = ["[퍼널 노드]"]
        node_map = {}
        for n in nodes:
            nid = n.get("id", "?")
            data = n.get("data", {})
            label = data.get("label", "이름 없음")
            ntype = n.get("type", "unknown")
            traffic = data.get("traffic", 0)
            rate = data.get("conversionRate", 0)
            node_map[nid] = label

            type_kr = {"traffic": "유입", "content": "콘텐츠", "conversion": "전환", "revenue": "매출"}.get(ntype, ntype)
            lines.append(f"  - [{nid}] {label} (타입: {type_kr}, 트래픽: {traffic}, 전환율: {rate}%)")

        lines.append("\n[퍼널 연결]")
        for e in edges:
            src = node_map.get(e.get("source"), e.get("source"))
            tgt = node_map.get(e.get("target"), e.get("target"))
            lines.append(f"  - {src} → {tgt}")

        return "\n".join(lines)

    @staticmethod
    def _format_persona(persona: dict) -> str:
        """페르소나를 프롬프트용 텍스트로 변환"""
        lines = [
            f"이름: {persona.get('name', '알 수 없음')}",
            f"나이: {persona.get('age', '?')}세 / {persona.get('gender', '?')}",
            f"직업: {persona.get('occupation', '?')}",
            f"소비성향: {persona.get('spending_habit', '?')}",
            f"의사결정 스타일: {persona.get('decision_style', '?')}",
            f"디지털 역량: {persona.get('digital_literacy', '?')}",
            f"선호 채널: {', '.join(persona.get('preferred_channels', []))}",
            f"페인포인트: {', '.join(persona.get('pain_points', []))}",
            f"설명: {persona.get('description', '')}",
        ]
        return "\n".join(lines)
