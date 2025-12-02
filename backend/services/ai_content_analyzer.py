"""
AI 기반 콘텐츠 품질 분석 시스템
Claude/ChatGPT API를 사용하여 콘텐츠 품질 심층 분석
"""
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
import re
import os

logger = logging.getLogger(__name__)

# AI API 클라이언트 (선택적)
try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    logger.warning("Anthropic 라이브러리가 설치되지 않았습니다. pip install anthropic으로 설치하세요.")


class AIContentAnalyzer:
    """AI 기반 콘텐츠 분석기"""

    def __init__(self, api_key: Optional[str] = None):
        """
        Args:
            api_key: Claude API 키 (환경변수 ANTHROPIC_API_KEY 사용 가능)
        """
        self.api_key = api_key or os.getenv('ANTHROPIC_API_KEY')

        if ANTHROPIC_AVAILABLE and self.api_key:
            self.client = anthropic.Anthropic(api_key=self.api_key)
            self.ai_enabled = True
            logger.info("[AI 분석기] Claude API 초기화 완료")
        else:
            self.client = None
            self.ai_enabled = False
            logger.warning("[AI 분석기] AI 분석을 사용할 수 없습니다 (API 키 필요)")

    def analyze_content_quality(self, post_content: str, post_title: str = "") -> Dict[str, Any]:
        """
        포스트 콘텐츠 품질 종합 분석

        Args:
            post_content: 포스트 본문
            post_title: 포스트 제목

        Returns:
            품질 분석 결과
        """
        try:
            logger.info(f"[AI 콘텐츠 분석] 시작: {post_title[:30]}...")

            # 1. 기본 텍스트 분석 (AI 없이도 가능)
            basic_analysis = self._basic_text_analysis(post_content)

            # 2. AI 기반 심층 분석 (API 키가 있을 경우)
            if self.ai_enabled:
                ai_analysis = self._ai_deep_analysis(post_content, post_title)
            else:
                ai_analysis = self._rule_based_analysis(post_content, post_title)

            # 3. 종합 점수 계산
            total_score = self._calculate_total_quality_score(basic_analysis, ai_analysis)

            result = {
                "post_title": post_title,
                "basic_analysis": basic_analysis,
                "ai_analysis": ai_analysis,
                "quality_score": total_score,
                "recommendations": self._generate_recommendations(basic_analysis, ai_analysis),
                "analyzed_at": datetime.utcnow().isoformat()
            }

            logger.info(f"[AI 콘텐츠 분석] 완료: 품질 점수 {total_score}/100")
            return result

        except Exception as e:
            logger.error(f"[AI 콘텐츠 분석] 오류: {e}", exc_info=True)
            return self._get_error_result(str(e))

    def _basic_text_analysis(self, content: str) -> Dict[str, Any]:
        """기본 텍스트 분석 (AI 불필요)"""
        try:
            # 글자 수
            char_count = len(content.replace(' ', '').replace('\n', ''))

            # 문장 수
            sentences = re.split(r'[.!?]+', content)
            sentence_count = len([s for s in sentences if s.strip()])

            # 문단 수 (빈 줄 기준)
            paragraphs = content.split('\n\n')
            paragraph_count = len([p for p in paragraphs if p.strip()])

            # 평균 문장 길이
            avg_sentence_length = char_count / sentence_count if sentence_count > 0 else 0

            # 맞춤법 오류 감지 (간단한 패턴 매칭)
            grammar_issues = self._detect_grammar_issues(content)

            # 점수 계산
            score = 0

            # 글자 수 점수 (1500자 이상 만점)
            if char_count >= 1500:
                score += 25
            elif char_count >= 1000:
                score += 20
            elif char_count >= 500:
                score += 10

            # 문단 구성 점수
            if paragraph_count >= 5:
                score += 15
            elif paragraph_count >= 3:
                score += 10

            # 문장 길이 적정성 (50-150자 사이가 이상적)
            if 50 <= avg_sentence_length <= 150:
                score += 10

            return {
                "char_count": char_count,
                "sentence_count": sentence_count,
                "paragraph_count": paragraph_count,
                "avg_sentence_length": round(avg_sentence_length, 1),
                "grammar_issues": grammar_issues,
                "basic_score": score,
                "length_rating": self._rate_length(char_count)
            }

        except Exception as e:
            logger.error(f"기본 텍스트 분석 오류: {e}")
            return {"basic_score": 0, "error": str(e)}

    def _detect_grammar_issues(self, content: str) -> List[str]:
        """간단한 맞춤법/문법 오류 감지"""
        issues = []

        # 흔한 오류 패턴
        common_errors = [
            (r'되요', '돼요'),
            (r'됬', '됐'),
            (r'않됐', '않았'),
            (r'갔어요', '갔어요 (정확함)'),
            (r'웬지', '왠지'),
            (r'어떻해', '어떻게'),
            (r'어떡해', '어떻게')
        ]

        for pattern, correction in common_errors:
            if re.search(pattern, content):
                issues.append(f"'{pattern}' → '{correction}' 확인 필요")

        return issues[:5]  # 최대 5개만

    def _rate_length(self, char_count: int) -> str:
        """글자 수 평가"""
        if char_count >= 3000:
            return "매우 상세함"
        elif char_count >= 1500:
            return "상세함"
        elif char_count >= 1000:
            return "보통"
        elif char_count >= 500:
            return "짧음"
        else:
            return "매우 짧음"

    def _ai_deep_analysis(self, content: str, title: str) -> Dict[str, Any]:
        """AI 기반 심층 분석 (Claude API 사용)"""
        try:
            # Claude에게 분석 요청
            prompt = f"""다음 블로그 포스트의 품질을 분석해주세요.

제목: {title}

본문:
{content[:3000]}  # 처음 3000자만 분석

다음 항목을 JSON 형식으로 분석해주세요:
1. 문법 정확성 (0-100점)
2. 독창성 (0-100점) - 일반적인 내용인지, 독특한 인사이트가 있는지
3. 경험 정보 포함 여부 (true/false) - 직접 경험한 내용이 있는지
4. 신뢰성 (0-100점) - 출처 명시, 구체적 데이터 포함 여부
5. 가독성 (0-100점) - 문장 구조, 단락 구성
6. 감정/톤 (긍정적/중립적/부정적)
7. 주요 개선 제안 (3가지)

JSON 형식으로만 답변하세요."""

            message = self.client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=1024,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )

            # 응답 파싱
            response_text = message.content[0].text

            # JSON 파싱 시도
            import json
            analysis = json.loads(response_text)

            return {
                "grammar_score": analysis.get("문법 정확성", 70),
                "originality_score": analysis.get("독창성", 50),
                "has_experience": analysis.get("경험 정보 포함 여부", False),
                "credibility_score": analysis.get("신뢰성", 60),
                "readability_score": analysis.get("가독성", 70),
                "tone": analysis.get("감정/톤", "중립적"),
                "ai_suggestions": analysis.get("주요 개선 제안", []),
                "ai_enabled": True
            }

        except Exception as e:
            logger.error(f"AI 심층 분석 오류: {e}")
            # AI 실패 시 규칙 기반으로 대체
            return self._rule_based_analysis(content, title)

    def _rule_based_analysis(self, content: str, title: str) -> Dict[str, Any]:
        """규칙 기반 분석 (AI 없이)"""
        try:
            # 경험 관련 키워드
            experience_keywords = ['직접', '체험', '경험', '후기', '리뷰', '방문', '다녀왔', '먹어봤', '써봤']
            has_experience = any(keyword in content for keyword in experience_keywords)

            # 신뢰성 관련 (출처, 데이터)
            credibility_keywords = ['출처', '자료', '통계', '연구', '조사', '보고서']
            has_credibility = any(keyword in content for keyword in credibility_keywords)

            # 독창성 (긴 문단, 구체적 설명)
            paragraphs = content.split('\n\n')
            long_paragraphs = [p for p in paragraphs if len(p) > 300]
            originality_score = min(len(long_paragraphs) * 20, 80)

            # 문법 점수 (기본 70점, 오류 발견 시 감점)
            grammar_issues = self._detect_grammar_issues(content)
            grammar_score = max(70 - len(grammar_issues) * 5, 40)

            # 가독성 (문단 수, 문장 길이)
            paragraph_count = len([p for p in paragraphs if p.strip()])
            readability_score = min(paragraph_count * 10 + 40, 85)

            return {
                "grammar_score": grammar_score,
                "originality_score": originality_score,
                "has_experience": has_experience,
                "credibility_score": 70 if has_credibility else 50,
                "readability_score": readability_score,
                "tone": "중립적",
                "ai_suggestions": [
                    "직접 경험한 내용을 더 추가하세요" if not has_experience else "경험 정보가 풍부합니다",
                    "출처를 명시하면 신뢰성이 높아집니다" if not has_credibility else "출처가 명확합니다",
                    "더 구체적인 설명을 추가하세요" if originality_score < 60 else "독창적인 내용입니다"
                ],
                "ai_enabled": False
            }

        except Exception as e:
            logger.error(f"규칙 기반 분석 오류: {e}")
            return {
                "grammar_score": 50,
                "originality_score": 50,
                "has_experience": False,
                "credibility_score": 50,
                "readability_score": 50,
                "tone": "중립적",
                "ai_suggestions": [],
                "ai_enabled": False
            }

    def _calculate_total_quality_score(self, basic: Dict, ai: Dict) -> int:
        """총 품질 점수 계산"""
        try:
            # 기본 분석 50%
            basic_score = basic.get('basic_score', 0)

            # AI 분석 50%
            ai_score = (
                ai.get('grammar_score', 50) * 0.2 +
                ai.get('originality_score', 50) * 0.3 +
                (100 if ai.get('has_experience') else 30) * 0.2 +
                ai.get('credibility_score', 50) * 0.15 +
                ai.get('readability_score', 50) * 0.15
            )

            total = int((basic_score + ai_score) / 2)
            return min(total, 100)

        except Exception as e:
            logger.error(f"점수 계산 오류: {e}")
            return 50

    def _generate_recommendations(self, basic: Dict, ai: Dict) -> List[Dict[str, str]]:
        """개선 권장사항 생성"""
        recommendations = []

        # 글자 수 권장
        char_count = basic.get('char_count', 0)
        if char_count < 1500:
            recommendations.append({
                "category": "length",
                "message": f"현재 {char_count}자입니다. 1500자 이상으로 늘리세요.",
                "priority": "high"
            })

        # 경험 정보
        if not ai.get('has_experience'):
            recommendations.append({
                "category": "experience",
                "message": "직접 경험한 내용을 추가하면 신뢰도가 높아집니다.",
                "priority": "high"
            })

        # 독창성
        if ai.get('originality_score', 50) < 60:
            recommendations.append({
                "category": "originality",
                "message": "다른 블로그와 차별화된 독창적인 정보를 추가하세요.",
                "priority": "medium"
            })

        # AI 제안 추가
        for suggestion in ai.get('ai_suggestions', [])[:2]:
            recommendations.append({
                "category": "ai_suggestion",
                "message": suggestion,
                "priority": "medium"
            })

        return recommendations[:5]  # 최대 5개

    def _get_error_result(self, error_msg: str) -> Dict[str, Any]:
        """오류 결과 반환"""
        return {
            "error": True,
            "message": error_msg,
            "quality_score": 0,
            "basic_analysis": {"basic_score": 0},
            "ai_analysis": {"ai_enabled": False},
            "recommendations": []
        }

    def analyze_multiple_posts(self, posts: List[Dict[str, str]], max_posts: int = 5) -> Dict[str, Any]:
        """
        여러 포스트 일괄 분석

        Args:
            posts: [{"title": "...", "content": "..."}] 형식의 포스트 리스트
            max_posts: 최대 분석 개수

        Returns:
            전체 분석 결과 및 평균 점수
        """
        try:
            results = []
            total_score = 0

            for i, post in enumerate(posts[:max_posts]):
                title = post.get('title', '')
                content = post.get('content', '')

                logger.info(f"[일괄 분석] {i+1}/{min(len(posts), max_posts)}: {title[:30]}")

                analysis = self.analyze_content_quality(content, title)
                results.append(analysis)
                total_score += analysis.get('quality_score', 0)

            avg_score = total_score / len(results) if results else 0

            return {
                "analyzed_posts": len(results),
                "average_quality_score": round(avg_score, 1),
                "results": results,
                "overall_rating": self._rate_overall_quality(avg_score)
            }

        except Exception as e:
            logger.error(f"[일괄 분석] 오류: {e}")
            return {"error": str(e), "analyzed_posts": 0, "average_quality_score": 0}

    def _rate_overall_quality(self, score: float) -> str:
        """전체 품질 등급"""
        if score >= 80:
            return "매우 우수"
        elif score >= 70:
            return "우수"
        elif score >= 60:
            return "양호"
        elif score >= 50:
            return "보통"
        else:
            return "개선 필요"


def get_ai_content_analyzer(api_key: Optional[str] = None) -> AIContentAnalyzer:
    """AI 콘텐츠 분석기 인스턴스 반환"""
    return AIContentAnalyzer(api_key=api_key)
