"""
Threads 자동화 - AI 콘텐츠 생성 서비스
자연스러운 콘텐츠 플랜 생성
"""
import os
import json
import random
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import httpx

logger = logging.getLogger(__name__)

# OpenAI API 설정
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


class ThreadsContentService:
    """쓰레드 콘텐츠 생성 서비스"""

    # 콘텐츠 타입 비율 (4-3-2-1 법칙)
    CONTENT_TYPE_WEIGHTS = {
        "value": 0.40,     # 가치/공감 콘텐츠
        "engage": 0.30,    # 소통 콘텐츠
        "story": 0.20,     # 스토리 콘텐츠
        "promo": 0.10      # 홍보 콘텐츠 (Phase 4에서만)
    }

    # 레이어별 비율
    LAYER_WEIGHTS = {
        "daily": 0.60,     # 일상 (홍보와 무관)
        "interest": 0.25,  # 관심사 (간접 연결)
        "storyline": 0.15  # 핵심 여정
    }

    # Phase별 설정
    PHASES = {
        "warmup": {
            "name": "워밍업",
            "day_range": (1, 14),
            "promo_ratio": 0.0,
            "storyline_ratio": 0.0,
            "description": "평범한 사람으로 인식되기"
        },
        "seed": {
            "name": "씨앗 뿌리기",
            "day_range": (15, 35),
            "promo_ratio": 0.0,
            "storyline_ratio": 0.10,
            "description": "관련 관심사 자연스럽게 노출"
        },
        "deepen": {
            "name": "관심 깊어지기",
            "day_range": (36, 60),
            "promo_ratio": 0.0,
            "storyline_ratio": 0.20,
            "description": "관심이 깊어지는 모습"
        },
        "experience": {
            "name": "경험 & 발견",
            "day_range": (61, 80),
            "promo_ratio": 0.05,
            "storyline_ratio": 0.30,
            "description": "직접 경험하고 공유"
        },
        "connect": {
            "name": "자연스러운 연결",
            "day_range": (81, 90),
            "promo_ratio": 0.15,
            "storyline_ratio": 0.40,
            "description": "브랜드와 자연스럽게 연결"
        }
    }

    # 감정 패턴 (요일별)
    EMOTION_PATTERNS = {
        0: {"tired": 0.4, "neutral": 0.3, "frustrated": 0.2, "happy": 0.1},  # 월
        1: {"neutral": 0.4, "tired": 0.3, "curious": 0.2, "happy": 0.1},     # 화
        2: {"neutral": 0.4, "curious": 0.3, "happy": 0.2, "tired": 0.1},     # 수
        3: {"neutral": 0.3, "happy": 0.3, "excited": 0.2, "curious": 0.2},   # 목
        4: {"excited": 0.4, "happy": 0.3, "peaceful": 0.2, "neutral": 0.1},  # 금
        5: {"peaceful": 0.4, "happy": 0.3, "excited": 0.2, "curious": 0.1},  # 토
        6: {"peaceful": 0.3, "tired": 0.3, "neutral": 0.3, "frustrated": 0.1} # 일
    }

    # 일상 콘텐츠 주제들
    DAILY_TOPICS = [
        "출퇴근", "점심", "날씨", "주말 계획", "넷플릭스/드라마",
        "카페", "운동", "친구 만남", "야근", "알람", "지하철",
        "맛집", "퇴근", "월요병", "금요일", "늦잠", "집콕"
    ]

    def __init__(self):
        self.openai_api_key = OPENAI_API_KEY

    def get_phase_for_day(self, day: int, total_days: int) -> str:
        """해당 날짜의 Phase 결정"""
        ratio = day / total_days

        if ratio <= 0.15:
            return "warmup"
        elif ratio <= 0.38:
            return "seed"
        elif ratio <= 0.66:
            return "deepen"
        elif ratio <= 0.88:
            return "experience"
        else:
            return "connect"

    def get_emotion_for_day(self, day: int) -> str:
        """해당 날짜의 감정 결정 (요일 기반)"""
        weekday = day % 7
        emotions = self.EMOTION_PATTERNS[weekday]
        return random.choices(
            list(emotions.keys()),
            weights=list(emotions.values())
        )[0]

    def get_layer_for_day(self, day: int, phase: str, last_storyline_day: int) -> str:
        """해당 날짜의 레이어 결정"""
        phase_config = self.PHASES[phase]
        storyline_ratio = phase_config["storyline_ratio"]

        # 스토리라인 간격 체크 (최소 3일)
        if day - last_storyline_day < 3:
            storyline_ratio = 0

        # 확률 기반 결정
        rand = random.random()
        if rand < storyline_ratio:
            return "storyline"
        elif rand < storyline_ratio + 0.25:
            return "interest"
        else:
            return "daily"

    def get_content_type(self, layer: str, phase: str) -> str:
        """콘텐츠 타입 결정"""
        if layer == "daily":
            # 일상은 가치/소통 위주
            return random.choices(
                ["value", "engage", "story"],
                weights=[0.4, 0.4, 0.2]
            )[0]
        elif layer == "interest":
            return random.choices(
                ["value", "engage", "story"],
                weights=[0.3, 0.3, 0.4]
            )[0]
        else:  # storyline
            if phase == "connect":
                return random.choices(
                    ["story", "value", "promo"],
                    weights=[0.5, 0.3, 0.2]
                )[0]
            else:
                return random.choices(
                    ["story", "value", "engage"],
                    weights=[0.5, 0.3, 0.2]
                )[0]

    async def generate_plan_structure(
        self,
        persona: Dict,
        campaign: Dict
    ) -> List[Dict]:
        """콘텐츠 플랜 구조 생성 (AI 호출 전 뼈대)"""
        duration = campaign.get("duration_days", 90)
        posts = []
        last_storyline_day = -10  # 초기값

        for day in range(1, duration + 1):
            phase = self.get_phase_for_day(day, duration)
            emotion = self.get_emotion_for_day(day)
            layer = self.get_layer_for_day(day, phase, last_storyline_day)
            content_type = self.get_content_type(layer, phase)

            if layer == "storyline":
                last_storyline_day = day

            posts.append({
                "day_number": day,
                "phase": phase,
                "layer": layer,
                "content_type": content_type,
                "emotion": emotion,
                "content": "",  # AI가 채울 부분
                "hashtags": []
            })

        return posts

    async def generate_content_with_ai(
        self,
        persona: Dict,
        campaign: Dict,
        plan_structure: List[Dict],
        batch_size: int = 10
    ) -> List[Dict]:
        """AI로 실제 콘텐츠 생성"""
        if not self.openai_api_key:
            logger.warning("OpenAI API key not configured, using template content")
            return self._generate_template_content(persona, campaign, plan_structure)

        results = []

        # 배치로 처리
        for i in range(0, len(plan_structure), batch_size):
            batch = plan_structure[i:i + batch_size]
            batch_results = await self._generate_batch(persona, campaign, batch, results)
            results.extend(batch_results)

        return results

    async def _generate_batch(
        self,
        persona: Dict,
        campaign: Dict,
        batch: List[Dict],
        previous_posts: List[Dict]
    ) -> List[Dict]:
        """배치 단위로 AI 콘텐츠 생성"""
        # 최근 게시물 컨텍스트
        recent_posts = previous_posts[-5:] if previous_posts else []
        recent_context = "\n".join([
            f"D+{p['day_number']}: {p['content']}"
            for p in recent_posts
        ]) if recent_posts else "없음"

        prompt = f"""
당신은 SNS 콘텐츠 전문가입니다. 쓰레드(Threads)에 올릴 자연스러운 게시물을 작성합니다.

## 페르소나
- 이름: {persona.get('name', '민지')}
- 나이: {persona.get('age', 28)}세
- 직업: {persona.get('job', '마케터')}
- 성격: {persona.get('personality', '밝고 긍정적')}
- 말투: {persona.get('tone', 'friendly')}
- 관심사: {', '.join(persona.get('interests', ['카페', '맛집']))}

## 캠페인 정보
- 브랜드: {campaign.get('brand_name', '')}
- 설명: {campaign.get('brand_description', '')}
- 타겟: {campaign.get('target_audience', '')}
- 최종 목표: {campaign.get('final_goal', '')}

## 최근 게시물 (맥락 유지)
{recent_context}

## 절대 규칙
1. 광고처럼 보이면 실패
2. 쓰레드 특유의 짧고 임팩트 있는 문체 (30-60자)
3. 이전 게시물과 자연스럽게 연결되되 강제로 연결 X
4. 완벽하면 가짜 - 가끔 실패/고민 포함
5. 감정이 자연스럽게 묻어나게

## 생성할 게시물
{json.dumps([{
    "day": p["day_number"],
    "phase": p["phase"],
    "layer": p["layer"],
    "content_type": p["content_type"],
    "emotion": p["emotion"]
} for p in batch], ensure_ascii=False, indent=2)}

## 출력 형식 (JSON 배열만)
[
  {{"day": 1, "content": "게시물 내용", "hashtags": []}},
  ...
]

위 정보를 바탕으로 각 게시물의 content를 작성하세요.
layer가 "daily"면 홍보와 전혀 관계없는 일상,
layer가 "interest"면 관련 분야 간접 언급,
layer가 "storyline"이면 브랜드와 연결되는 여정입니다.
"""

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.openai_api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [
                            {"role": "system", "content": "You are a Korean SNS content expert. Always respond in Korean. Return only valid JSON array."},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.8,
                        "max_tokens": 2000
                    }
                )

                if response.status_code == 200:
                    result = response.json()
                    content = result["choices"][0]["message"]["content"]

                    # JSON 파싱
                    try:
                        # ```json ... ``` 제거
                        if "```" in content:
                            content = content.split("```")[1]
                            if content.startswith("json"):
                                content = content[4:]

                        generated = json.loads(content.strip())

                        # 원본 구조와 병합
                        for i, item in enumerate(batch):
                            if i < len(generated):
                                item["content"] = generated[i].get("content", "")
                                item["hashtags"] = generated[i].get("hashtags", [])
                            else:
                                item["content"] = self._get_fallback_content(item)

                        return batch

                    except json.JSONDecodeError as e:
                        logger.error(f"JSON parse error: {e}")
                        return self._generate_template_content(persona, campaign, batch)
                else:
                    logger.error(f"OpenAI API error: {response.status_code}")
                    return self._generate_template_content(persona, campaign, batch)

        except Exception as e:
            logger.error(f"AI generation error: {e}")
            return self._generate_template_content(persona, campaign, batch)

    def _generate_template_content(
        self,
        persona: Dict,
        campaign: Dict,
        posts: List[Dict]
    ) -> List[Dict]:
        """AI 없이 템플릿 기반 콘텐츠 생성 (폴백)"""
        templates = {
            "daily": {
                "tired": [
                    "월요일 아침부터 지하철 환승 3번... 출근만 했는데 벌써 지침",
                    "오늘 회의 5개... 살려줘",
                    "퇴근하고 싶다 (출근한 지 1시간)",
                    "알람 5번 끄고 겨우 일어남",
                    "야근 3일째... 집 그리움"
                ],
                "happy": [
                    "금요일이다!!!",
                    "퇴근 후 치맥 예약 완료",
                    "오랜만에 친구 만나서 수다 떨었더니 힐링됨",
                    "주말에 늦잠 자기로 결정",
                    "점심 맛집 발견함 완전 대박"
                ],
                "neutral": [
                    "점심 뭐 먹지 고민하다 결국 편의점",
                    "비 오는 날 재택 최고",
                    "유튜브 알고리즘이 나를 너무 잘 알아서 무서움",
                    "주말에 뭐 하지 고민",
                    "넷플릭스 뭐 볼지 추천 좀"
                ],
                "excited": [
                    "드디어 금요일!!!",
                    "주말 계획 완벽",
                    "오늘 기분 좋음 이유 없음",
                    "새로운 거 시작하고 싶은 기분"
                ],
                "peaceful": [
                    "집에서 보내는 주말이 제일 좋음",
                    "아무것도 안 하고 멍 때리는 시간 필요",
                    "카페에서 창밖 보는 중",
                    "일요일 낮잠의 행복"
                ],
                "frustrated": [
                    "일요일 저녁 특유의 그 기분 아시는 분",
                    "월요일 또 왔네... 시간 왜 이렇게 빨라",
                    "비 오는 날 출근 최악",
                    "회의 중 졸음 참기 챌린지"
                ],
                "curious": [
                    "요즘 다들 뭐 하고 있어?",
                    "재밌는 거 추천 좀",
                    "이거 나만 모르는 거야?",
                    "새로운 취미 찾고 싶음"
                ]
            },
            "interest": [
                "요즘 집에 있는 시간이 많아서 인테리어 관심 생김",
                "친구 집 놀러갔는데 분위기 좋았음 뭐냐고 물어봄",
                "유튜브에서 관련 영상 계속 뜨는데 신기하네",
                "뭔가 새로운 거 해보고 싶은 기분",
                "주변에서 다들 이거 한다던데"
            ],
            "storyline": {
                "seed": [
                    "친구가 추천해준 거 찾아보는 중",
                    "관심 있는 분야 유튜브 정주행 중",
                    "이쪽 분야 생각보다 재밌네"
                ],
                "deepen": [
                    "원데이클래스 있던데 해볼까 고민 중",
                    "직접 해보고 싶어서 알아보는 중",
                    "생각보다 진입장벽이 낮네"
                ],
                "experience": [
                    "드디어 직접 해봤는데 생각보다 재밌음",
                    "첫 경험 후기: 어렵지만 뿌듯",
                    "두 번째 도전. 이번엔 좀 나음"
                ],
                "connect": [
                    "요즘 이게 유일한 낙",
                    "주변에서 나도 해달라고 함 ㅋㅋ",
                    "취미가 일이 되면 어떨까 가끔 생각"
                ]
            }
        }

        for post in posts:
            layer = post.get("layer", "daily")
            emotion = post.get("emotion", "neutral")
            phase = post.get("phase", "warmup")

            if layer == "daily":
                emotion_templates = templates["daily"].get(emotion, templates["daily"]["neutral"])
                post["content"] = random.choice(emotion_templates)
            elif layer == "interest":
                post["content"] = random.choice(templates["interest"])
            else:  # storyline
                phase_templates = templates["storyline"].get(phase, templates["storyline"]["seed"])
                post["content"] = random.choice(phase_templates)

            post["hashtags"] = []

        return posts

    def _get_fallback_content(self, post: Dict) -> str:
        """폴백 콘텐츠"""
        fallbacks = {
            "daily": "오늘도 평범한 하루",
            "interest": "요즘 이쪽에 관심이 생김",
            "storyline": "새로운 경험 중"
        }
        return fallbacks.get(post.get("layer", "daily"), "오늘의 이야기")

    async def generate_single_post(
        self,
        persona: Dict,
        campaign: Dict,
        day_number: int,
        layer: str,
        content_type: str,
        emotion: str,
        recent_posts: List[Dict] = None
    ) -> str:
        """단일 게시물 재생성"""
        phase = self.get_phase_for_day(day_number, campaign.get("duration_days", 90))

        post_structure = [{
            "day_number": day_number,
            "phase": phase,
            "layer": layer,
            "content_type": content_type,
            "emotion": emotion
        }]

        # 이전 게시물 컨텍스트 포함
        result = await self._generate_batch(persona, campaign, post_structure, recent_posts or [])

        return result[0]["content"] if result else ""

    def validate_plan(self, posts: List[Dict]) -> Dict:
        """플랜 자연스러움 검증"""
        issues = []
        score = 100

        # 1. 노이즈 비율 체크 (60% 이상)
        daily_count = sum(1 for p in posts if p.get("layer") == "daily")
        daily_ratio = daily_count / len(posts) if posts else 0
        if daily_ratio < 0.55:
            issues.append({
                "type": "noise_ratio",
                "message": f"일상 콘텐츠 비율이 낮음 ({daily_ratio:.0%}). 60% 이상 권장"
            })
            score -= 15

        # 2. 스토리라인 간격 체크 (최소 3일)
        storyline_days = [p["day_number"] for p in posts if p.get("layer") == "storyline"]
        for i in range(1, len(storyline_days)):
            gap = storyline_days[i] - storyline_days[i-1]
            if gap < 3:
                issues.append({
                    "type": "storyline_gap",
                    "day": storyline_days[i],
                    "message": f"Day {storyline_days[i-1]}와 {storyline_days[i]}에 연속 스토리라인 (간격: {gap}일)"
                })
                score -= 10

        # 3. 감정 다양성 체크
        emotions = set(p.get("emotion") for p in posts)
        if len(emotions) < 4:
            issues.append({
                "type": "emotion_variety",
                "message": f"감정 다양성 부족 ({len(emotions)}종류). 5종류 이상 권장"
            })
            score -= 10

        # 4. Phase 0에서 홍보 언급 체크
        warmup_promo = [p for p in posts if p.get("phase") == "warmup" and p.get("layer") == "storyline"]
        if warmup_promo:
            issues.append({
                "type": "early_promo",
                "message": f"워밍업 기간에 스토리라인 {len(warmup_promo)}개 발견. 0개 권장"
            })
            score -= 20

        return {
            "is_valid": score >= 70,
            "score": max(0, score),
            "issues": issues,
            "stats": {
                "total_posts": len(posts),
                "daily_ratio": f"{daily_ratio:.0%}",
                "storyline_count": len(storyline_days),
                "emotion_variety": len(emotions)
            }
        }


# 싱글톤 인스턴스
threads_content_service = ThreadsContentService()
