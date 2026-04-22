"""
온라인 언급 스캐너
네이버 검색 API(블로그/카페/지식iN/뉴스/웹)를 통해 업체 관련 모든 언급을
자동 수집하고 긍정/중립/부정으로 감성 분류
"""
import httpx
import asyncio
import os
import re
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

# ===== 감성 분석 키워드 사전 =====

POSITIVE_KEYWORDS = [
    "맛있", "친절", "추천", "최고", "만족", "좋았", "깨끗", "감사",
    "재방문", "또올", "굿", "대박", "맛집", "분위기좋", "신선",
    "가성비", "훌륭", "정성", "넉넉", "빠르", "따뜻", "감동",
    "존맛", "혜자", "인생맛집", "강추", "사랑", "완벽", "극찬",
]

NEGATIVE_KEYWORDS_SEVERE = [
    "사기", "고소", "신고", "먹튀", "식중독", "바퀴벌레", "위생불량",
    "폭행", "협박", "경찰", "고발", "피해자", "범죄", "소송",
]

NEGATIVE_KEYWORDS_MODERATE = [
    "불친절", "최악", "환불", "비추", "쓰레기", "화남", "짜증",
    "불만", "엉망", "불쾌", "무례", "무시", "바가지", "후회",
    "더러", "비위생", "돈아까", "안갈", "다시안",
]

NEGATIVE_KEYWORDS_MILD = [
    "별로", "아쉬움", "실망", "그저그럼", "기대이하",
    "아쉽", "애매", "미흡", "부족", "냉동",
]

ALL_NEGATIVE_KEYWORDS = NEGATIVE_KEYWORDS_SEVERE + NEGATIVE_KEYWORDS_MODERATE + NEGATIVE_KEYWORDS_MILD

# 검색 쿼리에 사용할 키워드 (긍정/부정/일반 후기)
SCAN_TERMS_NEGATIVE = ["불친절", "최악", "환불", "비추", "사기", "실망", "불만"]
SCAN_TERMS_POSITIVE = ["맛있", "추천", "최고", "친절", "만족"]
SCAN_TERMS_GENERAL = ["후기", "리뷰", "방문", "솔직"]

# 네이버 검색 API 소스 타입 매핑
SOURCE_TYPES = {
    "blog": {"endpoint": "blog.json", "label": "블로그"},
    "cafe": {"endpoint": "cafearticle.json", "label": "카페"},
    "kin": {"endpoint": "kin.json", "label": "지식iN"},
    "news": {"endpoint": "news.json", "label": "뉴스"},
    "web": {"endpoint": "webkr.json", "label": "웹"},
}


class MentionScanner:
    """온라인 언급 스캐너 (긍정/중립/부정 전체 감성 분류)"""

    def __init__(self):
        self.base_url = "https://openapi.naver.com/v1/search"
        self.timeout = httpx.Timeout(15.0, connect=10.0)

    def _get_credentials(self) -> tuple:
        from config import settings as app_settings
        client_id = os.environ.get('NAVER_CLIENT_ID', '') or app_settings.NAVER_CLIENT_ID
        client_secret = os.environ.get('NAVER_CLIENT_SECRET', '') or app_settings.NAVER_CLIENT_SECRET
        return client_id, client_secret

    def _build_queries(self, business_name: str, keywords: List[str] = None) -> List[str]:
        """업체명 + 다양한 키워드 조합 쿼리 생성 (긍정/부정/일반)"""
        if keywords:
            queries = [f'"{business_name}" {kw}' for kw in keywords[:10]]
            return queries

        queries = []
        # 부정 검색어
        for term in SCAN_TERMS_NEGATIVE[:5]:
            queries.append(f'"{business_name}" {term}')
        # 긍정 검색어
        for term in SCAN_TERMS_POSITIVE[:4]:
            queries.append(f'"{business_name}" {term}')
        # 일반 후기
        for term in SCAN_TERMS_GENERAL[:3]:
            queries.append(f'"{business_name}" {term}')
        return queries

    def _clean_html(self, text: str) -> str:
        if not text:
            return ""
        return re.sub(r'</?b>', '', re.sub(r'<[^>]+>', '', text)).strip()

    def _analyze_sentiment(self, title: str, snippet: str) -> Dict:
        """
        제목+스니펫 감성 분석
        Returns: {sentiment, sentiment_score, severity_score, severity_level, matched_keywords}
        """
        text = f"{title} {snippet}"

        # 키워드 매칭
        pos_matched = [kw for kw in POSITIVE_KEYWORDS if kw in text]
        neg_severe = [kw for kw in NEGATIVE_KEYWORDS_SEVERE if kw in text]
        neg_moderate = [kw for kw in NEGATIVE_KEYWORDS_MODERATE if kw in text]
        neg_mild = [kw for kw in NEGATIVE_KEYWORDS_MILD if kw in text]

        neg_matched = neg_severe + neg_moderate + neg_mild
        all_matched = pos_matched + neg_matched

        # 가중 점수 계산
        pos_score = len(pos_matched) * 2
        neg_score = len(neg_severe) * 3 + len(neg_moderate) * 2 + len(neg_mild) * 1

        # 감성 판정
        if neg_score > pos_score and neg_score > 0:
            sentiment = "negative"
        elif pos_score > neg_score and pos_score > 0:
            sentiment = "positive"
        else:
            sentiment = "neutral"

        # sentiment_score: -10(매우 부정) ~ +10(매우 긍정)
        raw = pos_score - neg_score
        sentiment_score = max(-10, min(10, raw))

        # severity (부정일 때만 의미 있음)
        severity_raw = min(neg_score, 10)
        if severity_raw >= 7:
            severity_level = "high"
        elif severity_raw >= 4:
            severity_level = "medium"
        elif severity_raw >= 1:
            severity_level = "low"
        else:
            severity_level = "none"

        return {
            "sentiment": sentiment,
            "sentiment_score": sentiment_score,
            "severity_score": severity_raw,
            "severity_level": severity_level,
            "matched_keywords": all_matched,
        }

    def _is_duplicate(self, new_item: dict, existing: List[dict]) -> bool:
        """URL 기반 + 제목 유사도 기반 중복 제거"""
        new_url = new_item.get("url", "")
        new_title = new_item.get("title", "")

        for item in existing:
            if item.get("url") == new_url and new_url:
                return True
            existing_title = item.get("title", "")
            if new_title and existing_title:
                shorter = min(len(new_title), len(existing_title))
                if shorter > 5:
                    common = sum(1 for a, b in zip(new_title, existing_title) if a == b)
                    if common / shorter > 0.8:
                        return True
        return False

    async def _search_source(self, source_type: str, query: str,
                              client_id: str, client_secret: str,
                              display: int = 10, start: int = 1) -> List[dict]:
        """단일 소스에서 네이버 검색 API 호출"""
        source_config = SOURCE_TYPES.get(source_type)
        if not source_config:
            return []

        endpoint = source_config["endpoint"]
        url = f"{self.base_url}/{endpoint}"
        headers = {
            "X-Naver-Client-Id": client_id,
            "X-Naver-Client-Secret": client_secret,
            "Accept": "application/json",
        }
        params = {
            "query": query,
            "display": display,
            "start": start,
            "sort": "date",
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, headers=headers, params=params)
                if resp.status_code != 200:
                    logger.warning(f"Naver search API error: {resp.status_code} for {source_type}/{query}")
                    return []

                data = resp.json()
                items = data.get("items", [])
                results = []
                for item in items:
                    title = self._clean_html(item.get("title", ""))
                    description = self._clean_html(item.get("description", ""))
                    link = item.get("link", "") or item.get("originallink", "")
                    postdate = item.get("postdate", "")
                    if postdate and len(postdate) == 8:
                        postdate = f"{postdate[:4]}-{postdate[4:6]}-{postdate[6:8]}"
                    author = item.get("bloggername", "") or item.get("cafename", "") or ""

                    results.append({
                        "source_type": source_type,
                        "title": title,
                        "snippet": description,
                        "url": link,
                        "author_name": author,
                        "published_date": postdate,
                    })
                return results
        except Exception as e:
            logger.error(f"Search API error for {source_type}: {e}")
            return []

    async def scan_mentions(self, business_name: str, store_id: str,
                             keywords: List[str] = None) -> List[dict]:
        """
        5개 소스에서 업체 관련 모든 언급 수집 → 감성 분석 → 중복 제거
        긍정/중립/부정 전부 반환
        """
        client_id, client_secret = self._get_credentials()
        if not client_id or not client_secret:
            logger.warning("Naver API credentials not configured")
            return []

        queries = self._build_queries(business_name, keywords)
        all_mentions: List[dict] = []

        for source_type in SOURCE_TYPES:
            source_results = []
            for query in queries:
                results = await self._search_source(
                    source_type, query, client_id, client_secret,
                    display=10, start=1
                )
                source_results.extend(results)
                await asyncio.sleep(0.15)

            # 소스 내 중복 제거
            deduped = []
            for item in source_results:
                if not self._is_duplicate(item, deduped):
                    deduped.append(item)

            all_mentions.extend(deduped)
            await asyncio.sleep(0.5)

        # 전체 중복 제거 + 감성 분석
        final_results = []
        for item in all_mentions:
            if self._is_duplicate(item, final_results):
                continue

            analysis = self._analyze_sentiment(item["title"], item["snippet"])
            item.update({
                "sentiment": analysis["sentiment"],
                "sentiment_score": analysis["sentiment_score"],
                "severity_score": analysis["severity_score"],
                "severity_level": analysis["severity_level"],
                "matched_keywords": analysis["matched_keywords"],
                "store_id": store_id,
            })
            final_results.append(item)

        # 정렬: 부정(심각도 높은 순) → 중립 → 긍정
        sentiment_order = {"negative": 0, "neutral": 1, "positive": 2}
        final_results.sort(key=lambda x: (
            sentiment_order.get(x["sentiment"], 1),
            -x["severity_score"],
        ))
        return final_results
