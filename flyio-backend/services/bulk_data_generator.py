"""
대량 커뮤니티 데이터 생성 시스템 (하이브리드)
- 템플릿 기반 변형: 대량 생성 (비용 0)
- AI 생성: 고품질 핵심 콘텐츠
- 자연스러운 시간/카테고리 분포
- 페르소나 기반 글쓰기 스타일
"""
import random
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import os

logger = logging.getLogger(__name__)


# ============ 상수 & 설정 ============

class Category(Enum):
    FREE = "free"
    TIP = "tip"
    QUESTION = "question"
    SUCCESS = "success"


class PersonaType(Enum):
    BEGINNER = "beginner"      # 초보 블로거
    INTERMEDIATE = "intermediate"  # 중급 블로거
    EXPERT = "expert"          # 고수 블로거
    SIDEJOB = "sidejob"        # 부업 블로거
    PARENTING = "parenting"    # 육아 블로거


@dataclass
class Persona:
    type: PersonaType
    level: str
    level_name: str
    style_keywords: List[str]
    emoji_frequency: float  # 0.0 ~ 1.0
    avg_content_length: Tuple[int, int]  # (min, max)
    preferred_categories: List[str]
    name_patterns: List[str]


# 페르소나 정의
PERSONAS = {
    PersonaType.BEGINNER: Persona(
        type=PersonaType.BEGINNER,
        level="Bronze",
        level_name="초보 블로거",
        style_keywords=["처음", "어떻게", "도움", "감사", "궁금", "모르겠어요", "알려주세요", "질문"],
        emoji_frequency=0.3,
        avg_content_length=(200, 500),
        preferred_categories=["question", "free"],
        name_patterns=["초보{name}", "{name}시작", "블린이{num}", "뉴비{name}"]
    ),
    PersonaType.INTERMEDIATE: Persona(
        type=PersonaType.INTERMEDIATE,
        level="Silver",
        level_name="중급 블로거",
        style_keywords=["제 경험상", "이렇게 하면", "추천", "팁", "공유", "도움이 됐으면"],
        emoji_frequency=0.5,
        avg_content_length=(500, 1200),
        preferred_categories=["tip", "free", "success"],
        name_patterns=["{name}블로그", "일상{name}", "{name}의하루", "{name}기록"]
    ),
    PersonaType.EXPERT: Persona(
        type=PersonaType.EXPERT,
        level="Gold",
        level_name="고수 블로거",
        style_keywords=["C-Rank", "D.I.A", "최적화", "전략", "데이터", "분석", "알고리즘"],
        emoji_frequency=0.2,
        avg_content_length=(800, 2000),
        preferred_categories=["tip", "success"],
        name_patterns=["마케터{name}", "블로그마스터", "{name}프로", "블로그연구소"]
    ),
    PersonaType.SIDEJOB: Persona(
        type=PersonaType.SIDEJOB,
        level="Silver",
        level_name="부업 블로거",
        style_keywords=["수익", "애드센스", "체험단", "원고료", "부업", "투잡", "수익화"],
        emoji_frequency=0.4,
        avg_content_length=(400, 1000),
        preferred_categories=["tip", "question", "success"],
        name_patterns=["N잡러{name}", "부업{name}", "{name}투잡", "수익{name}"]
    ),
    PersonaType.PARENTING: Persona(
        type=PersonaType.PARENTING,
        level="Bronze",
        level_name="육아 블로거",
        style_keywords=["아이", "육아", "틈새", "시간", "워킹맘", "주부", "낮잠시간"],
        emoji_frequency=0.6,
        avg_content_length=(300, 800),
        preferred_categories=["free", "question", "tip"],
        name_patterns=["두아이맘{name}", "육아중{name}", "{name}맘", "워킹맘{name}"]
    ),
}


# 카테고리별 비율 (합계 100)
CATEGORY_DISTRIBUTION = {
    "free": 35,
    "tip": 30,
    "question": 20,
    "success": 15,
}


# 시간대별 가중치 (자연스러운 활동 패턴)
TIME_WEIGHTS = {
    # 시간대: (평일 가중치, 주말 가중치)
    0: (0.5, 1.0),   # 자정
    1: (0.3, 0.8),
    2: (0.2, 0.5),
    3: (0.1, 0.3),
    4: (0.1, 0.2),
    5: (0.2, 0.2),
    6: (0.5, 0.3),
    7: (1.0, 0.5),
    8: (1.5, 0.8),
    9: (2.0, 1.5),
    10: (2.5, 2.0),  # 오전 피크
    11: (2.5, 2.5),
    12: (2.0, 2.5),  # 점심
    13: (2.0, 2.5),
    14: (2.5, 2.5),
    15: (2.5, 2.0),
    16: (2.5, 2.0),
    17: (2.0, 2.0),
    18: (2.0, 2.0),
    19: (2.5, 2.5),
    20: (3.0, 3.0),  # 저녁 피크
    21: (3.5, 3.5),  # 최고 피크
    22: (3.0, 3.0),
    23: (2.0, 2.0),
}


# ============ 확장 템플릿 시스템 ============

# 변수 치환용 데이터
TEMPLATE_VARIABLES = {
    "keyword": [
        "강남 맛집", "서울 카페", "부산 여행", "제주도 숙소", "인테리어 팁",
        "다이어트 식단", "운동 루틴", "독서 추천", "영화 리뷰", "맛집 추천",
        "육아 팁", "요리 레시피", "패션 코디", "뷰티 제품", "가전 리뷰",
        "자기계발", "재테크", "주식 투자", "부동산", "창업 정보",
        "IT 기기", "노트북 추천", "스마트폰", "이어폰 리뷰", "카메라",
        "반려동물", "강아지 용품", "고양이 사료", "식물 키우기", "캠핑 장비",
    ],
    "rank": ["1위", "2위", "3위", "5위", "7위", "10위 권"],
    "days": ["2주", "3주", "한 달", "두 달", "세 달", "반년"],
    "post_count": ["10개", "20개", "30개", "50개", "100개"],
    "neighbor_count": ["50명", "100명", "200명", "500명", "1000명"],
    "score": ["25점", "35점", "45점", "55점", "65점", "75점"],
    "level": ["Lv.3", "Lv.4", "Lv.5", "Lv.6", "Lv.7", "Lv.8", "Lv.9"],
    "time_spent": ["1시간", "2시간", "3시간", "30분", "1시간 반"],
    "emotion": ["너무 기뻐요", "뿌듯해요", "신나요", "행복해요", "감격이에요"],
    "struggle": ["포기하고 싶었는데", "힘들었는데", "막막했는데", "고민 많았는데"],
}

# 확장된 게시글 템플릿 (변수 치환 가능)
EXTENDED_POST_TEMPLATES = {
    "tip": [
        {
            "title": "'{keyword}' 상위노출 성공 방법 공유!",
            "content": """안녕하세요! 드디어 '{keyword}' 키워드로 상위노출 성공했어요!

{struggle} 드디어 됐네요 {emotion}!

**제가 한 방법 공유할게요:**

1. **키워드 분석 철저히**
   - 블랭크에서 경쟁 분석 먼저
   - 상위 블로그 지수 확인 후 도전

2. **글 퀄리티에 신경**
   - 사진 최소 10장 이상
   - 글 분량 2000자 이상
   - 진짜 정보 담기

3. **꾸준함이 핵심**
   - {days} 동안 포스팅 {post_count}
   - 매일 조금씩이라도!

궁금한 점 있으시면 댓글 남겨주세요~""",
            "tags": ["상위노출", "블로그팁", "키워드분석"]
        },
        {
            "title": "C-Rank 올리는 현실적인 방법 (직접 해봄)",
            "content": """C-Rank가 안 올라서 고민이신 분들 많으시죠?

저도 {days} 동안 정체였는데 최근에 확 올랐어요!

**효과 있었던 방법:**

1. **이웃 관리**
   - 서이추 적극적으로 ({neighbor_count} 목표)
   - 진짜 소통하는 이웃 늘리기

2. **댓글 활동**
   - 하루 10개 이상 진심 댓글
   - 내 글에 달린 댓글 꼭 답글

3. **포스팅 주기**
   - 일주일에 최소 3개
   - 주제 일관성 유지

4. **블랭크로 체크**
   - 매주 분석해서 부족한 점 확인
   - {score}에서 시작해서 지금 많이 올랐어요

한 달 정도 하니까 효과 보이더라구요!
다들 화이팅 💪""",
            "tags": ["C-Rank", "블로그성장", "이웃관리"]
        },
        {
            "title": "블로그 글쓰기 시간 단축하는 팁",
            "content": """글 하나 쓰는데 {time_spent} 넘게 걸리시는 분들!

저도 처음엔 그랬는데 지금은 {time_spent} 안에 끝나요.

**시간 단축 팁:**

1. **글감 미리 모아두기**
   - 네이버 킵에 사진/메모 저장
   - 나중에 모아서 글쓰기

2. **템플릿 만들어두기**
   - 자주 쓰는 형식 저장
   - 복붙 후 수정만

3. **한 번에 몰아쓰기**
   - 주말에 3-4개 미리 작성
   - 예약 발행 활용

4. **완벽 포기하기**
   - 80% 완성되면 발행
   - 나중에 수정하면 됨

처음엔 힘들어도 습관 되면 금방이에요!""",
            "tags": ["글쓰기팁", "시간관리", "효율적블로깅"]
        },
        {
            "title": "블랭크 활용 꿀팁 정리",
            "content": """블랭크 쓰시는 분들! 제가 발견한 꿀팁 공유해요.

**1. 키워드 분석 활용법**
- 메인 키워드 검색 후 상위 10개 지수 확인
- 내 지수보다 낮은 키워드부터 공략
- 연관 키워드도 함께 체크

**2. 내 블로그 분석**
- 매주 같은 요일에 체크 (변화 추이 파악)
- C-Rank, D.I.A 점수 기록해두기
- 어떤 활동 했을 때 올랐는지 분석

**3. 경쟁사 분석**
- 비슷한 주제 블로그 분석
- 어떤 점이 다른지 파악
- 벤치마킹 포인트 찾기

이것만 해도 상위노출 확률 훨씬 올라가요!""",
            "tags": ["블랭크", "분석도구", "키워드분석"]
        },
    ],
    "question": [
        {
            "title": "블로그 지수 {score} 이면 어느 정도인가요?",
            "content": """블로그 시작한 지 {days} 됐는데요.

블랭크로 분석해보니까
- 총점: {score}
- 레벨: {level}

이 정도면 어느 정도 수준인가요?
아직 상위노출은 한 번도 못 해봤어요 ㅠㅠ

비슷한 수준이셨던 분들 조언 부탁드립니다!""",
            "tags": ["지수질문", "블로그분석", "초보"]
        },
        {
            "title": "하루에 포스팅 몇 개가 적당할까요?",
            "content": """요즘 블로그 열심히 하려고 하는데
하루에 몇 개 정도 올리는 게 좋을까요?

현재 {days} 동안 {post_count} 정도 올렸는데
더 늘려야 할지 고민이에요.

너무 많이 올리면 저품질 걸린다는 말도 있고
꾸준히 매일 올려야 한다는 말도 있고...

고수님들은 어떻게 하시나요?""",
            "tags": ["포스팅빈도", "저품질", "질문"]
        },
        {
            "title": "이웃 {neighbor_count}인데 상위노출 가능할까요?",
            "content": """블로그 이웃이 {neighbor_count}밖에 안 되는데
상위노출 할 수 있을까요?

C-Rank가 이웃 수랑 관련 있다고 해서 걱정이에요.
지수는 {score} 정도예요.

이웃 적어도 상위노출 성공하신 분 계신가요?
어떻게 하셨는지 궁금합니다!""",
            "tags": ["이웃수", "상위노출", "질문"]
        },
        {
            "title": "'{keyword}' 키워드 경쟁 심한가요?",
            "content": """'{keyword}' 관련 글을 쓰려고 하는데
이 키워드 경쟁이 심한 편인가요?

블랭크로 분석해보니까 상위 블로그들 지수가 꽤 높더라구요.
제 지수는 {score} 정도인데...

비슷한 키워드 쓰시는 분들 경험 공유해주시면 감사하겠습니다!""",
            "tags": ["키워드경쟁", "키워드분석", "질문"]
        },
        {
            "title": "상위노출 유지가 안 돼요 ㅠㅠ",
            "content": """며칠 전에 '{keyword}'로 {rank} 찍었는데
오늘 보니까 순위가 밀렸어요 ㅠㅠ

상위노출 유지하는 방법이 따로 있나요?

- 글 수정하면 안 좋다는 말도 있고
- 댓글 활동 해야 한다는 말도 있고

경험 있으신 분들 조언 부탁드려요!""",
            "tags": ["상위노출유지", "순위하락", "질문"]
        },
    ],
    "success": [
        {
            "title": "🎉 '{keyword}' {rank} 달성! 드디어 됐어요!",
            "content": """드디어!!!! 첫 상위노출 성공했어요!!!!

'{keyword}' 키워드로 {rank} 찍었습니다 ㅠㅠ

블로그 시작한 지 {days}만이에요.
{struggle} 드디어 되네요 {emotion}!

**제가 한 것들:**
- 블랭크로 키워드 분석
- 경쟁 낮은 키워드 선택
- 글 퀄리티에 집중
- 포스팅 {post_count} 작성

다들 포기하지 마세요!
저도 했으니까 여러분도 할 수 있어요! 💪""",
            "tags": ["상위노출성공", "첫상위노출", "성공후기"]
        },
        {
            "title": "{level} 달성! 성장 과정 공유합니다",
            "content": """오늘 드디어 {level} 달성했습니다!

{struggle} 꾸준히 하니까 되네요 {emotion}!

**성장 과정:**
- 시작: {score} (막막했음)
- {days} 후: 조금씩 감 잡음
- 현재: {level} 달성!

**핵심은 꾸준함이었어요:**
- 매일 1포스팅 목표
- 매주 블랭크로 지수 체크
- 부족한 점 계속 개선

다음 목표를 향해 달려봅니다!
다들 화이팅! 🔥""",
            "tags": ["레벨업", "블로그성장", "성공후기"]
        },
        {
            "title": "이웃 {neighbor_count} 달성 후기",
            "content": """드디어 이웃 {neighbor_count} 달성했어요!

블로그 시작한 지 {days} 됐는데
처음엔 이웃 늘리는 게 제일 힘들었거든요.

**제가 한 방법:**

1. **서이추 적극적으로**
   - 비슷한 주제 블로그 찾기
   - 진심 담은 댓글 먼저 달기

2. **소통에 집중**
   - 내 이웃 글에 댓글 달기
   - 답글도 꼭 달기

3. **꾸준한 포스팅**
   - 주 3회 이상
   - 유익한 정보 담기

이웃 늘어나니까 C-Rank도 같이 올라가더라구요!
다들 화이팅입니다 💪""",
            "tags": ["이웃늘리기", "서이추", "성공후기"]
        },
    ],
    "free": [
        {
            "title": "오늘도 블로그 화이팅!",
            "content": """오늘도 열심히 포스팅 했습니다!

날씨가 좋아서 기분도 좋네요 ☀️
카페에서 {time_spent} 동안 글 썼는데
집중 잘 되는 날이었어요.

요즘 '{keyword}' 관련 글을 열심히 쓰고 있는데
조금씩 반응이 오는 것 같아서 뿌듯해요.

다들 오늘 하루도 수고하셨어요!
내일도 화이팅! 💪""",
            "tags": ["일상", "블로그일기", "화이팅"]
        },
        {
            "title": "블로그 슬럼프 왔는데 어떡하죠",
            "content": """요즘 블로그 글 쓰기가 너무 힘들어요.

{days} 동안 {post_count} 썼는데
뭘 써야 할지도 모르겠고
쓰고 싶은 의욕도 안 나고...

상위노출도 안 되니까 더 의욕이 떨어지네요 ㅠㅠ

다들 슬럼프 올 때 어떻게 극복하시나요?
조언 좀 부탁드려요...""",
            "tags": ["슬럼프", "블로그고민", "자유"]
        },
        {
            "title": "블로그하면서 달라진 점",
            "content": """블로그 {days} 하면서 달라진 점들이 있어요.

**1. 기록하는 습관**
- 일상을 더 관찰하게 됨
- 사진 찍는 습관 생김

**2. 글쓰기 능력 향상**
- 처음엔 500자도 힘들었는데
- 지금은 2000자도 금방 씀

**3. 새로운 수입원**
- 아직 많진 않지만
- 체험단/원고료 들어오기 시작

블로그 시작하길 잘했다는 생각이 들어요!
다들 화이팅입니다 😊""",
            "tags": ["블로그효과", "성장", "자유"]
        },
        {
            "title": "주말에 밀린 포스팅 했어요",
            "content": """평일에 너무 바빠서 주말에 몰아서 글 썼네요.

'{keyword}' 관련으로 3개 작성!
예약 발행 걸어뒀어요 ㅎㅎ

요즘 이 주제로 열심히 쓰고 있는데
반응이 조금씩 오는 것 같아서 뿌듯해요.

다들 주말 잘 보내세요~""",
            "tags": ["주말", "예약발행", "일상"]
        },
        {
            "title": "오늘 첫 체험단 선정됐어요!",
            "content": """드디어 첫 체험단에 선정됐어요!

'{keyword}' 관련 체험단인데
블로그 시작한 지 {days} 만에 처음이에요.

지수가 {score} 정도인데도 되더라구요.
열심히 지원한 보람이 있네요 😊

앞으로 더 열심히 해야겠어요!
다들 화이팅! 💪""",
            "tags": ["체험단", "블로그수익", "첫체험단"]
        },
    ],
}

# 확장된 댓글 템플릿 (감정별 분류)
EXTENDED_COMMENT_TEMPLATES = {
    "empathy": [
        "저도 공감해요! 화이팅입니다 💪",
        "맞아요 저도 그랬어요",
        "저도 같은 고민이에요 ㅠㅠ",
        "진짜 공감 100%입니다",
        "저만 그런 게 아니었네요 ㅎㅎ",
        "완전 공감해요!",
        "저도요 ㅠㅠ 힘내요!",
        "맞아요 다들 비슷하네요",
        "와 제 이야기인 줄 알았어요",
        "저도 똑같은 상황이에요",
    ],
    "thanks": [
        "좋은 정보 감사합니다!",
        "오 이거 진짜 도움 되네요!",
        "꿀팁 감사해요!",
        "대박 유용한 정보예요!",
        "이런 정보 찾고 있었는데 감사합니다",
        "정리 잘 해주셔서 이해하기 쉬워요",
        "덕분에 많이 배웠어요!",
        "좋은 글 감사합니다 ☺️",
        "북마크 해둘게요! 감사해요",
        "나중에 참고할게요 감사합니다",
    ],
    "question": [
        "혹시 얼마나 걸리셨어요?",
        "어떤 키워드로 하셨어요?",
        "더 자세히 알 수 있을까요?",
        "저도 따라해볼게요!",
        "이 방법 효과 있나요?",
        "구체적인 팁 있으실까요?",
        "어떻게 시작하셨어요?",
        "혹시 주의할 점 있나요?",
        "초보도 할 수 있을까요?",
        "비용이 들까요?",
    ],
    "cheer": [
        "축하드려요!! 🎉",
        "와 대단하세요!",
        "멋져요! 저도 열심히 할게요",
        "부럽습니다 ㅠㅠ 저도 열심히 해야겠어요",
        "역시 꾸준함이 답이네요!",
        "진짜 대단해요!",
        "저도 저렇게 되고 싶어요!",
        "화이팅! 응원할게요!",
        "와 정말요? 대박!",
        "목표 달성 축하드려요!",
    ],
    "advice": [
        "저는 이렇게 했는데 효과 봤어요~",
        "비슷한 경험 있어서 공감되네요",
        "저도 블랭크 쓰는데 좋더라구요!",
        "맞아요 키워드 분석 진짜 중요해요",
        "포기하지 마세요! 분명 될 거예요",
        "저도 처음엔 그랬어요. 화이팅!",
        "꾸준히 하시면 분명 좋아질 거예요",
        "다들 처음엔 힘들어요. 같이 힘내요!",
        "저도 그때 막막했는데 지금은 많이 나아졌어요",
        "조급해하지 마세요~ 시간이 답이에요",
    ],
    "simple": [
        "오오 좋네요!",
        "ㅎㅎ 화이팅이요!",
        "굿굿!",
        "응원합니다!",
        "파이팅! 💪",
        "좋아요!",
        "ㅎㅎ 수고하셨어요",
        "대박!",
        "오 신기해요",
        "ㅋㅋ 재밌네요",
    ],
}


# ============ 이름 생성기 ============

BASE_NAMES = [
    "민지", "수현", "지유", "하은", "서연", "예린", "소민", "채원", "유나", "다현",
    "준호", "민석", "지훈", "현우", "성민", "재현", "도윤", "시우", "유준", "건우",
    "sunny", "luna", "mimi", "coco", "hana", "yuri", "nana", "jay", "dan", "leo",
    "진아", "수아", "예은", "지원", "서희", "연우", "하늘", "새봄", "봄이", "가을",
]

BLOGGER_NAME_PATTERNS = [
    "{name}",
    "{name}{num}",
    "{name}_blog",
    "{name}의하루",
    "일상{name}",
    "{name}기록",
    "오늘의{name}",
    "{name}로그",
    "{name}다이어리",
    "매일{name}",
    "행복한{name}",
    "{name}이야기",
    "{name}의일상",
    "소소한{name}",
    "{name}스토리",
]


def generate_blogger_name(persona: Optional[Persona] = None) -> str:
    """자연스러운 블로거 이름 생성"""
    base_name = random.choice(BASE_NAMES)
    num = random.randint(0, 99)

    if persona and random.random() < 0.3:
        pattern = random.choice(persona.name_patterns)
    else:
        pattern = random.choice(BLOGGER_NAME_PATTERNS)

    return pattern.format(name=base_name, num=num)


# ============ 시간 분포 생성기 ============

def generate_timestamp(days_ago_max: int = 180) -> datetime:
    """자연스러운 시간 분포로 타임스탬프 생성"""
    # 랜덤 날짜 선택
    days_ago = random.randint(0, days_ago_max)
    target_date = datetime.now() - timedelta(days=days_ago)

    # 주중/주말 판단
    is_weekend = target_date.weekday() >= 5

    # 시간대별 가중치 적용
    hours = list(range(24))
    weights = [TIME_WEIGHTS[h][1 if is_weekend else 0] for h in hours]

    # 가중치에 따라 시간 선택
    selected_hour = random.choices(hours, weights=weights)[0]
    minute = random.randint(0, 59)
    second = random.randint(0, 59)

    return target_date.replace(hour=selected_hour, minute=minute, second=second)


def generate_timestamps_batch(count: int, days_ago_max: int = 180) -> List[datetime]:
    """배치로 타임스탬프 생성 (최근 것이 더 많도록)"""
    timestamps = []

    for _ in range(count):
        # 최근에 가중치 더 높게
        days_ago = int(random.expovariate(1/30))  # 평균 30일 전
        days_ago = min(days_ago, days_ago_max)

        ts = generate_timestamp(days_ago)
        timestamps.append(ts)

    # 시간순 정렬
    timestamps.sort()
    return timestamps


# ============ 콘텐츠 생성기 ============

def apply_template_variables(template: Dict, persona: Optional[Persona] = None) -> Dict:
    """템플릿에 변수 치환 적용"""
    result = template.copy()

    # 랜덤 변수 선택
    variables = {
        key: random.choice(values)
        for key, values in TEMPLATE_VARIABLES.items()
    }

    # 페르소나별 스타일 조정
    if persona:
        # 감정 표현 조정
        if random.random() < persona.emoji_frequency:
            variables["emotion"] = variables["emotion"] + " " + random.choice(["😊", "🎉", "💪", "✨", "🔥"])

    # 제목과 내용에 변수 치환
    result["title"] = result["title"].format(**variables)
    result["content"] = result["content"].format(**variables)

    return result


def generate_post_content(category: str, persona: Optional[Persona] = None) -> Dict:
    """게시글 콘텐츠 생성"""
    templates = EXTENDED_POST_TEMPLATES.get(category, EXTENDED_POST_TEMPLATES["free"])
    template = random.choice(templates)

    post = apply_template_variables(template, persona)
    post["category"] = category
    post["author_name"] = generate_blogger_name(persona)
    post["user_level"] = persona.level if persona else random.choice(["Bronze", "Silver", "Gold"])

    return post


def generate_comment_content(post_category: str = None) -> str:
    """댓글 콘텐츠 생성"""
    # 게시글 카테고리에 따라 댓글 유형 가중치 조정
    if post_category == "success":
        weights = {"cheer": 4, "empathy": 2, "thanks": 1, "simple": 2, "question": 1, "advice": 0}
    elif post_category == "question":
        weights = {"advice": 4, "empathy": 2, "thanks": 0, "simple": 1, "question": 1, "cheer": 1}
    elif post_category == "tip":
        weights = {"thanks": 4, "question": 2, "empathy": 1, "simple": 1, "cheer": 1, "advice": 1}
    else:
        weights = {"empathy": 2, "thanks": 2, "simple": 3, "cheer": 1, "question": 1, "advice": 1}

    # 가중치에 따라 댓글 유형 선택
    comment_types = list(weights.keys())
    type_weights = [weights[t] for t in comment_types]
    selected_type = random.choices(comment_types, weights=type_weights)[0]

    return random.choice(EXTENDED_COMMENT_TEMPLATES[selected_type])


# ============ 대화 체인 생성기 ============

REPLY_TEMPLATES = {
    "to_question": [
        "네! {answer}",
        "{answer} 도움이 됐으면 좋겠어요~",
        "저는 {answer} 했어요!",
        "음 {answer} 정도 걸렸어요",
        "{answer} 추천드려요!",
    ],
    "to_thanks": [
        "도움이 됐다니 다행이에요!",
        "감사합니다! 앞으로도 좋은 정보 공유할게요",
        "ㅎㅎ 좋은 결과 있길 바래요!",
        "화이팅이에요! 💪",
        "저도 덕분에 힘나네요 ㅎㅎ",
    ],
    "to_cheer": [
        "감사합니다! 😊",
        "ㅎㅎ 앞으로도 열심히 할게요!",
        "덕분에 힘나요!",
        "화이팅입니다!",
        "감사해요~ 💕",
    ],
}

ANSWER_FILLERS = [
    "한 달 정도", "2~3주", "꾸준히 하면 효과 있어요",
    "저도 처음엔 힘들었는데", "여러 번 시도해봤는데",
    "이 방법이 제일", "경험상",
]


def generate_reply(parent_comment: str) -> Optional[str]:
    """대댓글 생성"""
    # 50% 확률로 대댓글 생성
    if random.random() > 0.5:
        return None

    # 부모 댓글 유형 추정
    if "?" in parent_comment or "얼마나" in parent_comment or "어떻게" in parent_comment:
        template = random.choice(REPLY_TEMPLATES["to_question"])
        answer = random.choice(ANSWER_FILLERS)
        return template.format(answer=answer)
    elif "감사" in parent_comment or "도움" in parent_comment:
        return random.choice(REPLY_TEMPLATES["to_thanks"])
    elif "축하" in parent_comment or "대단" in parent_comment:
        return random.choice(REPLY_TEMPLATES["to_cheer"])

    return None


# ============ AI 생성 통합 (선택적) ============

async def generate_ai_content(
    prompt: str,
    content_type: str = "post",
    anthropic_api_key: str = None
) -> Optional[str]:
    """Claude API를 사용한 고품질 콘텐츠 생성"""
    if not anthropic_api_key:
        anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY")

    if not anthropic_api_key:
        logger.warning("ANTHROPIC_API_KEY not found, skipping AI generation")
        return None

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=anthropic_api_key)

        system_prompt = """당신은 네이버 블로그 커뮤니티의 실제 사용자입니다.
블로그 상위노출, SEO, 블로그 운영에 관심이 많은 블로거로서 자연스럽게 글을 작성합니다.

규칙:
- 한국어로 작성
- 자연스러운 구어체 사용
- 이모지는 적당히 (1-3개)
- 실제 경험담처럼 작성
- "블랭크" 서비스를 자연스럽게 언급 가능 (강요 X)
- 글 길이: 게시글은 300-800자, 댓글은 20-100자"""

        message = client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": prompt}]
        )

        return message.content[0].text

    except Exception as e:
        logger.error(f"AI content generation failed: {e}")
        return None


# ============ 배치 데이터 생성기 ============

class BulkDataGenerator:
    """대량 데이터 생성 관리자"""

    def __init__(self, use_ai: bool = False, ai_ratio: float = 0.05):
        self.use_ai = use_ai
        self.ai_ratio = ai_ratio  # AI 생성 비율 (기본 5%)

    def select_category(self) -> str:
        """카테고리 분포에 따라 선택"""
        categories = list(CATEGORY_DISTRIBUTION.keys())
        weights = list(CATEGORY_DISTRIBUTION.values())
        return random.choices(categories, weights=weights)[0]

    def select_persona(self) -> Persona:
        """페르소나 랜덤 선택 (가중치 적용)"""
        persona_weights = {
            PersonaType.BEGINNER: 30,
            PersonaType.INTERMEDIATE: 35,
            PersonaType.EXPERT: 10,
            PersonaType.SIDEJOB: 15,
            PersonaType.PARENTING: 10,
        }

        persona_types = list(persona_weights.keys())
        weights = list(persona_weights.values())
        selected = random.choices(persona_types, weights=weights)[0]

        return PERSONAS[selected]

    def generate_posts(self, count: int = 10000) -> List[Dict]:
        """대량 게시글 생성"""
        posts = []
        timestamps = generate_timestamps_batch(count, days_ago_max=180)

        for i, ts in enumerate(timestamps):
            persona = self.select_persona()
            category = self.select_category()

            # 페르소나 선호 카테고리 반영 (70% 확률)
            if random.random() < 0.7 and persona.preferred_categories:
                category = random.choice(persona.preferred_categories)

            post = generate_post_content(category, persona)
            post["created_at"] = ts.isoformat()
            post["views"] = random.randint(10, 500)
            post["likes"] = random.randint(0, min(post["views"] // 5, 50))
            post["fake_user_id"] = random.randint(10000, 99999)

            posts.append(post)

            if (i + 1) % 1000 == 0:
                logger.info(f"Generated {i + 1}/{count} posts")

        return posts

    def generate_comments_for_posts(
        self,
        posts: List[Dict],
        avg_comments_per_post: Tuple[int, int] = (3, 15)
    ) -> List[Dict]:
        """게시글에 대한 댓글 생성"""
        comments = []

        for i, post in enumerate(posts):
            num_comments = random.randint(*avg_comments_per_post)

            # 인기글은 댓글 더 많이
            if post.get("likes", 0) > 30:
                num_comments = int(num_comments * 1.5)

            post_comments = []
            for j in range(num_comments):
                comment_text = generate_comment_content(post.get("category"))

                # 댓글 시간은 게시글 이후
                post_time = datetime.fromisoformat(post["created_at"])
                hours_after = random.randint(1, 168)  # 1시간 ~ 1주일 후
                comment_time = post_time + timedelta(hours=hours_after)

                if comment_time > datetime.now():
                    comment_time = datetime.now() - timedelta(hours=random.randint(1, 24))

                comment = {
                    "post_index": i,
                    "content": comment_text,
                    "author_name": generate_blogger_name(),
                    "created_at": comment_time.isoformat(),
                    "fake_user_id": random.randint(10000, 99999),
                    "parent_id": None
                }
                post_comments.append(comment)

                # 대댓글 생성 (30% 확률)
                if random.random() < 0.3:
                    reply = generate_reply(comment_text)
                    if reply:
                        reply_time = comment_time + timedelta(hours=random.randint(1, 48))
                        if reply_time > datetime.now():
                            reply_time = datetime.now() - timedelta(minutes=random.randint(1, 60))

                        reply_comment = {
                            "post_index": i,
                            "content": reply,
                            "author_name": post["author_name"],  # 글 작성자가 답글
                            "created_at": reply_time.isoformat(),
                            "fake_user_id": post["fake_user_id"],
                            "parent_id": len(comments) + len(post_comments) - 1  # 부모 댓글 인덱스
                        }
                        post_comments.append(reply_comment)

            comments.extend(post_comments)

            if (i + 1) % 1000 == 0:
                logger.info(f"Generated comments for {i + 1}/{len(posts)} posts")

        return comments


# ============ 데이터베이스 삽입 ============

def bulk_insert_posts(posts: List[Dict], batch_size: int = 500) -> List[int]:
    """배치로 게시글 삽입"""
    from database.community_db import get_db_connection

    conn = get_db_connection()
    cursor = conn.cursor()

    inserted_ids = []

    for i in range(0, len(posts), batch_size):
        batch = posts[i:i + batch_size]

        for post in batch:
            cursor.execute("""
                INSERT INTO posts (
                    user_id, user_name, title, content, category,
                    tags, views, likes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                post["fake_user_id"],
                post["author_name"],
                post["title"],
                post["content"],
                post["category"],
                json.dumps(post.get("tags", [])),
                post["views"],
                post["likes"],
                post["created_at"]
            ))
            inserted_ids.append(cursor.lastrowid)

        conn.commit()
        logger.info(f"Inserted posts batch {i // batch_size + 1}")

    conn.close()
    return inserted_ids


def bulk_insert_comments(comments: List[Dict], post_ids: List[int], batch_size: int = 1000):
    """배치로 댓글 삽입"""
    from database.community_db import get_db_connection

    conn = get_db_connection()
    cursor = conn.cursor()

    comment_id_map = {}  # 임시 인덱스 -> 실제 ID 매핑

    for i in range(0, len(comments), batch_size):
        batch = comments[i:i + batch_size]

        for j, comment in enumerate(batch):
            post_id = post_ids[comment["post_index"]]

            # 부모 댓글 ID 변환
            parent_id = None
            if comment.get("parent_id") is not None:
                parent_id = comment_id_map.get(comment["parent_id"])

            cursor.execute("""
                INSERT INTO post_comments (
                    post_id, user_id, user_name, content, parent_id, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
            """, (
                post_id,
                comment["fake_user_id"],
                comment["author_name"],
                comment["content"],
                parent_id,
                comment["created_at"]
            ))

            comment_id_map[i + j] = cursor.lastrowid

        conn.commit()
        logger.info(f"Inserted comments batch {i // batch_size + 1}")

    # 댓글 수 업데이트
    cursor.execute("""
        UPDATE posts SET comments_count = (
            SELECT COUNT(*) FROM post_comments
            WHERE post_comments.post_id = posts.id AND post_comments.is_deleted = FALSE
        )
    """)
    conn.commit()
    conn.close()


# ============ 메인 생성 함수 ============

def generate_bulk_data(
    post_count: int = 10000,
    avg_comments_per_post: Tuple[int, int] = (3, 15),
    use_ai: bool = False
) -> Dict:
    """대량 커뮤니티 데이터 생성"""
    logger.info(f"Starting bulk data generation: {post_count} posts")

    generator = BulkDataGenerator(use_ai=use_ai)

    # 1. 게시글 생성
    logger.info("Generating posts...")
    posts = generator.generate_posts(post_count)

    # 2. 댓글 생성
    logger.info("Generating comments...")
    comments = generator.generate_comments_for_posts(posts, avg_comments_per_post)

    # 3. DB 삽입
    logger.info("Inserting posts to database...")
    post_ids = bulk_insert_posts(posts)

    logger.info("Inserting comments to database...")
    bulk_insert_comments(comments, post_ids)

    result = {
        "posts_created": len(post_ids),
        "comments_created": len(comments),
        "message": "Bulk data generation completed successfully"
    }

    logger.info(f"Completed: {result}")
    return result


# ============ 점진적 생성 (서버 부하 분산) ============

async def generate_bulk_data_async(
    post_count: int = 10000,
    batch_size: int = 500,
    delay_between_batches: float = 0.5
) -> Dict:
    """비동기로 점진적 대량 데이터 생성"""
    logger.info(f"Starting async bulk data generation: {post_count} posts")

    generator = BulkDataGenerator()
    total_posts = 0
    total_comments = 0

    for batch_start in range(0, post_count, batch_size):
        batch_count = min(batch_size, post_count - batch_start)

        # 배치 생성
        posts = generator.generate_posts(batch_count)
        comments = generator.generate_comments_for_posts(posts)

        # DB 삽입
        post_ids = bulk_insert_posts(posts, batch_size=batch_count)
        bulk_insert_comments(comments, post_ids, batch_size=len(comments))

        total_posts += len(post_ids)
        total_comments += len(comments)

        logger.info(f"Progress: {total_posts}/{post_count} posts, {total_comments} comments")

        # 서버 부하 분산을 위한 딜레이
        await asyncio.sleep(delay_between_batches)

    return {
        "posts_created": total_posts,
        "comments_created": total_comments,
        "message": "Async bulk data generation completed"
    }
