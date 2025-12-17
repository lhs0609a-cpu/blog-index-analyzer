"""
키워드 추출기
포스팅 제목에서 검색에 사용할 키워드를 자동 추출
"""
import re
from typing import List
import logging

logger = logging.getLogger(__name__)


class KeywordExtractor:
    """포스팅 제목에서 키워드 추출"""

    # 중지 단어 (키워드로 사용하지 않을 단어들)
    STOP_WORDS = {
        # 부사
        '아직도', '매일', '언제나', '항상', '계속', '정말', '꼭', '반드시',
        '드디어', '이제', '오늘', '바로', '지금', '최근', '요즘',

        # 동사 어미
        '하시나요', '하세요', '하시면', '하면', '됩니다', '합니다',
        '했어요', '해요', '하나요', '할까요', '해볼까요', '해봤어요',
        '알아보세요', '알아봐요', '알아볼까요', '확인하세요',

        # 형용사/부사
        '좋은', '좋아요', '최고의', '완벽한', '특별한', '중요한',
        '어렵게', '쉽게', '빠르게', '간단하게', '효과적으로',

        # 불필요한 명사
        '핵심', '이유', '비법', '특징', '중요성', '꿀팁', '팁',
        '방법', '노하우', '비결', '포인트', '가이드', '안내',
        '후기', '리뷰', '추천', '정보', '소개', '설명',

        # 플레이스홀더
        'OO', 'oo', 'XX', 'xx', '이것', '그것', '저것',
        '○○', '××', '□□',

        # 숫자 관련
        '1위', '2위', '3위', '베스트', 'TOP', 'top', 'BEST', 'best',

        # 기타
        '모든', '나만의', '나의', '우리', '당신의', '여러분',
    }

    # 조사 목록 (제거할 조사)
    JOSA_LIST = [
        '의', '은', '는', '를', '을', '에', '이', '가', '와', '과', '도', '만',
        '으로', '로', '에서', '부터', '까지', '인', '이다', '입니다',
        '이란', '란', '이라는', '라는', '에게', '께', '한테',
        '처럼', '같이', '마저', '조차', '뿐', '밖에',
    ]

    # 구분자 패턴
    DELIMITER_PATTERN = re.compile(r'[,!?~|/·•\-–—\[\](){}「」『』【】\s]+')

    # 인용부호 패턴
    QUOTE_PATTERN = re.compile(r'["\'"\'\"\"\'\'「」『』【】\[\]]+')

    def __init__(self):
        # 조사 제거용 정규식 (긴 것부터 매칭)
        sorted_josa = sorted(self.JOSA_LIST, key=len, reverse=True)
        self.josa_pattern = re.compile(r'(' + '|'.join(sorted_josa) + r')$')

    def extract(self, title: str) -> List[str]:
        """
        제목에서 키워드 추출 (최대 2개)

        알고리즘:
        1. 인용부호 내용 제거
        2. 구분자로 분리
        3. 중지 단어 만날 때까지 수집
        4. 조사 제거
        5. 키워드 조합 생성
        """
        if not title or not title.strip():
            return []

        # 1. 인용부호 내용 제거
        cleaned_title = self._remove_quotes(title)

        # 2. 구분자로 분리하여 첫 번째 세그먼트 사용
        segments = self.DELIMITER_PATTERN.split(cleaned_title)
        first_segment = segments[0].strip() if segments else cleaned_title

        # 3. 공백으로 단어 분리
        words = first_segment.split()

        # 4. 중지 단어 만날 때까지 수집
        collected_words = []
        for word in words:
            clean_word = word.strip()

            # 중지 단어 체크
            if self._is_stop_word(clean_word):
                break

            # 조사 제거
            clean_word = self._remove_josa(clean_word)

            # 유효한 단어만 추가
            if clean_word and len(clean_word) >= 2:
                collected_words.append(clean_word)

        # 5. 키워드 조합 생성
        keywords = self._create_keyword_combinations(collected_words)

        logger.debug(f"Title: '{title}' -> Keywords: {keywords}")

        return keywords

    def _remove_quotes(self, text: str) -> str:
        """인용부호와 그 안의 내용 제거"""
        # 대괄호, 괄호 안 내용 제거
        result = re.sub(r'\[.*?\]', '', text)
        result = re.sub(r'\(.*?\)', '', result)
        result = re.sub(r'「.*?」', '', result)
        result = re.sub(r'『.*?』', '', result)
        result = re.sub(r'【.*?】', '', result)

        # 따옴표 제거
        result = self.QUOTE_PATTERN.sub('', result)

        return result.strip()

    def _is_stop_word(self, word: str) -> bool:
        """중지 단어 여부 확인"""
        # 정확히 매칭
        if word in self.STOP_WORDS:
            return True

        # 부분 매칭 (끝부분)
        for stop in self.STOP_WORDS:
            if word.endswith(stop):
                return True

        return False

    def _remove_josa(self, word: str) -> str:
        """단어 끝의 조사 제거"""
        # 반복적으로 조사 제거 (조사가 중첩될 수 있음)
        prev_word = None
        while prev_word != word:
            prev_word = word
            word = self.josa_pattern.sub('', word)
        return word

    def _create_keyword_combinations(self, words: List[str]) -> List[str]:
        """
        단어들로 키워드 조합 생성

        규칙:
        - 1개: 그대로 사용
        - 2개: 첫 단어(4자 이상일 때만), 첫+둘째 조합
        - 3개 이상: 첫 단어(6자 이상), 첫+둘째, 첫+둘째+셋째(10자 이하)
        """
        if not words:
            return []

        keywords = []

        if len(words) == 1:
            # 1개 단어
            if len(words[0]) >= 2:
                keywords.append(words[0])

        elif len(words) == 2:
            # 2개 단어
            # 첫 단어가 4자 이상이면 단독으로도 추가
            if len(words[0]) >= 4:
                keywords.append(words[0])

            # 두 단어 조합
            combined = ''.join(words[:2])
            if combined not in keywords:
                keywords.append(combined)

        else:
            # 3개 이상 단어
            # 첫 단어가 6자 이상이면 단독 추가
            if len(words[0]) >= 6:
                keywords.append(words[0])

            # 첫+둘째 조합
            two_words = ''.join(words[:2])
            if len(two_words) <= 15:
                keywords.append(two_words)

            # 첫+둘째+셋째 조합 (10자 이하일 때만)
            three_words = ''.join(words[:3])
            if len(three_words) <= 10 and three_words not in keywords:
                keywords.append(three_words)

        # 최대 2개만 반환
        return keywords[:2]

    def extract_multiple(self, titles: List[str]) -> List[List[str]]:
        """여러 제목에서 키워드 추출"""
        return [self.extract(title) for title in titles]


# 편의 함수
def extract_keywords(title: str) -> List[str]:
    """단일 제목에서 키워드 추출"""
    extractor = KeywordExtractor()
    return extractor.extract(title)
