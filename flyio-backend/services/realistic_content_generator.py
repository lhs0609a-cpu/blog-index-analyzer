"""
현실적인 커뮤니티 콘텐츠 생성기
- 진짜 사람이 쓴 것처럼 자연스러운 글
- 중복 방지 시스템
- 다양한 주제, 톤, 스타일
"""
import random
import hashlib
import json
from datetime import datetime, timedelta
from typing import List, Dict, Set, Optional, Tuple
import logging

logger = logging.getLogger(__name__)

# 중복 방지용 해시 저장
_used_titles: Set[str] = set()
_used_content_hashes: Set[str] = set()


def reset_duplicate_tracker():
    """중복 추적 리셋"""
    global _used_titles, _used_content_hashes
    _used_titles = set()
    _used_content_hashes = set()


def get_content_hash(content: str) -> str:
    """콘텐츠 해시 생성"""
    return hashlib.md5(content[:100].encode()).hexdigest()


# ============ 현실적인 닉네임 ============
REALISTIC_NICKNAMES = [
    # 일반적인 닉네임
    "꿈꾸는블로거", "일상다반사", "소소한행복찾기", "오늘도한걸음", "작은성공기록",
    "블린이탈출기", "열심히사는중", "취미로블로그", "퇴근후기록", "주말작가",
    "카페에서글쓰기", "밤에쓰는일기", "아침형블로거", "점심시간활용", "틈새시간",

    # 직업/상황 기반
    "워킹맘의하루", "육아중간기록", "직장인N잡러", "프리랜서일상", "대학생블로그",
    "취준생의기록", "이직준비중", "퇴사후새출발", "주부9단", "신혼생활",

    # 지역 느낌
    "서울사는직장인", "부산청년", "대구맘", "인천에서", "경기도민",

    # 감성적
    "하루끝에", "조용한오후", "비오는날에", "햇살좋은날", "늦은밤에",

    # 영어 섞인
    "daily_record", "my_blog_life", "simple_daily", "today_log", "life_story",
    "blog_newbie", "writing_time", "coffee_and_blog", "night_writer",

    # 숫자 포함
    "블로그2024", "기록하는사람1", "매일성장중99", "도전러123", "꾸준히77",

    # 특이한 스타일
    "ㅇㅇ", "ㄱㄱ", "블로그하는사람", "그냥씀", "아무말대잔치",
    "뭐라도써야지", "기록용", "메모장대신", "혼잣말", "끄적끄적",
]


# ============ 현실적인 게시글 (카테고리별) ============

REALISTIC_POSTS = {
    "free": [
        # 일상/잡담
        {
            "title": "요즘 블로그 할 맛이 안나요",
            "content": "솔직히 말하면 요즘 진짜 의욕이 없음\n\n매일 글 쓰려고 노력하는데 뭘 써야할지도 모르겠고\n조회수도 안나오고 댓글도 없으니까 허탈함\n\n다들 이럴때 어떻게 함?\n그냥 쉬는게 나을까요 아님 억지로라도 쓰는게 좋을까요"
        },
        {
            "title": "오늘 처음으로 애드센스 수익 찍힘 ㄷㄷ",
            "content": "0.01달러ㅋㅋㅋㅋㅋㅋㅋ\n\n아니 근데 이거 진짜 뜨긴 뜨는구나\n6개월동안 승인받고 처음 수익인데 감격\n\n언제 100달러 모으냐 이거..."
        },
        {
            "title": "블로그 접을까 고민중",
            "content": "3개월째 상위노출 한번도 못해봄\n매일 1포씩 올리는데 뭐가 문제인지 모르겠음\n\n주변에선 그냥 시간낭비라고 하는데\n그래도 포기하기엔 아깝고\n\n비슷한 경험 있으신분?"
        },
        {
            "title": "드디어 서이추 100명 달성!",
            "content": "블로그 시작한지 2개월만에 서이추 100명 됐어요!!\n별거 아닌것 같은데 막상 되니까 뿌듯하네요 ㅎㅎ\n\n목표는 500명인데 언제 채우려나..."
        },
        {
            "title": "체험단 처음 신청해봤는데",
            "content": "떨어졌어요ㅋㅋㅋㅋ\n\n당연히 될줄 알았는데 아니었음\n일평균 방문자 100명은 넘어야 된다더니 맞는듯\n\n체험단 붙으신 분들 방문자 얼마나 되세요?"
        },
        {
            "title": "남편이 블로그 하지 말라고 함",
            "content": "시간 낭비라고... 그 시간에 다른거 하라고\n\n근데 저는 블로그가 취미인데 ㅠㅠ\n수익은 아직 없지만 글쓰는게 좋아서 하는건데\n이해를 안해주네요\n\n다들 주변 반응 어때요?"
        },
        {
            "title": "1일 1포 챌린지 실패함",
            "content": "2주만에 깨짐ㅋㅋ\n\n주말에 너무 바빠서 못썼어요\n괜히 스트레스만 받고 뭐하는짓인가 싶다가도\n다시 시작해야하나 고민됨"
        },
        {
            "title": "블로그 하면서 제일 힘든점",
            "content": "사진 찍는거요 진심\n\n맛집 가서 사진 찍는것도 민폐같고\n집에서 요리 사진 찍으려면 세팅하느라 음식 식고\n여행가서도 사진 찍느라 정작 여행을 못즐김\n\n공감하시는 분?"
        },
        {
            "title": "요즘 블로그 알고리즘 이상한거 나만 그래요?",
            "content": "전에는 그래도 조금씩 유입이 있었는데\n요즘은 아예 0임 ㄹㅇ\n\n뭔가 바뀐건가? 저만 그런가요?\n댓글로 알려주세요 ㅠ"
        },
        {
            "title": "블로그 글감 고갈",
            "content": "진짜 뭘 써야할지 모르겠어요\n\n일상글? 그건 재미없고\n정보글? 내가 아는게 없고\n리뷰글? 살 돈이 없고\n\n여러분은 글감 어디서 찾으세요?"
        },
        {
            "title": "오늘 조회수 500 넘음 ㄷㄷ",
            "content": "평소에 50도 안됐는데 갑자기 500\n뭔가 상위노출 된건가?\n\n확인해보니까 연관검색어에 뜬듯\n근데 왜인지는 모르겠음\n\n이런 경험 있으신분?"
        },
        {
            "title": "블로그 1년차 솔직 후기",
            "content": "결론부터 말하면 생각보다 어려움\n\n처음엔 쉽게 생각했는데 꾸준히 하는게 제일 힘듦\n수익? 커피값 정도 나옴\n보람? 글 읽어주는 사람 있을때 느낌\n\n그래도 계속 할거임 ㅋㅋ"
        },
    ],
    "tip": [
        {
            "title": "초보때 몰랐던 것들 정리",
            "content": "블로그 6개월차인데 초반에 몰라서 삽질한거 공유함\n\n1. 카테고리 너무 많이 만들지 마세요 - 3개 정도가 적당\n2. 처음부터 긴 글 쓰려고 하지 마세요 - 500자도 ok\n3. 이웃 숫자보다 소통이 중요 - 진짜임\n4. 매일 쓸 필요 없음 - 주 3회도 충분\n\n저는 이거 모르고 한달만에 번아웃 옴ㅋㅋ"
        },
        {
            "title": "상위노출 되는 글 vs 안되는 글 차이",
            "content": "둘 다 경험해봤는데 차이점 정리\n\n[되는 글]\n- 제목에 키워드 자연스럽게 들어감\n- 사진 많음 (10장 이상)\n- 글 길이 2000자 이상\n- 중간중간 소제목 있음\n\n[안되는 글]\n- 제목이 너무 감성적 (키워드 없음)\n- 사진 2-3장\n- 글 짧음\n- 줄글로 쭉 씀\n\n제 경험상 그렇습니다"
        },
        {
            "title": "이웃 늘리는 현실적인 방법",
            "content": "서이추 막 보내지 마시고요\n\n1. 관심있는 주제 블로그 찾기\n2. 글 진짜로 읽고 댓글 달기 (복붙 티나면 역효과)\n3. 며칠 소통하다가 서이추\n\n이렇게 하면 진짜 소통하는 이웃 생김\n숫자만 채우면 의미 없어요"
        },
        {
            "title": "사진 잘 찍는 팁 (폰으로)",
            "content": "전문 장비 없어도 됨 폰으로 충분\n\n- 자연광 최고 (창가에서 찍으세요)\n- 배경 정리 필수 (지저분하면 사진도 별로)\n- 45도 각도가 예쁨\n- 편집은 밝기만 살짝 올리기\n\n이것만 해도 퀄리티 확 올라감"
        },
        {
            "title": "글 쓰는 시간 단축하는 법",
            "content": "저는 글 하나에 3시간씩 걸렸었는데\n지금은 1시간이면 끝남\n\n비결:\n1. 틀 정해놓기 (도입-본문-마무리)\n2. 사진 먼저 올리고 글 채우기\n3. 완벽하려고 하지 않기\n4. 맞춤법은 나중에 한번에 체크\n\n처음엔 오래 걸려도 점점 빨라져요"
        },
        {
            "title": "키워드 찾는 나만의 방법",
            "content": "남들 다 쓰는 키워드 쓰면 경쟁만 치열함\n\n제가 하는 방법:\n- 네이버 검색창에 단어 치면 연관검색어 나옴\n- 그 중에 블로그 적은 키워드 찾기\n- 월간 검색량 500-2000 정도가 적당\n\n경쟁 심한 키워드 피하는게 핵심"
        },
        {
            "title": "댓글 많이 받는 글 특징",
            "content": "제 글 중에 댓글 많은거 분석해봤는데요\n\n공통점:\n- 마지막에 질문을 던짐 (여러분은 어떠세요?)\n- 공감가는 내용\n- 너무 완벽하지 않음 (빈틈이 있어야 댓글 달기 쉬움)\n\n정보글보다 일상글이 댓글 더 많이 달리더라"
        },
        {
            "title": "저품질 피하는 법",
            "content": "저품질 한번 걸리면 답없다고 하던데 전 아직 안걸렸음\n\n제가 조심하는 것들:\n- 하루에 3개 이상 안 올림\n- 복붙 절대 안함\n- 광고글만 안 씀 (일상글 섞어서)\n- 같은 키워드 반복 안함\n\n근데 이래도 걸리는 사람 있다던데 알고리즘 복불복인듯"
        },
    ],
    "question": [
        {
            "title": "블로그 지수 이 정도면 괜찮은건가요?",
            "content": "블로그 3개월차입니다\n\n일평균 방문자 30명\n포스팅 60개\n이웃 80명\n\n이 정도면 평균인가요? 잘 가고 있는건지 모르겠어요\n비슷한 분들 어떠세요?"
        },
        {
            "title": "상위노출 얼마나 걸리셨어요?",
            "content": "다들 첫 상위노출까지 얼마나 걸리셨나요?\n\n전 2개월째인데 아직 한번도 못해봤거든요\n정상인지 느린건지 감이 안와서요\n\n경험 공유해주시면 감사하겠습니다"
        },
        {
            "title": "이웃이 갑자기 줄었는데 왜일까요?",
            "content": "어제까지 120명이었는데 오늘 보니까 115명이에요\n\n5명이 서이추 끊은건가?\n제가 뭘 잘못한걸까요 ㅠㅠ\n글도 열심히 올리고 댓글도 다는데...\n\n이런 경험 있으신분?"
        },
        {
            "title": "애드센스 승인 팁 있을까요?",
            "content": "3번째 거절당함ㅋㅋㅋㅋ\n\n포스팅 40개\n방문자 하루 50명 정도\n개설 2개월\n\n뭐가 문제일까요?\n승인받으신 분들 조건이 어땠는지 궁금합니다"
        },
        {
            "title": "사진 용량 어떻게 관리하세요?",
            "content": "블로그에 사진 올리다보니까 원본으로 올리면 너무 무겁고\n압축하면 화질 떨어지고\n\n다들 어떻게 하시나요?\n적당한 용량이 얼마정도인지?"
        },
        {
            "title": "글 발행 시간 언제가 좋아요?",
            "content": "아침에 올리는게 좋다 저녁에 올리는게 좋다\n말이 다 달라서 헷갈림\n\n다들 주로 언제 발행하세요?\n그리고 효과 있으세요?"
        },
        {
            "title": "비공개 글 다시 공개하면 어떻게 되나요?",
            "content": "예전에 쓴 글이 좀 부끄러워서 비공개 했는데\n다시 공개하면 검색에 잡히나요?\n\n아니면 새로 쓰는게 나을까요?"
        },
        {
            "title": "방문자 수 vs 조회수 뭐가 다른거에요?",
            "content": "바보같은 질문일 수 있는데\n\n방문자 수랑 조회수가 다르던데\n정확히 뭐가 다른건가요?\n어떤걸 기준으로 봐야하나요?"
        },
        {
            "title": "체험단 자주 하면 블로그에 안좋은가요?",
            "content": "요즘 체험단 많이 하는데\n광고글 많으면 지수 떨어진다는 말이 있어서요\n\n체험단 비중 어느정도가 적당할까요?\n경험 있으신분 알려주세요"
        },
        {
            "title": "키워드 분석 어떻게 하세요?",
            "content": "다들 키워드 분석하고 글 쓴다는데\n솔직히 뭘 어떻게 분석하는지 모르겠음\n\n그냥 생각나는대로 쓰면 안되나요?\n분석하는 방법 알려주실 분?"
        },
    ],
    "success": [
        {
            "title": "드디어 상위노출 됐어요!!",
            "content": "4개월만에 처음으로 상위노출 성공함ㅠㅠㅠ\n\n'홍대 파스타 맛집' 키워드로 6위에요\n아직도 믿기지가 않음\n\n비결은 딱히 없고 그냥 꾸준히 한거밖에 없는데\n그래도 되니까 너무 좋다\n\n다들 포기하지 마세요!!"
        },
        {
            "title": "첫 수익 인증!!",
            "content": "애드센스 100달러 달성했습니다\n\n1년 2개월 걸림ㅋㅋㅋㅋ\n중간에 포기할뻔 했는데 그냥 꾸준히 했더니 됐네요\n\n금액은 작지만 의미있는 첫 수익!"
        },
        {
            "title": "체험단 첫 당첨!!",
            "content": "신청만 한 20번 한듯\n드디어 처음 당첨됐어요!!\n\n카페 체험단인데 너무 설렘\n열심히 써야지"
        },
        {
            "title": "이웃 500명 달성 후기",
            "content": "1년 걸렸네요\n\n처음엔 100명도 어려웠는데 꾸준히 소통하니까 늘더라\n숫자에 집착 안하고 진짜 소통하는 이웃 만드는게 좋은것 같아요\n\n앞으로도 열심히 할게요!"
        },
        {
            "title": "일방문자 1000명 찍음",
            "content": "평소엔 100명도 안됐는데 오늘 갑자기 1000명 넘음\n\n뭔가 싶어서 확인해보니까 글 하나가 검색 상위에 떴더라고요\n신기하네 ㅎㅎ\n\n이 기분 처음이야"
        },
        {
            "title": "블로그로 첫 협찬 받음",
            "content": "DM으로 협찬 제의가 왔는데 진짜인줄 몰랐어요\n확인해보니까 진짜 업체더라고요\n\n제품 받고 솔직하게 리뷰 쓰기로 했는데\n이런 경험 처음이라 떨림\n\n블로그 하길 잘한듯"
        },
    ],
}


# ============ 현실적인 댓글 ============

REALISTIC_COMMENTS = {
    "empathy": [
        "저도 완전 공감이에요 ㅠㅠ",
        "ㅋㅋㅋ 진짜 맞아요",
        "저만 그런줄 알았는데 다행이다",
        "와 제 얘기인줄",
        "공감 100%",
        "저도요 ㅠ",
        "ㄹㅇ 인정",
        "완전 내 이야기",
        "저도 똑같아요",
        "공감하고 갑니다",
    ],
    "question": [
        "혹시 얼마나 걸리셨어요?",
        "더 자세히 알려주실 수 있나요?",
        "저도 해봐야겠는데 어렵지 않아요?",
        "어떤 방법으로 하셨어요?",
        "구체적인 팁 있으실까요?",
        "초보도 할 수 있을까요?",
        "혹시 단점은 없어요?",
        "비용이 들어요?",
        "시간은 얼마나 걸려요?",
        "효과 있어요?",
    ],
    "cheer": [
        "축하드려요!!",
        "우와 대박 부럽다",
        "화이팅이에요!",
        "저도 열심히 해야겠어요",
        "멋있어요 ㅎㅎ",
        "응원합니다!",
        "저도 그렇게 되고 싶어요",
        "ㅊㅋㅊㅋ",
        "대단하세요!",
        "저도 힘내야지",
    ],
    "thanks": [
        "좋은 정보 감사해요!",
        "도움 됐어요 ㅎㅎ",
        "오 몰랐는데 알아갑니다",
        "꿀팁이네요",
        "저장해둘게요!",
        "감사합니다~",
        "참고할게요!",
        "유용한 글이네요",
        "공유 감사해요",
        "덕분에 배워갑니다",
    ],
    "advice": [
        "저는 이렇게 했는데 효과 있었어요",
        "제 경험상 그건 아닌것 같아요",
        "그냥 꾸준히 하시면 돼요",
        "너무 조급해하지 마세요",
        "시간이 해결해줄거예요",
        "저도 그랬는데 지금은 괜찮아요",
        "포기하지 마세요!",
        "다들 그래요 ㅎㅎ",
        "원래 처음엔 다 힘들어요",
        "꾸준함이 답인듯",
    ],
    "casual": [
        "오오 그렇군요",
        "ㅎㅎ",
        "ㅋㅋㅋ",
        "그쵸",
        "아하",
        "오",
        "헐",
        "ㄷㄷ",
        "신기하네요",
        "재밌네요 ㅎㅎ",
        "좋아요!",
        "구경 잘 하고 갑니다~",
        "글 잘 읽었어요",
    ],
    "disagree": [
        "음 저는 좀 다른 경험인데",
        "글쎄요.. 사람마다 다른것 같아요",
        "저는 그 방법 안 맞았어요",
        "효과 없던데..",
        "저만 그런가",
    ],
}


# ============ 게시글 생성 함수 ============

def generate_unique_post(category: str = None) -> Optional[Dict]:
    """중복 없는 게시글 생성"""
    global _used_titles, _used_content_hashes

    if category is None:
        categories = ["free", "tip", "question", "success"]
        weights = [40, 25, 25, 10]
        category = random.choices(categories, weights=weights)[0]

    posts = REALISTIC_POSTS.get(category, REALISTIC_POSTS["free"])

    # 랜덤 셔플
    random.shuffle(posts)

    for post in posts:
        title = post["title"]
        content = post["content"]

        # 약간의 변형 추가 (중복 방지)
        variations = [
            "",
            " (진짜임)",
            " ㅠㅠ",
            " ㅎㅎ",
            "...",
            "!",
            " (궁금)",
            " (질문)",
            " (공유)",
        ]

        title_with_var = title + random.choice(variations)
        content_hash = get_content_hash(content)

        # 중복 체크
        if title_with_var not in _used_titles and content_hash not in _used_content_hashes:
            _used_titles.add(title_with_var)
            _used_content_hashes.add(content_hash)

            # 콘텐츠 변형
            content_variations = [
                content,
                content + "\n\n(궁금한거 있으시면 댓글 주세요)",
                content + "\n\n다들 어떠세요?",
                content + "\n\n공감하시면 좋아요 눌러주세요 ㅎㅎ",
                "안녕하세요\n\n" + content,
                content.replace("ㅋㅋ", "ㅋㅋㅋ").replace("ㅠㅠ", "ㅠ"),
            ]

            return {
                "title": title_with_var,
                "content": random.choice(content_variations),
                "category": category,
                "author_name": random.choice(REALISTIC_NICKNAMES),
            }

    # 모든 템플릿이 사용됐으면 동적 생성
    return generate_dynamic_post(category)


def generate_dynamic_post(category: str) -> Dict:
    """동적으로 게시글 생성 (템플릿 소진 시)"""

    topics = [
        "오늘의 블로그 기록", "요즘 고민", "블로그 근황", "잡담", "질문 있어요",
        "혼잣말", "기록용", "메모", "생각정리", "끄적끄적",
    ]

    contents = [
        "블로그 하다보면 이런저런 생각이 드네요\n여러분은 어떠세요?",
        "요즘 바빠서 글을 못썼는데 다시 시작해봅니다",
        "오늘도 열심히! 화이팅",
        "궁금한게 있는데 아시는분 계실까요?",
        "그냥 끄적여봅니다 ㅎㅎ",
    ]

    title = f"{random.choice(topics)} #{random.randint(1, 9999)}"
    content = random.choice(contents)

    return {
        "title": title,
        "content": content,
        "category": category,
        "author_name": random.choice(REALISTIC_NICKNAMES),
    }


def generate_realistic_comment(post_category: str = None) -> str:
    """현실적인 댓글 생성"""

    # 카테고리에 따른 댓글 유형 가중치
    if post_category == "success":
        types = ["cheer", "question", "casual"]
        weights = [50, 30, 20]
    elif post_category == "question":
        types = ["advice", "empathy", "question"]
        weights = [40, 30, 30]
    elif post_category == "tip":
        types = ["thanks", "question", "casual"]
        weights = [50, 30, 20]
    else:
        types = ["empathy", "casual", "question", "cheer"]
        weights = [30, 30, 20, 20]

    comment_type = random.choices(types, weights=weights)[0]
    comments = REALISTIC_COMMENTS.get(comment_type, REALISTIC_COMMENTS["casual"])

    return random.choice(comments)


# ============ 데이터베이스 작업 ============

def clear_all_posts():
    """모든 게시글/댓글 삭제"""
    from database.community_db import get_db_connection

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM post_comments")
    cursor.execute("DELETE FROM posts")
    cursor.execute("DELETE FROM post_likes")

    conn.commit()
    conn.close()

    reset_duplicate_tracker()
    logger.info("All posts and comments cleared")


def generate_realistic_data(post_count: int = 500, comments_per_post: Tuple[int, int] = (2, 8)) -> Dict:
    """현실적인 데이터 생성"""
    from database.community_db import get_db_connection

    reset_duplicate_tracker()

    conn = get_db_connection()
    cursor = conn.cursor()

    now = datetime.now()
    created_posts = 0
    created_comments = 0

    for i in range(post_count):
        post = generate_unique_post()
        if post is None:
            continue

        # 랜덤 시간 (최근 6개월)
        days_ago = random.randint(0, 180)
        hours_ago = random.randint(0, 23)
        post_time = now - timedelta(days=days_ago, hours=hours_ago)

        # 랜덤 조회수/좋아요
        views = random.randint(5, 300)
        likes = random.randint(0, min(views // 10, 20))

        cursor.execute("""
            INSERT INTO posts (user_id, user_name, title, content, category, views, likes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            random.randint(10000, 99999),
            post["author_name"],
            post["title"],
            post["content"],
            post["category"],
            views,
            likes,
            post_time.isoformat()
        ))

        post_id = cursor.lastrowid
        created_posts += 1

        # 댓글 생성
        num_comments = random.randint(*comments_per_post)
        for j in range(num_comments):
            comment = generate_realistic_comment(post["category"])
            comment_time = post_time + timedelta(hours=random.randint(1, 72))

            if comment_time > now:
                comment_time = now - timedelta(minutes=random.randint(1, 60))

            cursor.execute("""
                INSERT INTO post_comments (post_id, user_id, user_name, content, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (
                post_id,
                random.randint(10000, 99999),
                random.choice(REALISTIC_NICKNAMES),
                comment,
                comment_time.isoformat()
            ))
            created_comments += 1

        # 댓글 수 업데이트
        cursor.execute("""
            UPDATE posts SET comments_count = ? WHERE id = ?
        """, (num_comments, post_id))

        if (i + 1) % 100 == 0:
            conn.commit()
            logger.info(f"Progress: {i + 1}/{post_count} posts")

    conn.commit()
    conn.close()

    return {
        "posts_created": created_posts,
        "comments_created": created_comments,
    }
