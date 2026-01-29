"""
커뮤니티 자동화 시스템 (현실적인 버전)
- 진짜 사람이 쓴 것처럼 자연스러운 글
- 중복 방지
- 다양한 톤과 스타일
"""
import random
import hashlib
from datetime import datetime, timedelta
from typing import List, Dict, Set
import logging

logger = logging.getLogger(__name__)

# 중복 방지용
_used_titles: Set[str] = set()


def reset_duplicates():
    global _used_titles
    _used_titles = set()


# ============ 현실적인 닉네임 (200개+) ============
BLOGGER_NAMES = [
    # 감성적
    "하루끝에", "조용한오후", "비오는날에", "햇살좋은날", "늦은밤기록",
    "새벽감성", "오후세시", "퇴근후일상", "주말오전", "월요병",

    # 일상
    "일상다반사", "소소한하루", "매일기록중", "오늘도열심히", "그냥사는중",
    "평범한일상", "특별할것없는", "그저그런하루", "별일없는날", "무난한일상",

    # 블로그 관련
    "블린이탈출", "초보탈출기", "블로그도전", "기록하는습관", "꾸준히만",
    "블로그입문", "글쓰는사람", "기록이좋아", "매일쓰기", "일기대신",

    # 직업/상황
    "직장인일상", "워킹맘하루", "프리랜서생활", "대학생기록", "취준일기",
    "육아중간에", "주부9단", "신혼생활", "자취일기", "회사원K",

    # 취미
    "카페탐방러", "맛집헌터", "여행기록", "독서일기", "영화보는날",
    "운동하는날", "요리하는날", "베이킹중", "사진찍는날", "음악듣는밤",

    # 지역
    "서울사람", "부산청년", "대구일상", "인천에서", "경기도민",
    "강남러", "홍대근처", "판교직장인", "분당사는", "일산거주",

    # 영어 섞인
    "daily_log", "my_record", "simple_life", "today_story", "life_note",
    "blog_diary", "just_write", "everyday_me", "random_thoughts",

    # 숫자 포함
    "블로그2024", "기록러123", "도전중99", "열심히77", "화이팅88",
    "시작2025", "꾸준히365", "매일1포", "목표달성중", "성장기록",

    # 캐주얼
    "ㅇㅇ", "그냥", "아무말", "끄적끄적", "혼잣말",
    "메모장", "낙서장", "생각정리", "기록용", "임시저장",

    # 추가
    "오늘의블로그", "나의하루", "작은성공", "한걸음씩", "천천히",
    "조급하지않게", "여유롭게", "느긋하게", "마이페이스", "내스타일",
]


# ============ 현실적인 게시글 (중복 없이 다양하게) ============
POST_TEMPLATES = {
    "free": [
        # 슬럼프/고민
        {"title": "요즘 블로그 할 맛이 안나요", "content": "솔직히 말하면 요즘 진짜 의욕이 없음\n\n매일 글 쓰려고 노력하는데 뭘 써야할지도 모르겠고\n조회수도 안나오고 댓글도 없으니까 허탈함\n\n다들 이럴때 어떻게 함?"},
        {"title": "블로그 접을까 고민중", "content": "3개월째 상위노출 한번도 못해봄\n매일 1포씩 올리는데 뭐가 문제인지 모르겠음\n\n주변에선 그냥 시간낭비라고 하는데\n비슷한 경험 있으신분?"},
        {"title": "블로그 하기 싫은 날", "content": "오늘따라 유난히 글쓰기 싫네요\n억지로 쓰면 퀄리티도 안나오고\n\n그냥 쉴까요 아님 대충이라도 올릴까요"},
        {"title": "슬럼프 왔나봐요", "content": "2주째 글을 못쓰고 있어요\n쓰려고 하면 아무 생각이 안나고\n\n다들 슬럼프 올때 어떻게 극복하세요?"},
        {"title": "블로그 왜 하세요?", "content": "진짜 궁금해서 물어봄\n수익? 기록? 취미?\n\n저는 처음엔 수익이었는데 지금은 그냥 습관이 됨"},

        # 일상/잡담
        {"title": "오늘 첫 애드센스 수익 ㅋㅋㅋ", "content": "0.01달러ㅋㅋㅋㅋㅋ\n\n6개월만에 처음 수익인데 감격\n언제 100달러 모으냐 이거..."},
        {"title": "드디어 서이추 100명!", "content": "블로그 시작한지 2개월만에 서이추 100명 됨\n별거 아닌것 같은데 뿌듯하네요\n\n목표는 500명인데 언제 채우려나"},
        {"title": "체험단 처음 신청해봤는데", "content": "떨어졌어요ㅋㅋㅋ\n당연히 될줄 알았는데 아니었음\n\n체험단 붙으신 분들 방문자 얼마나 되세요?"},
        {"title": "남편이 블로그 하지말래요", "content": "시간낭비라고... 그 시간에 다른거 하라고\n\n근데 저는 블로그가 취미인데 ㅠㅠ\n다들 주변 반응 어때요?"},
        {"title": "1일1포 챌린지 실패함", "content": "2주만에 깨짐ㅋㅋ\n주말에 너무 바빠서 못썼어요\n\n괜히 스트레스만 받고 뭐하는짓인가 싶다"},
        {"title": "블로그하면서 힘든점", "content": "사진 찍는거요 진심\n맛집가서 사진찍는것도 민폐같고\n여행가서도 사진찍느라 정작 여행을 못즐김"},
        {"title": "알고리즘 이상한거 나만 그래요?", "content": "전에는 그래도 조금씩 유입이 있었는데\n요즘은 아예 0임 ㄹㅇ\n\n뭔가 바뀐건가?"},
        {"title": "글감 고갈됨", "content": "진짜 뭘 써야할지 모르겠어요\n일상글? 재미없고\n정보글? 내가 아는게 없고\n\n여러분은 글감 어디서 찾으세요?"},
        {"title": "오늘 조회수 500 넘음", "content": "평소에 50도 안됐는데 갑자기 500\n뭔가 상위노출 된건가?\n\n근데 왜인지는 모르겠음"},
        {"title": "블로그 1년차 후기", "content": "결론부터 말하면 생각보다 어려움\n처음엔 쉽게 생각했는데 꾸준히 하는게 제일 힘듦\n\n그래도 계속 할거임"},

        # 추가
        {"title": "오늘도 수고했다 나", "content": "글 3개 썼음\n퇴근하고 쓰려니까 힘들지만 뿌듯\n\n다들 하루에 몇개씩 쓰세요?"},
        {"title": "주말에 몰아쓰기 함", "content": "평일엔 시간이 없어서 주말에 5개 썼음\n예약발행 걸어둠\n\n이러면 안좋은가요?"},
        {"title": "블로그 시작한지 100일", "content": "100일 됐네요\n포스팅 80개 정도 됨\n\n뭔가 기념할만한건 없지만 그래도 뿌듯"},
        {"title": "오늘 처음 댓글 받음", "content": "진짜 감동ㅠㅠ\n아무도 안 읽는줄 알았는데\n누군가 읽고 있었구나"},
        {"title": "이웃 신청 받으면 다 받아야함?", "content": "이웃 신청이 왔는데 광고블로그 같아요\n거절해도 되나요?\n\n다들 어떻게 하세요?"},

        # 더 추가 - 일상/잡담
        {"title": "블로그 하다가 포기한 사람", "content": "저 아는 사람 중에 블로그 시작했다가 한달만에 접은 사람 많음\n\n다들 얼마나 버티셨어요?"},
        {"title": "맛집 글 쓰기 귀찮아짐", "content": "맛집 가면 사진부터 찍어야하고\n음식 식기 전에 빨리 찍어야하고\n솔직히 밥맛 없어질때 있음ㅋㅋ"},
        {"title": "블로그 vs 유튜브", "content": "요즘 유튜브가 대세라는데\n블로그는 옛날거라고 하더라\n\n근데 난 글쓰는게 더 편함"},
        {"title": "포스팅 수정하면 검색 순위 떨어짐?", "content": "예전에 쓴 글 수정하고 싶은데\n수정하면 순위 떨어진다는 말이 있어서\n\n실제로 그런가요?"},
        {"title": "글감이 없어서 못씀", "content": "진짜 뭘 써야할지 모르겠다\n매일매일 글감 찾는게 제일 힘듦"},
        {"title": "복사해간 사람 있음", "content": "내 글 그대로 복사해간 사람 발견함\n\n신고해야하나?\n아니면 그냥 냅둘까"},
        {"title": "블로그 폰으로 하는 사람?", "content": "나 폰으로만 블로그 하는데\nPC로 하면 뭐가 다른가요?"},
        {"title": "카테고리 정리 해야하는데", "content": "카테고리가 너무 지저분해짐\n근데 정리하려니까 귀찮고\n\n다들 카테고리 몇개예요?"},
        {"title": "저품질 해제된 사람?", "content": "저품질 걸린지 2달째인데\n해제된 사람 있어요?\n어떻게 해야 풀리나요"},
        {"title": "방문자수 0명인 날", "content": "오늘 방문자 0명이네요\n이런 날도 있구나\n\n다들 최저 방문자수 얼마예요?"},
        {"title": "블로그 수익 현실", "content": "솔직히 말해서 6개월에 커피 한잔값도 안됨\n수익 목적으로 블로그 하면 안되는듯"},
        {"title": "글쓰다가 날림", "content": "2시간동안 쓴 글 저장 안하고 날림\n자동저장 믿었는데 안됐음\n\n멘탈 나감"},
        {"title": "사진 찍는거 귀찮음", "content": "글은 쉽게 쓰는데 사진 찍는게 제일 귀찮\n근데 사진 없으면 밋밋하고\n\n아 모르겠다"},
        {"title": "이웃 정리해야하나", "content": "이웃이 300명인데 소통하는 사람은 10명도 안됨\n그냥 숫자만 많은 느낌"},
    ],
    "tip": [
        {"title": "초보때 몰랐던 것들", "content": "블로그 6개월차인데 초반에 삽질한거 공유\n\n1. 카테고리 너무 많이 만들지 마세요\n2. 처음부터 긴 글 쓰려고 하지 마세요\n3. 이웃 숫자보다 소통이 중요\n4. 매일 쓸 필요 없음"},
        {"title": "상위노출 되는 글 vs 안되는 글", "content": "둘 다 경험해봤는데 차이점 정리\n\n[되는 글]\n- 제목에 키워드 자연스럽게\n- 사진 10장 이상\n- 2000자 이상\n\n[안되는 글]\n- 제목 감성적 (키워드 없음)\n- 사진 2-3장\n- 글 짧음"},
        {"title": "이웃 늘리는 현실적인 방법", "content": "서이추 막 보내지 마시고요\n\n1. 관심있는 주제 블로그 찾기\n2. 글 진짜로 읽고 댓글 달기\n3. 며칠 소통하다가 서이추\n\n이렇게 하면 진짜 소통하는 이웃 생김"},
        {"title": "폰으로 사진 잘 찍는 팁", "content": "전문 장비 없어도 됨\n\n- 자연광 최고\n- 배경 정리 필수\n- 45도 각도가 예쁨\n- 편집은 밝기만 살짝"},
        {"title": "글쓰는 시간 단축하는 법", "content": "저는 글 하나에 3시간씩 걸렸는데 지금은 1시간이면 끝남\n\n1. 틀 정해놓기\n2. 사진 먼저 올리고 글 채우기\n3. 완벽하려고 하지 않기"},
        {"title": "키워드 찾는 방법", "content": "남들 다 쓰는 키워드 쓰면 경쟁만 치열함\n\n네이버 검색창에 단어 치면 연관검색어 나옴\n그 중에 블로그 적은 키워드 찾기\n\n경쟁 심한 키워드 피하는게 핵심"},
        {"title": "댓글 많이 받는 글 특징", "content": "제 글 중에 댓글 많은거 분석해봤는데요\n\n- 마지막에 질문을 던짐\n- 공감가는 내용\n- 너무 완벽하지 않음\n\n정보글보다 일상글이 댓글 더 많이 달림"},
        {"title": "저품질 피하는 법", "content": "제가 조심하는 것들:\n\n- 하루에 3개 이상 안 올림\n- 복붙 절대 안함\n- 광고글만 안 씀\n- 같은 키워드 반복 안함"},

        # 추가
        {"title": "초보한테 드리는 조언", "content": "블로그 8개월차가 드리는 조언\n\n1. 조급해하지 마세요\n2. 다른 블로그랑 비교 ㄴㄴ\n3. 꾸준함이 답임\n4. 즐기면서 하세요"},
        {"title": "이거 하나만 고치세요", "content": "초보분들 글 보면 공통적으로 하나가 부족함\n\n바로 사진 퀄리티\n\n글은 괜찮은데 사진이 너무 어둡거나 흔들림\n사진만 신경써도 확 달라져요"},
        {"title": "무료 툴 추천", "content": "제가 쓰는 무료 툴들 공유\n\n- 사진편집: 스냅시드\n- 썸네일: 미리캔버스\n- 키워드: 블랭크\n\n다 무료고 충분함"},

        # 더 추가 - 팁
        {"title": "제목 쓰는 팁", "content": "제목이 제일 중요함\n\n1. 키워드 앞에 넣기\n2. 너무 길면 안됨\n3. 궁금하게 만들기\n\n예) X: 오늘 먹은 맛있는 파스타\n예) O: 홍대 파스타 맛집 | 분위기 좋은 곳"},
        {"title": "검색 유입 늘리는 법", "content": "검색 유입 늘리려면\n\n1. 네이버에서 사람들이 뭘 검색하는지 보기\n2. 검색량 있는 키워드 찾기\n3. 그 키워드로 글 쓰기\n\n단순한데 이게 핵심임"},
        {"title": "맛집 글 잘 쓰는 법", "content": "맛집 글 구성 공유\n\n1. 썸네일: 음식 클로즈업\n2. 인트로: 간단한 위치/분위기\n3. 메뉴 소개\n4. 맛 평가 (솔직하게)\n5. 마무리: 영업정보"},
        {"title": "조회수 높은 글 특징", "content": "내 글 중에 조회수 높은거 분석해봤음\n\n- 제목에 '후기' 들어간 글\n- 사진 많은 글\n- 길이가 긴 글\n\n짧은 일상글은 조회수 잘 안나옴"},
        {"title": "저품질 안걸리는 법", "content": "저품질 무서워하는 분들 많은데\n\n1. 복붙 절대 ㄴㄴ\n2. 하루 3개 이상 ㄴㄴ\n3. 광고글만 쓰기 ㄴㄴ\n4. 비슷한 글 반복 ㄴㄴ\n\n이것만 지키면 웬만하면 안걸림"},
        {"title": "이웃과 소통하는 법", "content": "이웃 늘리는건 쉬운데 소통하는 이웃 만들기가 어려움\n\n제가 하는 방법:\n- 먼저 댓글 달기\n- 진심으로 공감하기\n- 꾸준히 방문하기"},
        {"title": "글 퀄리티 높이는 법", "content": "글 퀄리티 높이고 싶으면\n\n1. 사진 밝기 조절\n2. 문단 나누기\n3. 강조는 볼드로\n4. 마지막에 한번 더 읽어보기"},
        {"title": "블로그 스킨 추천", "content": "네이버 기본 스킨보다 변경하는게 나음\n\n깔끔한 스킨으로 바꾸면 체류시간도 늘어남\n\n저는 심플한거 쓰는데 좋아요"},
        {"title": "글 쓰기 전에 할 일", "content": "글 쓰기 전에 항상 하는 것\n\n1. 키워드 검색량 확인\n2. 상위 글들 어떻게 썼는지 확인\n3. 내가 쓸 차별점 생각\n\n그냥 바로 쓰면 상위노출 힘듦"},
    ],
    "question": [
        {"title": "이 정도면 괜찮은건가요?", "content": "블로그 3개월차입니다\n\n일평균 방문자 30명\n포스팅 60개\n이웃 80명\n\n이 정도면 평균인가요?"},
        {"title": "상위노출 얼마나 걸리셨어요?", "content": "다들 첫 상위노출까지 얼마나 걸리셨나요?\n전 2개월째인데 아직 한번도 못해봤거든요"},
        {"title": "이웃이 갑자기 줄었어요", "content": "어제까지 120명이었는데 오늘 115명이에요\n\n5명이 서이추 끊은건가?\n제가 뭘 잘못한걸까요"},
        {"title": "애드센스 승인 팁 있을까요?", "content": "3번째 거절당함ㅋㅋ\n\n포스팅 40개\n방문자 하루 50명\n\n뭐가 문제일까요?"},
        {"title": "사진 용량 어떻게 관리하세요?", "content": "원본으로 올리면 너무 무겁고\n압축하면 화질 떨어지고\n\n적당한 용량이 얼마정도인지?"},
        {"title": "글 발행 시간 언제가 좋아요?", "content": "아침에 올리는게 좋다 저녁에 올리는게 좋다\n말이 다 달라서 헷갈림\n\n다들 주로 언제 발행하세요?"},
        {"title": "비공개 글 다시 공개하면?", "content": "예전에 쓴 글이 좀 부끄러워서 비공개 했는데\n다시 공개하면 검색에 잡히나요?"},
        {"title": "체험단 어디서 신청해요?", "content": "체험단 하고 싶은데 어디서 신청하는지 모르겠음\n\n다들 어디서 하세요?"},

        # 추가
        {"title": "포스팅 몇 개부터 효과 있나요?", "content": "지금 30개 정도 있는데\n아직 유입이 거의 없어요\n\n몇 개 정도 있어야 유입이 생기나요?"},
        {"title": "카테고리 몇개가 적당해요?", "content": "지금 10개인데 너무 많은가요?\n줄여야 할까요?"},
        {"title": "예약발행 괜찮나요?", "content": "주말에 몰아쓰고 예약발행 하려는데\n예약발행이 검색에 불리하다는 말이 있어서요"},
        {"title": "이웃 몇명부터 효과있어요?", "content": "지금 50명인데 적은건가요?\n몇명 정도 되어야 소통이 활발해지나요?"},

        # 더 추가 - 질문
        {"title": "블로그 주제 바꿔도 되나요?", "content": "지금 맛집 블로그인데 여행으로 바꾸고 싶음\n주제 바꾸면 기존 글들 어떻게 되나요?"},
        {"title": "해시태그 몇개가 적당해요?", "content": "해시태그 많이 넣으면 좋은건가요?\n아니면 적당히 넣어야 하나요?"},
        {"title": "사진 몇장이 적당해요?", "content": "사진 많으면 좋다고 하는데\n너무 많아도 안좋다고 하고\n\n적당한게 몇장일까요?"},
        {"title": "글 길이 얼마나 써야해요?", "content": "글이 너무 짧으면 안좋다고 하는데\n몇자 이상 써야 하나요?"},
        {"title": "다른 블로그 인용해도 되나요?", "content": "다른 블로그 글 참고하고 싶은데\n인용하면 저품질 걸리나요?"},
        {"title": "맛집 별점 솔직하게 써도 되나요?", "content": "솔직히 별로였던 맛집이 있는데\n그대로 쓰면 문제 안되나요?"},
        {"title": "블로그 수익화 어떻게 해요?", "content": "애드센스 말고 다른 수익화 방법 있나요?\n체험단? 협찬?"},
        {"title": "글 삭제하면 검색에 영향 있나요?", "content": "예전에 쓴 글 중에 별로인거 삭제하고 싶은데\n삭제하면 블로그에 안좋은가요?"},
        {"title": "PC버전 vs 모바일버전 뭐가 나아요?", "content": "글 쓸 때 PC가 나은지 모바일이 나은지\n다들 어디서 쓰세요?"},
        {"title": "스마트에디터 ONE 쓰시나요?", "content": "스마트에디터 ONE으로 바꾸라고 하는데\n기존거랑 뭐가 다른가요?"},
        {"title": "블로그 홍보 어떻게 해요?", "content": "글 써도 아무도 안보는데\n어디서 홍보해야 하나요?"},
        {"title": "서이추 거절해도 되나요?", "content": "이상한 사람이 서이추 보내면\n거절해도 되는건가요?"},
    ],
    "success": [
        {"title": "드디어 상위노출 됐어요!!", "content": "4개월만에 처음으로 상위노출 성공함ㅠㅠ\n\n'홍대 파스타 맛집' 키워드로 6위\n아직도 믿기지가 않음\n\n다들 포기하지 마세요!!"},
        {"title": "첫 수익 인증!", "content": "애드센스 100달러 달성했습니다\n1년 2개월 걸림ㅋㅋ\n\n금액은 작지만 의미있는 첫 수익!"},
        {"title": "체험단 첫 당첨!!", "content": "신청만 한 20번 한듯\n드디어 처음 당첨됐어요!\n\n카페 체험단인데 너무 설렘"},
        {"title": "이웃 500명 달성", "content": "1년 걸렸네요\n처음엔 100명도 어려웠는데 꾸준히 소통하니까 늘더라"},
        {"title": "일방문자 1000명 찍음", "content": "평소엔 100명도 안됐는데 오늘 갑자기 1000명 넘음\n글 하나가 검색 상위에 떴더라고요\n\n이 기분 처음이야"},
        {"title": "첫 협찬 받음!", "content": "DM으로 협찬 제의가 왔는데 진짜인줄 몰랐어요\n확인해보니까 진짜 업체더라고요\n\n블로그 하길 잘한듯"},

        # 추가
        {"title": "드디어 레벨업!", "content": "레벨 7 달성!\n처음엔 3이었는데 6개월만에 7 됨\n\n다음은 9 목표"},
        {"title": "오늘 방문자 신기록", "content": "평소 100명대였는데 오늘 2000명 넘음\n뭔가 글 하나가 터진듯\n\n기분 좋다 ㅎㅎ"},

        # 더 추가 - 성공
        {"title": "검색 1위 찍음", "content": "내가 쓴 글이 검색 1위에 뜸\n\n믿기지가 않는데 진짜임\n\n기분 너무 좋다 ㅠㅠ"},
        {"title": "이웃 200명 달성!", "content": "3개월만에 이웃 200명 됨\n\n소통하면서 천천히 늘린건데\n뿌듯하네요"},
        {"title": "첫 원고료 받음", "content": "블로그 보고 원고 제의 들어와서\n처음으로 원고료 받았어요\n\n5만원인데 감격ㅠㅠ"},
        {"title": "애드센스 드디어 승인!", "content": "5번 떨어지고 드디어 승인됨\n\n포스팅 60개, 방문자 하루 70명쯤 됐을 때 붙음"},
        {"title": "3개월 꾸준히 한 결과", "content": "3개월 동안 매일 1포 했는데\n\n방문자: 10명 -> 150명\n이웃: 20명 -> 180명\n\n꾸준히 하면 된다"},
        {"title": "첫 리뷰 제안 받음", "content": "업체에서 리뷰 제안이 왔어요\n\n아직 블로그 작은데 신기하네요\n열심히 해야겠다"},
        {"title": "목표 달성!", "content": "올해 목표였던 포스팅 100개 달성!\n\n쉬운거 같으면서도 어려웠는데\n해냈다 뿌듯"},
        {"title": "인기글 선정됨", "content": "내 글이 주제별 인기글에 떴음\n\n갑자기 방문자 폭발해서 뭔가 했더니\n인기글이었음 ㅎㅎ"},
        {"title": "키워드 점령 성공", "content": "목표했던 키워드로 상위 5개 글이 다 내꺼가 됨\n\n처음엔 불가능할줄 알았는데 가능하네요"},
        {"title": "블로그 6개월 성과", "content": "6개월 동안의 성과 정리\n\n- 포스팅: 120개\n- 방문자: 하루 200명\n- 이웃: 350명\n- 수익: 월 3만원\n\n아직 멀었지만 성장중"},
    ],
}


# ============ 현실적인 댓글 ============
COMMENT_TEMPLATES = [
    # 공감
    "저도 완전 공감이에요 ㅠㅠ", "ㅋㅋ 진짜 맞아요", "저만 그런줄 알았는데",
    "와 제 얘기인줄", "공감 100%", "저도요 ㅠ", "ㄹㅇ 인정",

    # 질문
    "혹시 얼마나 걸리셨어요?", "더 자세히 알려주실 수 있나요?",
    "어떤 방법으로 하셨어요?", "초보도 할 수 있을까요?",

    # 응원
    "축하드려요!!", "우와 대박 부럽다", "화이팅이에요!",
    "저도 열심히 해야겠어요", "멋있어요 ㅎㅎ", "응원합니다!",

    # 감사
    "좋은 정보 감사해요!", "도움 됐어요 ㅎㅎ", "꿀팁이네요",
    "저장해둘게요!", "참고할게요!",

    # 조언
    "저는 이렇게 했는데 효과 있었어요", "포기하지 마세요!",
    "꾸준히 하시면 돼요", "다들 그래요 ㅎㅎ",

    # 캐주얼
    "오오 그렇군요", "ㅎㅎ", "ㅋㅋㅋ", "그쵸", "오", "헐",
    "신기하네요", "재밌네요 ㅎㅎ", "좋아요!", "글 잘 읽었어요",

    # 의견
    "저는 좀 다른 경험인데", "글쎄요.. 사람마다 다른것 같아요",
    "저는 그 방법 안 맞았어요",
]


def get_random_blogger_name() -> str:
    return random.choice(BLOGGER_NAMES)


def _get_existing_titles_from_db() -> Set[str]:
    """DB에서 기존 제목들 조회"""
    from database.community_db import get_db_connection
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT title FROM posts")
        titles = {row['title'] for row in cursor.fetchall()}
        conn.close()
        return titles
    except:
        return set()


# 고유 제목 생성용 변형들
TITLE_PREFIXES = [
    "", "[후기] ", "[질문] ", "[공유] ", "[고민] ", "[정보] ",
    "(급해요) ", "드디어 ", "결국 ", "갑자기 ", "요즘 ",
    "솔직히 ", "진짜 ", "ㄹㅇ ", "혹시 ", "궁금한데 ",
]

TITLE_SUFFIXES = [
    "", "...", " ㅠㅠ", " ㅎㅎ", " ㅋㅋ", "!", "?", " (공유)",
    " (질문)", " (급해요)", " (도와주세요)", " (후기)",
    f" #{random.randint(1, 999)}", f" ({random.randint(1, 12)}월)",
]


def get_random_post(category: str = None) -> Dict:
    global _used_titles

    # DB에서 기존 제목 가져오기 (캐싱)
    if len(_used_titles) == 0:
        _used_titles = _get_existing_titles_from_db()

    if category is None:
        categories = ["free", "tip", "question", "success"]
        weights = [40, 25, 25, 10]
        category = random.choices(categories, weights=weights)[0]

    templates = POST_TEMPLATES.get(category, POST_TEMPLATES["free"])

    # 여러 번 시도
    for attempt in range(50):
        template = random.choice(templates)
        base_title = template["title"]

        # 고유 제목 생성
        if attempt < 10:
            # 처음엔 간단한 변형
            suffix = random.choice(["", " ㅠㅠ", " ㅎㅎ", "...", "!", " (공유)", " (질문)"])
            title = base_title + suffix
        elif attempt < 30:
            # 숫자 추가
            title = f"{base_title} #{random.randint(1, 9999)}"
        else:
            # 더 복잡한 변형
            prefix = random.choice(TITLE_PREFIXES)
            suffix = random.choice(TITLE_SUFFIXES) + f"_{random.randint(1, 9999)}"
            title = prefix + base_title + suffix

        if title not in _used_titles:
            _used_titles.add(title)

            # 내용도 약간 변형
            content = template["content"]
            if random.random() < 0.3:
                content = content + f"\n\n(p.s. {random.choice(['질문있으면 댓글 주세요', '다들 어떠세요?', '의견 부탁드려요', '조언 부탁해요'])})"

            return {
                "title": title,
                "content": content,
                "category": category,
                "author_name": get_random_blogger_name()
            }

    # 50번 시도 후에도 실패하면 완전히 새로운 제목 생성
    unique_id = random.randint(10000, 99999)
    dynamic_titles = [
        f"블로그 일기 {unique_id}",
        f"오늘의 기록 {unique_id}",
        f"끄적끄적 {unique_id}",
        f"블로그 이야기 {unique_id}",
        f"하루 정리 {unique_id}",
        f"소소한 이야기 {unique_id}",
    ]

    return {
        "title": random.choice(dynamic_titles),
        "content": "블로그 하면서 느끼는 점들 공유해요\n\n다들 어떠세요?",
        "category": category,
        "author_name": get_random_blogger_name()
    }


def get_random_comment() -> str:
    return random.choice(COMMENT_TEMPLATES)


# ============ 생성 함수 ============

def clear_all_community_data():
    """모든 커뮤니티 데이터 삭제"""
    from database.community_db import get_db_connection

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM post_comments")
    cursor.execute("DELETE FROM posts")
    cursor.execute("DELETE FROM post_likes")

    conn.commit()
    conn.close()

    reset_duplicates()
    logger.info("All community data cleared")


def generate_seed_posts(count: int = 30) -> List[int]:
    """시드 게시글 생성"""
    from database.community_db import get_db_connection
    import json

    conn = get_db_connection()
    cursor = conn.cursor()

    created_ids = []

    for i in range(count):
        post = get_random_post()
        fake_user_id = random.randint(10000, 99999)

        days_ago = random.randint(0, 180)
        hours_ago = random.randint(0, 23)
        created_at = (datetime.now() - timedelta(days=days_ago, hours=hours_ago)).isoformat()

        views = random.randint(10, 300)
        likes = random.randint(0, min(views // 10, 20))

        cursor.execute("""
            INSERT INTO posts (user_id, user_name, title, content, category, views, likes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (fake_user_id, post["author_name"], post["title"], post["content"],
              post["category"], views, likes, created_at))

        created_ids.append(cursor.lastrowid)

    conn.commit()
    conn.close()

    logger.info(f"Generated {len(created_ids)} seed posts")
    return created_ids


def generate_seed_comments(post_ids: List[int] = None, comments_per_post: tuple = (2, 8)) -> int:
    """시드 댓글 생성"""
    from database.community_db import get_db_connection

    conn = get_db_connection()
    cursor = conn.cursor()

    if not post_ids:
        cursor.execute("SELECT id FROM posts ORDER BY created_at DESC LIMIT 100")
        post_ids = [row['id'] for row in cursor.fetchall()]

    total_comments = 0

    for post_id in post_ids:
        num_comments = random.randint(comments_per_post[0], comments_per_post[1])

        for _ in range(num_comments):
            fake_user_id = random.randint(10000, 99999)
            author_name = get_random_blogger_name()
            comment = get_random_comment()

            hours_ago = random.randint(0, 72)
            created_at = (datetime.now() - timedelta(hours=hours_ago)).isoformat()

            cursor.execute("""
                INSERT INTO post_comments (post_id, user_id, user_name, content, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (post_id, fake_user_id, author_name, comment, created_at))

            total_comments += 1

        cursor.execute("""
            UPDATE posts SET comments_count = (
                SELECT COUNT(*) FROM post_comments WHERE post_id = ? AND is_deleted = FALSE
            ) WHERE id = ?
        """, (post_id, post_id))

    conn.commit()
    conn.close()

    logger.info(f"Generated {total_comments} seed comments")
    return total_comments


def initialize_community() -> Dict:
    """커뮤니티 초기화 (기존 데이터 삭제 후 새로 생성)"""
    logger.info("Initializing community with realistic data...")

    # 기존 데이터 삭제
    clear_all_community_data()

    # 새 데이터 생성
    post_ids = generate_seed_posts(50)
    comments_count = generate_seed_comments(post_ids, (2, 8))

    return {
        "posts_created": len(post_ids),
        "comments_created": comments_count,
        "message": "Community initialized successfully with realistic content"
    }


def generate_daily_content() -> Dict:
    """매일 자동 콘텐츠 생성"""
    from database.community_db import get_db_connection

    conn = get_db_connection()
    cursor = conn.cursor()

    result = {"posts_created": 0, "comments_created": 0}

    # 새 게시글 (3~5개)
    num_posts = random.randint(3, 5)
    new_post_ids = []

    for _ in range(num_posts):
        post = get_random_post()
        fake_user_id = random.randint(10000, 99999)
        hours_ago = random.randint(0, 12)
        created_at = (datetime.now() - timedelta(hours=hours_ago)).isoformat()

        cursor.execute("""
            INSERT INTO posts (user_id, user_name, title, content, category, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (fake_user_id, post["author_name"], post["title"], post["content"],
              post["category"], created_at))

        new_post_ids.append(cursor.lastrowid)
        result["posts_created"] += 1

    conn.commit()

    # 기존 게시글에 댓글
    cursor.execute("SELECT id FROM posts WHERE is_deleted = FALSE ORDER BY created_at DESC LIMIT 30")
    recent_posts = [row['id'] for row in cursor.fetchall()]

    num_comments = random.randint(10, 20)
    for _ in range(num_comments):
        post_id = random.choice(recent_posts) if recent_posts else None
        if not post_id:
            continue

        fake_user_id = random.randint(10000, 99999)
        author_name = get_random_blogger_name()
        comment = get_random_comment()

        cursor.execute("""
            INSERT INTO post_comments (post_id, user_id, user_name, content)
            VALUES (?, ?, ?, ?)
        """, (post_id, fake_user_id, author_name, comment))

        cursor.execute("""
            UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?
        """, (post_id,))

        result["comments_created"] += 1

    conn.commit()
    conn.close()

    logger.info(f"Daily content generated: {result}")
    return result
