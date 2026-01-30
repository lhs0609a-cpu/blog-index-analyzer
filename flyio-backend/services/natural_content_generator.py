"""
자연스러운 커뮤니티 콘텐츠 생성기
- 실제 사람처럼 비속어, 줄임말, 의심, 불만 등 다양한 감정 표현
- 일관된 가상 유저 페르소나
- 맥락에 맞는 대화 흐름
"""
import random
import json
import hashlib
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
import logging

logger = logging.getLogger(__name__)


# ============ 감정 & 성격 시스템 ============

class Mood(Enum):
    """글 작성 시 기분/감정"""
    HAPPY = "happy"           # 기쁨, 성공
    FRUSTRATED = "frustrated" # 짜증, 답답
    CURIOUS = "curious"       # 궁금, 질문
    SKEPTICAL = "skeptical"   # 의심, 회의적
    EXCITED = "excited"       # 흥분, 신남
    TIRED = "tired"           # 지침, 슬럼프
    HELPFUL = "helpful"       # 도움주고 싶음
    BRAGGING = "bragging"     # 자랑, 뿌듯
    COMPLAINING = "complaining"  # 불만, 투덜
    SARCASTIC = "sarcastic"   # 비꼬는, 냉소적


class Personality(Enum):
    """유저 성격 유형"""
    FRIENDLY = "friendly"     # 친근, 이모티콘 많이
    BLUNT = "blunt"          # 직설적, 단답
    DETAILED = "detailed"     # 꼼꼼, 장문
    CASUAL = "casual"        # 편한, 반말 섞임
    POLITE = "polite"        # 공손, 존댓말
    SARCASTIC = "sarcastic"  # 비꼬는, 냉소적


# ============ 자연스러운 표현 사전 ============

# 줄임말 & 신조어
SLANG_DICT = {
    "정말": ["진짜", "ㄹㅇ", "레알", "마자", "ㅇㅈ"],
    "대박": ["ㄷㅂ", "대박ㅋㅋ", "헐", "미쳤다", "오..."],
    "감사합니다": ["감사해요", "ㄳㄳ", "고마워요", "땡큐", "쌩유"],
    "축하합니다": ["축하해요", "ㅊㅋㅊㅋ", "오 축하!", "ㅊㅋ"],
    "힘내세요": ["화이팅", "ㅎㅇㅌ", "힘내요", "파이팅", "홧팅"],
    "모르겠어요": ["모르겠음", "모름ㅠ", "???", "뭐지", "모르겟어요"],
    "좋아요": ["좋음", "굿", "ㄱㅇㄷ", "좋네요", "괜찮네"],
    "그런데": ["근데", "ㄱㄷ", "그치만", "헌데"],
    "어떻게": ["어케", "어캐", "어떡게", "어떻게요"],
    "왜": ["왜요", "왜??", "웨", "왜지"],
}

# 감탄사 & 필러
FILLERS = {
    "start": ["아", "음", "어", "흠", "오", "앗", "엥", "헐", "와", "우와"],
    "mid": ["그", "이제", "뭐", "좀", "막", "약간", "걍", "그냥"],
    "end": ["ㅋㅋ", "ㅎㅎ", "ㅠㅠ", "...", ";;;", "ㄷㄷ", "??", "!!", "~"],
}

# 이모티콘 (성격별 빈도 다름)
EMOTICONS = {
    "positive": ["😊", "🎉", "💪", "✨", "🔥", "👍", "😄", "🥳", "💕", "☺️"],
    "negative": ["😢", "😭", "ㅠㅠ", "ㅜㅜ", "😞", "💔", "😤", "😠"],
    "neutral": ["🤔", "😅", "ㅎㅎ", "ㅋㅋ", "👀", "🙄", "😶"],
}

# 비속어/강한 표현 (가벼운 수준)
MILD_EXPLETIVES = [
    "ㅅㅂ", "시발", "ㅈㄴ", "존나", "ㄹㅇㅋㅋ", "ㅁㅊ", "미친",
    "개", "존", "레전드", "ㄹㅇ루다가", "헐ㅋㅋㅋ",
    "아 진짜", "아ㅋㅋ", "에휴", "하...", "아놔",
]

# 의심/회의적 표현
SKEPTICAL_EXPRESSIONS = [
    "진짜요?", "에이 설마", "그게 되나요?", "글쎄요...",
    "믿기 힘든데", "뻥 아님?", "광고 아니죠?", "홍보글 같은데",
    "진짠지 모르겠네", "의심됨ㅋㅋ", "어 그래요?", "흠...",
    "근데 이거 효과 있음?", "저도 해봤는데 안되던데",
    "사람마다 다른 거 아님?", "운 좋았던 거 아닐까",
]

# 불만/투덜 표현
COMPLAINT_EXPRESSIONS = [
    "아 짜증나", "왜 안되지", "ㅠㅠ 힘들다", "하...",
    "이게 뭐야", "어이없네", "답답해", "미치겠다",
    "포기하고 싶음", "의욕 없어", "귀찮아", "힘듦",
    "이거 언제까지 해야함?", "진짜 안됨ㅠㅠ", "나만 안되나",
]


# ============ 가상 유저 시스템 ============

@dataclass
class VirtualUser:
    """일관된 성격을 가진 가상 유저"""
    id: int
    name: str
    personality: Personality
    blog_months: int  # 블로그 경력 (개월)
    skill_level: str  # Bronze, Silver, Gold, Platinum
    main_topic: str  # 주 관심 주제
    writing_style: Dict = field(default_factory=dict)

    def __post_init__(self):
        # 성격에 따른 글쓰기 스타일 설정
        self.writing_style = {
            "uses_slang": self.personality in [Personality.CASUAL, Personality.BLUNT],
            "uses_emoticons": self.personality in [Personality.FRIENDLY, Personality.CASUAL],
            "emoticon_frequency": 0.7 if self.personality == Personality.FRIENDLY else 0.3,
            "uses_honorifics": self.personality in [Personality.POLITE, Personality.DETAILED],
            "avg_length": "long" if self.personality == Personality.DETAILED else "short" if self.personality == Personality.BLUNT else "medium",
            "uses_expletives": self.personality in [Personality.CASUAL, Personality.BLUNT, Personality.SARCASTIC],
            "expletive_frequency": 0.1 if self.personality == Personality.CASUAL else 0.05,
        }


# 가상 유저 이름 풀 (더 자연스럽게)
USER_NAME_COMPONENTS = {
    "prefixes": [
        "", "작은", "큰", "오늘의", "매일", "소소한", "행복한", "꾸준한",
        "열심히", "초보", "프로", "도전", "성장", "시작", "노력",
    ],
    "cores": [
        "민지", "수현", "지유", "하은", "서연", "예린", "소민", "채원",
        "준호", "민석", "지훈", "현우", "성민", "재현", "도윤", "시우",
        "블로거", "기록", "일상", "하루", "생활", "이야기", "스토리",
        "맘", "대디", "워킹맘", "직장인", "프리랜서", "대학생", "취준생",
    ],
    "suffixes": [
        "", "log", "diary", "story", "_", ".", "님", "씨",
        "92", "95", "98", "00", "01", "88", "90",
        "_blog", "_daily", "_life", "의하루", "의일상",
    ],
}

# 주제 풀
TOPICS = [
    "맛집", "카페", "여행", "육아", "인테리어", "패션", "뷰티", "IT",
    "재테크", "자기계발", "운동", "요리", "반려동물", "독서", "영화",
    "일상", "리뷰", "체험단", "애드센스", "N잡",
]


def generate_virtual_user(user_id: int = None) -> VirtualUser:
    """가상 유저 생성 (ID 기반으로 일관된 성격 유지)"""
    if user_id is None:
        user_id = random.randint(10000, 99999)

    # ID를 시드로 사용하여 일관된 랜덤값 생성
    seed = int(hashlib.md5(str(user_id).encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)

    # 이름 생성
    prefix = rng.choice(USER_NAME_COMPONENTS["prefixes"])
    core = rng.choice(USER_NAME_COMPONENTS["cores"])
    suffix = rng.choice(USER_NAME_COMPONENTS["suffixes"])
    name = f"{prefix}{core}{suffix}".strip()

    # 성격 (가중치 적용)
    personalities = list(Personality)
    weights = [25, 15, 20, 25, 10, 5]  # friendly, blunt, detailed, casual, polite, sarcastic
    personality = rng.choices(personalities, weights=weights)[0]

    # 블로그 경력 (지수 분포 - 초보가 많음)
    blog_months = min(int(rng.expovariate(0.1)), 36)

    # 스킬 레벨 (경력에 비례)
    if blog_months < 2:
        skill_level = "Bronze"
    elif blog_months < 6:
        skill_level = rng.choice(["Bronze", "Silver"])
    elif blog_months < 12:
        skill_level = rng.choice(["Silver", "Gold"])
    else:
        skill_level = rng.choice(["Gold", "Platinum"])

    return VirtualUser(
        id=user_id,
        name=name,
        personality=personality,
        blog_months=blog_months,
        skill_level=skill_level,
        main_topic=rng.choice(TOPICS),
    )


# ============ 자연스러운 텍스트 변환기 ============

class NaturalTextTransformer:
    """텍스트를 더 자연스럽게 변환"""

    @staticmethod
    def add_typos(text: str, probability: float = 0.02) -> str:
        """자연스러운 오타 추가"""
        typo_map = {
            "ㅏ": "ㅓ", "ㅓ": "ㅏ", "ㅗ": "ㅜ", "ㅜ": "ㅗ",
            "ㄱ": "ㅋ", "ㄷ": "ㅌ", "ㅂ": "ㅍ",
        }
        result = list(text)
        for i, char in enumerate(result):
            if random.random() < probability and char in typo_map:
                result[i] = typo_map[char]
        return "".join(result)

    @staticmethod
    def apply_slang(text: str, intensity: float = 0.3) -> str:
        """줄임말/신조어 적용"""
        result = text
        for formal, slangs in SLANG_DICT.items():
            if formal in result and random.random() < intensity:
                result = result.replace(formal, random.choice(slangs), 1)
        return result

    @staticmethod
    def add_fillers(text: str, user: VirtualUser) -> str:
        """감탄사/필러 추가"""
        if user.personality not in [Personality.CASUAL, Personality.FRIENDLY]:
            return text

        sentences = text.split(".")
        result = []

        for i, sentence in enumerate(sentences):
            if not sentence.strip():
                continue

            # 시작에 필러 추가 (20% 확률)
            if i == 0 and random.random() < 0.2:
                filler = random.choice(FILLERS["start"])
                sentence = f"{filler} {sentence.strip()}"

            # 중간에 필러 추가 (10% 확률)
            if random.random() < 0.1:
                words = sentence.split()
                if len(words) > 3:
                    insert_pos = random.randint(1, len(words) - 1)
                    filler = random.choice(FILLERS["mid"])
                    words.insert(insert_pos, filler)
                    sentence = " ".join(words)

            result.append(sentence)

        return ".".join(result)

    @staticmethod
    def add_emoticons(text: str, user: VirtualUser, mood: Mood) -> str:
        """이모티콘 추가"""
        if not user.writing_style.get("uses_emoticons"):
            return text

        freq = user.writing_style.get("emoticon_frequency", 0.3)

        # 기분에 따른 이모티콘 선택
        if mood in [Mood.HAPPY, Mood.EXCITED, Mood.BRAGGING]:
            emoticon_pool = EMOTICONS["positive"]
        elif mood in [Mood.FRUSTRATED, Mood.TIRED, Mood.COMPLAINING]:
            emoticon_pool = EMOTICONS["negative"]
        else:
            emoticon_pool = EMOTICONS["neutral"]

        # 문장 끝에 이모티콘 추가
        sentences = text.split("\n")
        result = []

        for sentence in sentences:
            if sentence.strip() and random.random() < freq:
                emoticon = random.choice(emoticon_pool)
                sentence = f"{sentence.rstrip()} {emoticon}"
            result.append(sentence)

        return "\n".join(result)

    @staticmethod
    def add_line_breaks(text: str, user: VirtualUser) -> str:
        """자연스러운 줄바꿈"""
        if user.personality == Personality.BLUNT:
            # 짧게 끊어서
            return text.replace(". ", ".\n")
        elif user.personality == Personality.DETAILED:
            # 문단 단위로
            sentences = text.split(". ")
            result = []
            for i, s in enumerate(sentences):
                result.append(s)
                if (i + 1) % 3 == 0:
                    result.append("\n")
            return ". ".join(result)
        return text


# ============ 콘텐츠 생성기 (무드별) ============

# 게시글 템플릿 (무드별로 세분화)
POST_TEMPLATES_BY_MOOD = {
    Mood.HAPPY: {
        "success": [
            {
                "title": "와 드디어 {keyword} {rank} 찍음!!",
                "content": """ㅋㅋㅋㅋ 드디어 됐다

{keyword}로 {rank} 진입함

블로그 {months}개월만인데 {struggle} 드디어 되네

{method}

ㄹㅇ 꾸준히 하면 되긴 하는듯

다들 화이팅""",
            },
            {
                "title": "{keyword} 상위노출 성공 ㅎㅎ",
                "content": """오늘 확인해봤는데 {rank} 찍혀있음

{struggle} 근데 됐네 ㅋㅋ

{method}

이제 다음 키워드 도전해봐야지""",
            },
        ],
        "tip": [
            {
                "title": "나만의 {topic} 팁 공유",
                "content": """블로그 {months}개월차인데 제가 해본 방법 공유함

{tip_content}

이거 {days} 정도 해보니까 효과 있더라

참고하세요~""",
            },
        ],
    },
    Mood.FRUSTRATED: {
        "question": [
            {
                "title": "아 왜 상위노출 안되냐",
                "content": """진짜 {days}째 매일 올리는데 왜 안됨?

{stats}

뭐가 문제인지 모르겠음
고수분들 좀 알려주세요 ㅠㅠ""",
            },
            {
                "title": "{keyword} 진짜 어렵네...",
                "content": """이 키워드 경쟁 너무 심한거 아님?

{attempt_content}

나만 안되는건가 아님 원래 이런건가
답답하다 진짜""",
            },
        ],
        "free": [
            {
                "title": "블로그 하기 싫다",
                "content": """요즘 의욕이 안남

{months}개월 했는데 성과가 없으니까...

{complaint}

그래도 해야되나... 하""",
            },
        ],
    },
    Mood.SKEPTICAL: {
        "question": [
            {
                "title": "이거 진짜 효과 있음?",
                "content": """어디서 {method_name} 하면 된다고 하던데

근데 {doubt}

해보신 분 있음? 효과 있었음?""",
            },
        ],
        "free": [
            {
                "title": "솔직히 이해 안되는 것들",
                "content": """블로그 커뮤니티 보다보면

{skeptical_points}

나만 그런가?""",
            },
        ],
    },
    Mood.CURIOUS: {
        "question": [
            {
                "title": "{keyword} 이 정도면 도전해볼만 함?",
                "content": """키워드 분석해봤는데

{stats}

내 지수로 가능할까요?
비슷한 수준이셨던 분들 어땠어요?""",
            },
            {
                "title": "하루에 포스팅 몇 개가 적당함?",
                "content": """요즘 {frequency}개씩 올리고 있는데

너무 많이 올리면 저품질 걸린다는 말도 있고
적게 올리면 지수 안오른다는 말도 있고

다들 어떻게 함?""",
            },
        ],
    },
    Mood.HELPFUL: {
        "tip": [
            {
                "title": "{topic} 정리해봄 (초보용)",
                "content": """저도 초보때 이거 모르겠었는데
정리해봄

{tip_content}

도움 됐으면 좋겠음""",
            },
            {
                "title": "블랭크 활용법 공유",
                "content": """블랭크 쓰시는 분들 참고하세요

{tip_content}

저는 이렇게 쓰고 있는데 괜찮더라구요""",
            },
        ],
    },
    Mood.BRAGGING: {
        "success": [
            {
                "title": "ㅋㅋㅋ {achievement} 달성",
                "content": """드디어 {achievement} 함

{details}

뿌듯하다 ㅎㅎ

다음 목표는 {next_goal}""",
            },
        ],
    },
    Mood.COMPLAINING: {
        "free": [
            {
                "title": "네이버 알고리즘 이해 안됨",
                "content": """{complaint}

진짜 기준이 뭔지 모르겠음

같은 조건인데 왜 어떤 글은 되고 어떤 글은 안되냐""",
            },
            {
                "title": "요즘 상위노출 너무 어려워진듯",
                "content": """예전엔 좀 쉬웠던것 같은데

요즘은 {complaint}

다들 그럼? 나만 그런가""",
            },
        ],
    },
    Mood.TIRED: {
        "free": [
            {
                "title": "슬럼프 온듯",
                "content": """요즘 글 쓰기가 너무 힘듦

{tired_content}

어떻게 극복함? 조언 좀""",
            },
        ],
    },
}

# 댓글 템플릿 (무드별)
COMMENT_TEMPLATES_BY_MOOD = {
    Mood.HAPPY: [
        "오 축하해요!!", "ㅊㅋㅊㅋ", "대박 부럽다", "와 진짜?? 멋있어요",
        "저도 이렇게 되고 싶음ㅠ", "화이팅!", "좋은 정보 감사해요~",
    ],
    Mood.FRUSTRATED: [
        "저도요 ㅠㅠ", "공감...", "힘내세요 ㅠ", "다들 그래요",
        "포기하지 마세요!", "저도 그랬는데 어느순간 되더라구요",
    ],
    Mood.SKEPTICAL: [
        "저도 좀 의문임", "글쎄요...", "해봐야 알듯", "사바사 아닐까요",
        "저는 효과 없었음", "운도 있는것 같아요",
    ],
    Mood.CURIOUS: [
        "저도 궁금!", "알려주세요~", "오 그런가요?", "해보셨어요?",
        "결과 공유해주세요!", "저도 알고싶어요",
    ],
    Mood.HELPFUL: [
        "감사합니다!", "도움됐어요!", "오 이거 몰랐네", "꿀팁이다",
        "저장해둘게요", "나중에 참고할게요!",
    ],
    Mood.SARCASTIC: [
        "ㅋㅋㅋㅋ", "그런가요~", "네네", "아 그렇구나",
        "흠...", "글쎄요", "모르겠네요",
    ],
}

# 변수 데이터
TEMPLATE_DATA = {
    "keyword": [
        "강남 맛집", "서울 카페", "부산 여행", "제주 숙소", "홍대 맛집",
        "성수동 카페", "인테리어 팁", "다이어트 식단", "육아 꿀팁", "자취 요리",
        "노트북 추천", "에어팟 리뷰", "영양제 추천", "운동 루틴", "독서 추천",
    ],
    "rank": ["1위", "2위", "3위", "5위", "7위", "1페이지", "상위권"],
    "months": ["1", "2", "3", "4", "5", "6", "8", "10", "12"],
    "days": ["2주", "3주", "한달", "두달", "3개월"],
    "frequency": ["1", "2", "3", "매일 1", "이틀에 1"],
    "struggle": [
        "솔직히 포기하려 했는데", "중간에 쉬기도 했는데", "막막했는데",
        "안될줄 알았는데", "기대 안했는데",
    ],
    "method": [
        "키워드 분석 열심히 했음", "글 퀄리티에 신경썼음", "꾸준히만 했음",
        "블랭크로 경쟁분석 했음", "사진 많이 넣었음", "2000자 이상 썼음",
    ],
    "stats": [
        "지수 35점 / 레벨 5", "C-Rank 15점 정도", "이웃 100명",
        "포스팅 50개", "일평균 방문자 30명",
    ],
    "doubt": [
        "진짜 효과 있을까 싶음", "너무 뻔한 얘기 아닌가", "개인차 있을것 같은데",
        "광고 아닌가 싶기도 하고", "검증된건지 모르겠음",
    ],
    "complaint": [
        "글 쓸 시간이 없음", "아이디어가 안떠오름", "매번 같은 얘기만 하게됨",
        "조회수가 안나옴", "상위노출이 안됨", "이웃이 안늘음",
    ],
    "topic": ["키워드 분석", "C-Rank", "상위노출", "블로그 지수", "이웃 늘리기"],
    "achievement": ["레벨7", "이웃 500명", "첫 상위노출", "월 방문자 1만", "첫 체험단"],
    "next_goal": ["레벨9", "이웃 1000명", "1위 달성", "수익화"],
}


def fill_template(template: str, user: VirtualUser) -> str:
    """템플릿에 변수 채우기"""
    result = template

    for key, values in TEMPLATE_DATA.items():
        placeholder = "{" + key + "}"
        while placeholder in result:
            result = result.replace(placeholder, random.choice(values), 1)

    # 사용자 정보로 대체
    result = result.replace("{user_months}", str(user.blog_months))

    return result


# ============ 맥락 인식 댓글 생성 ============

def generate_contextual_comment(post: Dict, commenter: VirtualUser) -> str:
    """게시글 맥락에 맞는 댓글 생성"""
    post_mood = post.get("mood", Mood.CURIOUS)
    post_category = post.get("category", "free")
    post_content = post.get("content", "")

    # 댓글 무드 결정 (게시글 무드와 댓글러 성격에 따라)
    if commenter.personality == Personality.SARCASTIC:
        comment_mood = random.choice([Mood.SKEPTICAL, Mood.SARCASTIC])
    elif commenter.personality == Personality.FRIENDLY:
        comment_mood = random.choice([Mood.HAPPY, Mood.HELPFUL])
    elif post_mood in [Mood.FRUSTRATED, Mood.TIRED]:
        comment_mood = random.choice([Mood.FRUSTRATED, Mood.HELPFUL])
    else:
        comment_mood = random.choice([Mood.HAPPY, Mood.CURIOUS, Mood.HELPFUL])

    # 기본 템플릿에서 선택
    base_comments = COMMENT_TEMPLATES_BY_MOOD.get(comment_mood, COMMENT_TEMPLATES_BY_MOOD[Mood.HAPPY])
    comment = random.choice(base_comments)

    # 게시글 내용에 따른 추가 (키워드 언급)
    if "상위노출" in post_content or "성공" in post.get("title", ""):
        extras = [
            " 어떤 키워드예요?", " 얼마나 걸렸어요?", " 비결이 뭐예요?",
            " 저도 도전해볼게요!", " 부럽다 ㅠㅠ",
        ]
        if random.random() < 0.4:
            comment += random.choice(extras)

    elif "질문" in post_category or "?" in post.get("title", ""):
        if commenter.blog_months > 6:  # 경력자는 조언
            advice = [
                " 저는 이렇게 했어요~", " 제 경험상은요...", " 꾸준히 하시면 돼요!",
            ]
            if random.random() < 0.3:
                comment += random.choice(advice)

    # 성격에 따른 후처리
    transformer = NaturalTextTransformer()

    if commenter.writing_style.get("uses_slang"):
        comment = transformer.apply_slang(comment, 0.4)

    # 이모티콘 추가
    if commenter.writing_style.get("uses_emoticons") and random.random() < 0.5:
        if comment_mood in [Mood.HAPPY, Mood.HELPFUL]:
            comment += " " + random.choice(EMOTICONS["positive"])
        elif comment_mood in [Mood.FRUSTRATED, Mood.TIRED]:
            comment += " " + random.choice(EMOTICONS["negative"])

    # 끝에 ㅋㅋ, ㅎㅎ 추가 (캐주얼한 성격)
    if commenter.personality == Personality.CASUAL and random.random() < 0.3:
        comment += random.choice(["ㅋㅋ", "ㅎㅎ", "ㅋㅋㅋ"])

    return comment


# ============ 대댓글 생성 (대화 흐름) ============

REPLY_PATTERNS = {
    "answer_question": [
        "앗 {keyword}요!", "{time} 정도 걸렸어요", "저는 {method} 했어요",
        "블랭크에서 분석해보세요!", "꾸준히 하다보면 돼요",
    ],
    "thank_reply": [
        "감사합니다!", "ㄳㄳ", "도움됐어요!", "참고할게요~", "화이팅이에요!",
    ],
    "agree": [
        "맞아요 ㅋㅋ", "ㅇㅈ", "그쵸", "저도요!", "공감합니다",
    ],
    "disagree": [
        "음 저는 좀 달랐는데", "사바사일듯", "글쎄요~", "저는 반대였어요",
    ],
}


def generate_reply(parent_comment: str, original_poster: VirtualUser, replier: VirtualUser) -> Optional[str]:
    """대댓글 생성"""
    # 원글쓴이가 답글 다는 경우
    if replier.id == original_poster.id:
        if "?" in parent_comment or "어떻게" in parent_comment or "뭐" in parent_comment:
            reply = random.choice(REPLY_PATTERNS["answer_question"])
            reply = fill_template(reply, original_poster)
        else:
            reply = random.choice(REPLY_PATTERNS["thank_reply"])
    else:
        # 다른 사람이 대댓글
        if random.random() < 0.5:
            reply = random.choice(REPLY_PATTERNS["agree"])
        else:
            reply = random.choice(REPLY_PATTERNS["disagree"])

    # 스타일 적용
    if replier.writing_style.get("uses_emoticons") and random.random() < 0.3:
        reply += " " + random.choice(EMOTICONS["neutral"])

    return reply


# ============ 게시글 생성 ============

def generate_natural_post(user: VirtualUser = None, category: str = None) -> Dict:
    """자연스러운 게시글 생성"""
    if user is None:
        user = generate_virtual_user()

    # 카테고리 결정 (없으면 랜덤)
    if category is None:
        categories = ["free", "tip", "question", "success"]
        weights = [35, 25, 25, 15]
        category = random.choices(categories, weights=weights)[0]

    # 무드 결정 (사용자 상태, 카테고리에 따라)
    if category == "success":
        mood = random.choice([Mood.HAPPY, Mood.BRAGGING, Mood.EXCITED])
    elif category == "question":
        mood = random.choice([Mood.CURIOUS, Mood.FRUSTRATED, Mood.SKEPTICAL])
    elif category == "tip":
        mood = random.choice([Mood.HELPFUL, Mood.HAPPY])
    else:
        mood = random.choice(list(Mood))

    # 템플릿 선택
    mood_templates = POST_TEMPLATES_BY_MOOD.get(mood, {})
    category_templates = mood_templates.get(category, [])

    if not category_templates:
        # 폴백: 기본 템플릿
        category_templates = POST_TEMPLATES_BY_MOOD[Mood.CURIOUS].get("question", [
            {"title": "블로그 질문이요", "content": "질문 있는데요..."}
        ])

    template = random.choice(category_templates)

    # 템플릿 채우기
    title = fill_template(template["title"], user)
    content = fill_template(template["content"], user)

    # 자연스러운 변환 적용
    transformer = NaturalTextTransformer()

    if user.writing_style.get("uses_slang"):
        content = transformer.apply_slang(content, 0.3)

    content = transformer.add_fillers(content, user)
    content = transformer.add_emoticons(content, user, mood)

    # 가끔 오타 추가 (5% 확률)
    if random.random() < 0.05:
        content = transformer.add_typos(content, 0.01)

    # 비속어 추가 (특정 무드 + 성격)
    if mood in [Mood.FRUSTRATED, Mood.COMPLAINING] and user.writing_style.get("uses_expletives"):
        if random.random() < user.writing_style.get("expletive_frequency", 0.05):
            expletive = random.choice(MILD_EXPLETIVES)
            content = f"{expletive} {content}"

    return {
        "user_id": user.id,
        "user_name": user.name,
        "user_level": user.skill_level,
        "title": title,
        "content": content,
        "category": category,
        "mood": mood,
        "tags": [],
    }


# ============ Supabase 콘텐츠 생성 함수 ============

def _generate_content_supabase(supabase, posts_count, comments_per_post) -> Dict:
    """Supabase에 자연스러운 콘텐츠 생성"""
    import json
    from datetime import datetime, timedelta

    num_posts = random.randint(*posts_count)
    now = datetime.now()

    created_posts = []
    created_comments = []

    for i in range(num_posts):
        # 랜덤 시간 (오늘 중)
        hour = random.choices(
            range(24),
            weights=[1,1,1,1,1,2,3,4,5,6,7,7,6,6,7,7,7,6,7,8,9,8,6,3]
        )[0]
        minute = random.randint(0, 59)
        post_time = now.replace(hour=hour, minute=minute, second=random.randint(0, 59))

        if post_time > now:
            post_time = now - timedelta(minutes=random.randint(1, 60))

        # 게시글 생성
        user = generate_virtual_user()
        post = generate_natural_post(user)

        try:
            # Supabase에 삽입
            response = supabase.table("posts").insert({
                "user_id": post["user_id"],
                "user_name": post["user_name"],
                "title": post["title"],
                "content": post["content"],
                "category": post["category"],
                "tags": post.get("tags", []),
                "views": random.randint(10, 500),
                "likes": random.randint(0, 30),
                "created_at": post_time.isoformat()
            }).execute()

            if not response.data:
                continue

            post_id = response.data[0]["id"]
            post["id"] = post_id
            post["created_at"] = post_time
            created_posts.append(post)

            # 댓글 생성
            num_comments = random.randint(*comments_per_post)
            comment_count = 0

            for j in range(num_comments):
                commenter = generate_virtual_user()
                comment_text = generate_contextual_comment(post, commenter)

                # 댓글 시간 (게시글 이후)
                comment_time = post_time + timedelta(
                    minutes=random.randint(5, 60 * 24)
                )
                if comment_time > now:
                    comment_time = now - timedelta(minutes=random.randint(1, 30))

                try:
                    comment_response = supabase.table("post_comments").insert({
                        "post_id": post_id,
                        "user_id": commenter.id,
                        "user_name": commenter.name,
                        "content": comment_text,
                        "created_at": comment_time.isoformat()
                    }).execute()

                    if comment_response.data:
                        comment_id = comment_response.data[0]["id"]
                        comment_count += 1
                        created_comments.append({
                            "id": comment_id,
                            "post_id": post_id,
                            "content": comment_text,
                        })

                        # 대댓글 (30% 확률)
                        if random.random() < 0.3:
                            reply = generate_reply(comment_text, user, user)
                            if reply:
                                reply_time = comment_time + timedelta(minutes=random.randint(5, 120))
                                if reply_time > now:
                                    reply_time = now - timedelta(minutes=random.randint(1, 10))

                                reply_response = supabase.table("post_comments").insert({
                                    "post_id": post_id,
                                    "user_id": user.id,
                                    "user_name": user.name,
                                    "content": reply,
                                    "parent_id": comment_id,
                                    "created_at": reply_time.isoformat()
                                }).execute()

                                if reply_response.data:
                                    comment_count += 1
                                    created_comments.append({
                                        "id": reply_response.data[0]["id"],
                                        "post_id": post_id,
                                        "parent_id": comment_id,
                                        "content": reply,
                                    })
                except Exception as e:
                    logger.warning(f"Comment insert error: {e}")

            # 댓글 수 업데이트
            if comment_count > 0:
                supabase.table("posts").update({"comments_count": comment_count}).eq("id", post_id).execute()

        except Exception as e:
            logger.warning(f"Post insert error: {e}")

    logger.info(f"[Supabase] Generated {len(created_posts)} posts and {len(created_comments)} comments")

    return {
        "posts_created": len(created_posts),
        "comments_created": len(created_comments),
        "timestamp": now.isoformat(),
        "storage": "supabase"
    }


# ============ 메인 생성 함수 ============

def generate_daily_natural_content(
    posts_count: Tuple[int, int] = (15, 30),
    comments_per_post: Tuple[int, int] = (3, 12),
) -> Dict:
    """하루치 자연스러운 콘텐츠 생성 (Supabase 우선)"""
    from database.community_db import get_db_connection, get_supabase
    import json

    supabase = get_supabase()

    # Supabase 사용 가능하면 Supabase로 저장
    if supabase:
        return _generate_content_supabase(supabase, posts_count, comments_per_post)

    # SQLite 폴백
    conn = get_db_connection()
    cursor = conn.cursor()

    # 오늘 생성할 게시글 수 (범위 내 랜덤)
    num_posts = random.randint(*posts_count)

    # 시간 분포 (자연스럽게)
    now = datetime.now()

    created_posts = []
    created_comments = []

    for i in range(num_posts):
        # 랜덤 시간 (오늘 중)
        hour = random.choices(
            range(24),
            weights=[1,1,1,1,1,2,3,4,5,6,7,7,6,6,7,7,7,6,7,8,9,8,6,3]
        )[0]
        minute = random.randint(0, 59)
        post_time = now.replace(hour=hour, minute=minute, second=random.randint(0, 59))

        if post_time > now:
            post_time = now - timedelta(minutes=random.randint(1, 60))

        # 게시글 생성
        user = generate_virtual_user()
        post = generate_natural_post(user)

        # DB 삽입
        cursor.execute("""
            INSERT INTO posts (user_id, user_name, title, content, category, tags, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            post["user_id"],
            post["user_name"],
            post["title"],
            post["content"],
            post["category"],
            json.dumps(post.get("tags", [])),
            post_time.isoformat()
        ))

        post_id = cursor.lastrowid
        post["id"] = post_id
        post["created_at"] = post_time
        created_posts.append(post)

        # 댓글 생성
        num_comments = random.randint(*comments_per_post)

        for j in range(num_comments):
            commenter = generate_virtual_user()
            comment_text = generate_contextual_comment(post, commenter)

            # 댓글 시간 (게시글 이후)
            comment_time = post_time + timedelta(
                minutes=random.randint(5, 60 * 24)  # 5분 ~ 24시간 후
            )
            if comment_time > now:
                comment_time = now - timedelta(minutes=random.randint(1, 30))

            cursor.execute("""
                INSERT INTO post_comments (post_id, user_id, user_name, content, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (
                post_id,
                commenter.id,
                commenter.name,
                comment_text,
                comment_time.isoformat()
            ))

            comment_id = cursor.lastrowid
            created_comments.append({
                "id": comment_id,
                "post_id": post_id,
                "content": comment_text,
            })

            # 대댓글 (30% 확률)
            if random.random() < 0.3:
                reply = generate_reply(comment_text, user, user)  # 원글쓴이 답글
                if reply:
                    reply_time = comment_time + timedelta(minutes=random.randint(5, 120))
                    if reply_time > now:
                        reply_time = now - timedelta(minutes=random.randint(1, 10))

                    cursor.execute("""
                        INSERT INTO post_comments (post_id, user_id, user_name, content, parent_id, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (
                        post_id,
                        user.id,
                        user.name,
                        reply,
                        comment_id,
                        reply_time.isoformat()
                    ))
                    created_comments.append({
                        "id": cursor.lastrowid,
                        "post_id": post_id,
                        "parent_id": comment_id,
                        "content": reply,
                    })

        # 댓글 수 업데이트
        cursor.execute("""
            UPDATE posts SET comments_count = (
                SELECT COUNT(*) FROM post_comments WHERE post_id = ? AND is_deleted = FALSE
            ) WHERE id = ?
        """, (post_id, post_id))

    conn.commit()
    conn.close()

    logger.info(f"Generated {len(created_posts)} posts and {len(created_comments)} comments")

    return {
        "posts_created": len(created_posts),
        "comments_created": len(created_comments),
        "timestamp": now.isoformat(),
    }


# ============ 기존 게시글에 댓글 추가 ============

def add_comments_to_existing_posts(
    max_posts: int = 20,
    comments_per_post: Tuple[int, int] = (1, 5),
) -> Dict:
    """기존 게시글에 새 댓글 추가 (Supabase 우선)"""
    from database.community_db import get_db_connection, get_supabase

    supabase = get_supabase()

    # Supabase 사용 가능하면 Supabase로 처리
    if supabase:
        return _add_comments_supabase(supabase, max_posts, comments_per_post)

    # SQLite 폴백
    conn = get_db_connection()
    cursor = conn.cursor()

    # 최근 게시글 조회 (댓글 적은 것 우선)
    cursor.execute("""
        SELECT id, user_id, user_name, title, content, category
        FROM posts
        WHERE is_deleted = FALSE
        ORDER BY comments_count ASC, created_at DESC
        LIMIT ?
    """, (max_posts,))

    posts = cursor.fetchall()

    now = datetime.now()
    total_comments = 0

    for post in posts:
        post_dict = {
            "id": post["id"],
            "user_id": post["user_id"],
            "title": post["title"],
            "content": post["content"],
            "category": post["category"],
        }

        original_user = generate_virtual_user(post["user_id"])
        num_comments = random.randint(*comments_per_post)

        for _ in range(num_comments):
            commenter = generate_virtual_user()
            comment_text = generate_contextual_comment(post_dict, commenter)

            comment_time = now - timedelta(minutes=random.randint(1, 60 * 6))

            cursor.execute("""
                INSERT INTO post_comments (post_id, user_id, user_name, content, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (
                post["id"],
                commenter.id,
                commenter.name,
                comment_text,
                comment_time.isoformat()
            ))

            total_comments += 1

        # 댓글 수 업데이트
        cursor.execute("""
            UPDATE posts SET comments_count = (
                SELECT COUNT(*) FROM post_comments WHERE post_id = ? AND is_deleted = FALSE
            ) WHERE id = ?
        """, (post["id"], post["id"]))

    conn.commit()
    conn.close()

    return {
        "posts_updated": len(posts),
        "comments_added": total_comments,
    }


def _add_comments_supabase(supabase, max_posts: int, comments_per_post: Tuple[int, int]) -> Dict:
    """Supabase에서 기존 게시글에 댓글 추가"""
    from datetime import datetime, timedelta

    now = datetime.now()
    total_comments = 0

    try:
        # 최근 게시글 조회 (댓글 적은 것 우선)
        response = supabase.table("posts").select("id, user_id, user_name, title, content, category").eq("is_deleted", False).order("comments_count").order("created_at", desc=True).limit(max_posts).execute()

        if not response.data:
            return {"posts_updated": 0, "comments_added": 0, "storage": "supabase"}

        posts = response.data

        for post in posts:
            post_dict = {
                "id": post["id"],
                "user_id": post["user_id"],
                "title": post["title"],
                "content": post["content"],
                "category": post["category"],
            }

            num_comments = random.randint(*comments_per_post)
            added_comments = 0

            for _ in range(num_comments):
                commenter = generate_virtual_user()
                comment_text = generate_contextual_comment(post_dict, commenter)

                comment_time = now - timedelta(minutes=random.randint(1, 60 * 6))

                try:
                    supabase.table("post_comments").insert({
                        "post_id": post["id"],
                        "user_id": commenter.id,
                        "user_name": commenter.name,
                        "content": comment_text,
                        "created_at": comment_time.isoformat()
                    }).execute()

                    total_comments += 1
                    added_comments += 1
                except Exception as e:
                    logger.warning(f"Comment insert error: {e}")

            # 댓글 수 업데이트
            if added_comments > 0:
                try:
                    # 현재 댓글 수 조회
                    count_response = supabase.table("post_comments").select("id", count="exact").eq("post_id", post["id"]).eq("is_deleted", False).execute()
                    new_count = count_response.count or 0
                    supabase.table("posts").update({"comments_count": new_count}).eq("id", post["id"]).execute()
                except Exception as e:
                    logger.warning(f"Update comments_count error: {e}")

        logger.info(f"[Supabase] Added {total_comments} comments to {len(posts)} posts")

        return {
            "posts_updated": len(posts),
            "comments_added": total_comments,
            "storage": "supabase"
        }

    except Exception as e:
        logger.error(f"[Supabase] add_comments error: {e}")
        return {
            "posts_updated": 0,
            "comments_added": 0,
            "error": str(e)
        }
