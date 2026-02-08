"""
커뮤니티 시드 데이터 생성 스크립트 (고품질 버전)
구체적 수치/경험 포함, 카테고리별 맥락 있는 댓글
Supabase 기반
"""
import os
import sys
import random
import asyncio
import json
from datetime import datetime, timedelta
from typing import List, Dict

# Supabase 설정
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("SUPABASE_URL과 SUPABASE_KEY 환경변수를 설정하세요")
    print("예: set SUPABASE_URL=https://xxx.supabase.co")
    print("    set SUPABASE_KEY=eyJ...")
    sys.exit(1)

from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ============ 닉네임 ============
NICKNAMES = [
    "하루끝에", "조용한오후", "비오는날에", "햇살좋은날", "늦은밤기록",
    "새벽감성", "오후세시", "퇴근후일상", "주말오전", "월요병",
    "일상다반사", "소소한하루", "매일기록중", "오늘도열심히", "그냥사는중",
    "평범한일상", "특별할것없는", "그저그런하루", "별일없는날", "무난한일상",
    "블린이탈출", "초보탈출기", "블로그도전", "기록하는습관", "꾸준히만",
    "직장인일상", "워킹맘하루", "프리랜서생활", "대학생기록", "취준일기",
    "육아중간에", "주부9단", "신혼생활", "자취일기", "회사원K",
    "카페탐방러", "맛집헌터", "여행기록", "독서일기", "영화보는날",
    "서울사람", "부산청년", "대구일상", "인천에서", "경기도민",
    "daily_log", "my_record", "simple_life", "today_story", "life_note",
    "블로그2024", "기록러123", "도전중99", "열심히77", "화이팅88",
    "ㅇㅇ", "그냥", "아무말", "끄적끄적", "혼잣말",
    "메모장", "낙서장", "생각정리", "기록용", "임시저장",
    "오늘의블로그", "나의하루", "작은성공", "한걸음씩", "천천히",
]

# ============ 고품질 게시글 템플릿 ============
POST_TEMPLATES = {
    "free": [
        {
            "titles": [
                "블로그 3개월차인데 상위노출이 한번도 안돼요",
                "3개월째 매일 글 쓰는데 상위노출 경험이 없습니다",
                "매일 1포스팅 3개월했는데 상위노출 0번이에요",
            ],
            "content": "3개월 동안 매일 1포스팅씩 올렸는데 상위노출 한번도 못해봤어요\n\n"
                       "포스팅 수: 92개\n일평균 방문자: 25명\n이웃 수: 67명\n\n"
                       "글 길이도 1500자 이상으로 쓰고 있고 사진도 8장 이상 넣는데\n"
                       "뭐가 문제인건지 진짜 모르겠어요\n\n"
                       "비슷한 경험 있으신 분들 어떻게 극복하셨나요?",
            "tags": ["블로그초보", "상위노출", "블로그고민"],
        },
        {
            "titles": [
                "블로그 접을까 진지하게 고민하고 있어요",
                "6개월 했는데 접을까 말까 심각하게 고민중",
                "블로그 그만둘까 고민되는 순간들이 많아졌어요",
            ],
            "content": "6개월째 블로그 하고 있는데 솔직히 회의감이 들어요\n\n"
                       "현재 상황:\n- 포스팅 150개\n- 일방문자 평균 40명\n- 수익 총 2,300원\n\n"
                       "주변에서는 그 시간에 알바를 하라고 하는데\n"
                       "뭔가 여기서 접으면 아까운 것 같기도 하고\n"
                       "근데 현실적으로 성과가 너무 없으니까 답답해요\n\n"
                       "비슷한 고민 하시는 분들 계신가요?",
            "tags": ["블로그고민", "슬럼프", "블로그현실"],
        },
        {
            "titles": [
                "오늘 처음으로 애드포스트 수익이 찍혔어요",
                "드디어 애드포스트 첫 수익 달성했습니다",
                "블로그 시작 8개월만에 첫 수익을 올렸어요",
            ],
            "content": "0.03달러ㅋㅋㅋ 커피 한 잔에 몇십 년 걸리겠지만 감격스러워요\n\n"
                       "블로그 시작한 지 8개월\n포스팅 수: 130개\n일평균 방문자: 85명\n\n"
                       "금액은 진짜 작지만 '내 글로 수익이 발생했다'는 사실 자체가\n"
                       "엄청난 동기부여가 되네요\n\n"
                       "100달러 모을 때까지 열심히 해보겠습니다 ㅎㅎ",
            "tags": ["애드포스트", "첫수익", "블로그수익"],
        },
        {
            "titles": [
                "서이추 200명 넘었는데 실제 소통하는 이웃은 10명",
                "이웃 200명인데 댓글 다는 사람은 10명도 안돼요",
                "이웃 수만 많고 실질적인 소통이 안되는 것 같아요",
            ],
            "content": "서이추 200명 넘었는데 진짜 소통하는 이웃은 10명 안팎이에요\n\n"
                       "새 글 올리면 좋아요 2-3개, 댓글 1-2개가 전부\n"
                       "대부분 서이추만 하고 실제로 글을 안 읽는 것 같아요\n\n"
                       "이웃 정리를 해야 할까요?\n"
                       "아니면 숫자라도 많은 게 블로그 지수에 도움이 되는 건가요?",
            "tags": ["서이추", "이웃관리", "블로그소통"],
        },
        {
            "titles": [
                "퇴근 후 블로그 하시는 분들 하루 루틴이 궁금해요",
                "직장인 블로거분들 퇴근 후 시간 관리 어떻게 하세요?",
                "회사 다니면서 블로그 하는 분들 일과가 어떻게 되나요",
            ],
            "content": "저는 퇴근하면 보통 7시 반인데 밥 먹고 씻고 하면 9시예요\n\n"
                       "9시부터 11시까지 2시간이 전부인데\n"
                       "글 하나 쓰는데 최소 1시간 반은 걸리거든요\n\n"
                       "사진 편집하고 키워드 찾고 하면 2시간도 모자라요\n"
                       "다들 어떻게 시간 배분하시는지 궁금합니다",
            "tags": ["직장인블로거", "시간관리", "블로그루틴"],
        },
        {
            "titles": [
                "블로그 1년차 솔직 성적표 공개합니다",
                "블로그 운영 1년간의 솔직한 데이터 공유해요",
                "1년 동안 블로그 하면서 모은 모든 수치 공개",
            ],
            "content": "1년 전 오늘 블로그를 시작했어요\n\n"
                       "【1년 성적표】\n"
                       "- 총 포스팅: 287개\n- 일평균 방문자: 180명 (최고 1,200명)\n"
                       "- 총 수익: 47,000원\n- 체험단 당첨: 5회\n\n"
                       "솔직히 기대보다는 낮지만 0에서 시작한 걸 생각하면\n"
                       "나름 성장한 것 같아요\n\n"
                       "2년차에는 일방 500명을 목표로 해보겠습니다!",
            "tags": ["블로그1년", "블로그성장", "블로그현실"],
        },
        {
            "titles": [
                "1일 1포 챌린지 2주만에 실패했어요",
                "매일 글쓰기 도전 보름만에 깨졌습니다",
                "1일1포 챌린지 실패하고 자괴감에 글 올립니다",
            ],
            "content": "2주 연속 매일 글 올리다가 주말에 깨졌어요\n\n"
                       "토요일에 가족 행사가 있어서 글을 못 썼는데\n"
                       "한번 빠지니까 다음 날도 못 쓰겠더라고요\n\n"
                       "14일 연속이었는데 아쉽다\n"
                       "다시 시작해야 하나 고민됩니다\n\n"
                       "1일1포 하시는 분들 중간에 빠졌을 때 어떻게 하세요?",
            "tags": ["1일1포", "챌린지실패", "블로그습관"],
        },
        {
            "titles": [
                "블로그 하면서 생긴 직업병이 있어요",
                "블로그 시작하고 달라진 일상 습관들",
                "블로거가 되면 생기는 현상 공감하시나요",
            ],
            "content": "블로그 한 지 6개월 됐는데 직업병이 생겼어요\n\n"
                       "1. 맛집 가면 먹기 전에 사진부터 찍음\n"
                       "2. 뭘 사도 '이거 리뷰 쓸 수 있겠다' 생각함\n"
                       "3. 여행 가면 글감 모으느라 제대로 못 즐김\n"
                       "4. 다른 블로그 글 보면 키워드부터 분석함\n\n"
                       "공감하시는 분 계신가요? ㅋㅋㅋ",
            "tags": ["블로거일상", "직업병", "블로그공감"],
        },
    ],
    "tip": [
        {
            "titles": [
                "상위노출 되는 글과 안되는 글의 차이점 정리해봤어요",
                "상위노출 성공하는 포스팅의 특징을 분석해봤습니다",
                "제가 분석한 상위노출 글의 공통점 3가지",
            ],
            "content": "블로그 8개월차인데 상위노출 된 글과 안 된 글 30개를 비교해봤습니다\n\n"
                       "【상위노출 된 글의 공통점】\n"
                       "1. 제목 앞쪽에 핵심 키워드 배치\n"
                       "2. 본문 2000자 이상 + 사진 10장 이상\n"
                       "3. 소제목으로 구조화된 글 구성\n"
                       "4. 검색 의도에 맞는 실용적 정보\n\n"
                       "【안 된 글의 공통점】\n"
                       "1. 감성적인 제목 (키워드 없음)\n"
                       "2. 사진 2-3장에 글 500자\n"
                       "3. 일기체로 쭉 나열\n\n"
                       "참고하시면 도움될 거예요!",
            "tags": ["상위노출", "블로그팁", "키워드전략"],
        },
        {
            "titles": [
                "초보 때 알았으면 좋았을 블로그 팁 7가지",
                "블로그 시작할 때 꼭 알아야 할 것들 정리",
                "1년차 블로거가 알려주는 초보 필수 팁",
            ],
            "content": "블로그 1년하면서 초반에 몰라서 삽질한 것들 공유해요\n\n"
                       "1. 카테고리 3-4개로 시작하세요 (너무 많으면 산만함)\n"
                       "2. 처음부터 완벽한 글 쓰려 하지 마세요\n"
                       "3. 이웃 숫자보다 실제 소통이 중요해요\n"
                       "4. 매일 안 써도 됩니다 (주 3회도 충분)\n"
                       "5. 사진은 직접 찍은 게 무조건 유리\n"
                       "6. 발행 시간은 오전 8-10시가 좋았어요\n"
                       "7. 키워드 도구 활용은 필수입니다\n\n"
                       "저는 이거 모르고 3개월 날렸어요ㅋㅋ",
            "tags": ["블로그초보", "블로그팁", "초보가이드"],
        },
        {
            "titles": [
                "키워드 찾는 나만의 루틴을 공유합니다",
                "경쟁 낮은 블루오션 키워드 찾는 방법",
                "매일 10분 투자로 좋은 키워드 찾는 비법",
            ],
            "content": "키워드 찾는게 블로그의 핵심이라고 생각해요\n\n"
                       "제가 매일 하는 루틴:\n"
                       "1. 네이버 검색창에서 자동완성 키워드 확인\n"
                       "2. 블로그 탭에서 상위 글들의 발행일 체크\n"
                       "3. 월간 검색량 500-3000 사이 키워드 선별\n"
                       "4. 상위 블로그 발행량 50개 이하인 키워드 우선\n\n"
                       "이렇게 하면 경쟁 낮은 키워드를 찾을 수 있어요",
            "tags": ["키워드분석", "블루오션", "블로그전략"],
        },
        {
            "titles": [
                "블로그 사진 퀄리티 높이는 현실적인 방법",
                "폰카로도 블로그 사진 예쁘게 찍는 팁",
                "사진 잘 못 찍는 분들을 위한 블로그 사진 가이드",
            ],
            "content": "전문 장비 없어도 됩니다, 폰으로 충분해요\n\n"
                       "제가 실천하는 방법:\n"
                       "- 자연광이 최고 (창가에서 찍기)\n"
                       "- 배경 정리 필수 (지저분하면 사진도 별로)\n"
                       "- 45도 각도가 예쁨 (정면보다 비스듬히)\n"
                       "- 편집은 밝기만 살짝 올리기\n\n"
                       "이것만 해도 사진 퀄리티 확 올라갑니다",
            "tags": ["블로그사진", "사진팁", "폰카촬영"],
        },
        {
            "titles": [
                "글 하나 쓰는데 3시간 걸리던 게 1시간으로 줄었어요",
                "블로그 글쓰기 시간 단축하는 실전 방법",
                "포스팅 속도 높이는 저만의 글쓰기 프로세스 공유",
            ],
            "content": "처음엔 글 하나에 3시간씩 걸렸는데 지금은 1시간이면 돼요\n\n"
                       "제가 쓰는 방법:\n"
                       "1. 사진을 먼저 다 올려놓기\n"
                       "2. 소제목 뼈대 잡기 (3-4개)\n"
                       "3. 각 소제목 아래 내용 채우기\n"
                       "4. 도입부와 마무리는 마지막에\n"
                       "5. 맞춤법은 한번에 마지막 체크\n\n"
                       "핵심은 완벽하려고 하지 않는 것",
            "tags": ["글쓰기팁", "시간관리", "효율적블로깅"],
        },
        {
            "titles": [
                "저품질 블로그 피하기 위해 제가 지키는 규칙들",
                "저품질 안 걸리려면 이것만은 꼭 지키세요",
                "블로그 저품질 예방을 위한 실전 가이드",
            ],
            "content": "저품질 한번 걸리면 회복이 거의 불가능하다고 하더라고요\n\n"
                       "제가 조심하는 것들:\n"
                       "1. 하루 3개 이상 포스팅 금지\n"
                       "2. 다른 글 복붙 절대 안함\n"
                       "3. 광고글만 연속으로 안 씀 (일상글 섞기)\n"
                       "4. 같은 키워드 반복 사용 자제\n\n"
                       "1년 넘게 이렇게 하고 있는데 아직 저품질은 안 걸렸어요",
            "tags": ["저품질방지", "블로그관리", "블로그건강"],
        },
    ],
    "question": [
        {
            "titles": [
                "블로그 지수 이 정도면 괜찮은 건가요?",
                "블로그 3개월차 이 수치가 평균인지 모르겠어요",
                "제 블로그 현황이 정상인지 확인 부탁드려요",
            ],
            "content": "블로그 3개월차입니다\n\n"
                       "일평균 방문자: 30명\n포스팅: 60개\n이웃: 80명\n\n"
                       "이 정도면 평균인가요? 잘 가고 있는 건지 모르겠어요\n"
                       "3개월차 분들 수치가 어느 정도인지 궁금합니다",
            "tags": ["블로그지수", "블로그초보", "성장확인"],
        },
        {
            "titles": [
                "상위노출까지 보통 얼마나 걸리나요?",
                "첫 상위노출 경험하기까지 기간이 궁금해요",
                "상위노출 처음 되기까지 몇 개월 걸리셨어요?",
            ],
            "content": "다들 첫 상위노출까지 얼마나 걸리셨나요?\n\n"
                       "전 2개월째인데 아직 한번도 못해봤거든요\n"
                       "정상인지 느린건지 감이 안 와서요\n\n"
                       "경험 공유해주시면 정말 감사하겠습니다",
            "tags": ["상위노출", "블로그기간", "초보질문"],
        },
        {
            "titles": [
                "이웃이 갑자기 줄었는데 왜일까요?",
                "하루 사이에 이웃 5명이 빠졌어요 이유가 뭘까요",
                "서이추 이웃이 자꾸 줄어드는 원인이 궁금합니다",
            ],
            "content": "어제까지 120명이었는데 오늘 보니까 115명이에요\n\n"
                       "5명이 서이추 끊은건가?\n"
                       "제가 뭘 잘못한 걸까요 ㅠㅠ\n"
                       "글도 열심히 올리고 댓글도 다는데...\n\n"
                       "이런 경험 있으신 분?",
            "tags": ["이웃관리", "서이추", "블로그고민"],
        },
        {
            "titles": [
                "애드센스 승인 받으신 분들 조건이 어땠나요?",
                "애드센스 3번째 거절인데 승인 조건이 궁금해요",
                "구글 애드센스 승인 팁 좀 알려주세요",
            ],
            "content": "3번째 거절당했어요ㅋㅋ\n\n"
                       "현재 상태:\n- 포스팅 40개\n- 방문자 하루 50명 정도\n- 개설 2개월\n\n"
                       "뭐가 문제일까요?\n"
                       "승인받으신 분들 당시 상태가 어땠는지 알려주시면 감사하겠습니다",
            "tags": ["애드센스", "승인거절", "블로그수익화"],
        },
        {
            "titles": [
                "키워드 분석 도구 뭐 쓰시나요?",
                "블로그 키워드 분석할 때 어떤 도구를 사용하세요?",
                "키워드 찾을 때 유용한 도구 추천 부탁드려요",
            ],
            "content": "다들 키워드 분석하고 글 쓴다는데\n"
                       "솔직히 뭘 어떻게 분석하는지 모르겠어요\n\n"
                       "무료로 쓸 수 있는 키워드 분석 도구가 있나요?\n"
                       "초보 눈높이에서 알려주시면 감사하겠습니다",
            "tags": ["키워드분석", "블로그도구", "초보질문"],
        },
        {
            "titles": [
                "글 발행 시간 언제가 좋은가요?",
                "포스팅 올리기 좋은 시간대가 있나요?",
                "발행 시간에 따라 노출 차이가 있나요?",
            ],
            "content": "아침에 올리는 게 좋다 저녁에 올리는 게 좋다\n"
                       "말이 다 달라서 헷갈려요\n\n"
                       "다들 주로 언제 발행하시나요?\n"
                       "경험 공유해주시면 감사합니다",
            "tags": ["발행시간", "블로그팁", "노출전략"],
        },
        {
            "titles": [
                "체험단 자주 하면 블로그에 안좋은가요?",
                "광고성 글이 많으면 블로그 지수에 영향이 있을까요",
                "체험단 비중이 너무 높으면 문제가 되나요",
            ],
            "content": "요즘 체험단을 좀 많이 하고 있는데\n"
                       "광고글 많으면 지수가 떨어진다는 말이 있어서 걱정이에요\n\n"
                       "현재 전체 글 중 40%가 체험단 글인데\n"
                       "적정 비율이 어느 정도인지 궁금합니다",
            "tags": ["체험단", "블로그지수", "광고비중"],
        },
    ],
    "success": [
        {
            "titles": [
                "4개월 만에 드디어 첫 상위노출 성공했어요!",
                "상위노출 처음으로 됐습니다 4개월 걸렸어요!",
                "드디어 첫 상위노출! 포기 안하길 잘했어요",
            ],
            "content": "4개월 만에 처음으로 상위노출 성공했습니다ㅠㅠ\n\n"
                       "'강남 브런치 카페 추천' 키워드로 5위에 올랐어요\n\n"
                       "【그동안의 과정】\n"
                       "- 1개월차: 매일 1포 + 아무 키워드나 씀\n"
                       "- 2개월차: 키워드 분석 시작\n"
                       "- 3개월차: 사진 퀄리티 개선 + 글 길이 2000자+\n"
                       "- 4개월차: 경쟁 낮은 키워드 공략\n\n"
                       "포기하지 마세요 여러분도 할 수 있습니다!!",
            "tags": ["상위노출성공", "블로그성장", "포기금지"],
        },
        {
            "titles": [
                "애드센스 100달러 드디어 달성했습니다!",
                "블로그 1년 2개월만에 첫 애드센스 수익 인출!",
                "첫 구글 애드센스 수익 100달러 달성 후기",
            ],
            "content": "1년 2개월 걸렸지만 드디어 애드센스 100달러 달성했어요\n\n"
                       "【수익 여정】\n"
                       "- 승인까지: 4개월\n- 첫 1달러: 승인 후 2개월\n"
                       "- 100달러: 그로부터 8개월\n\n"
                       "금액은 작지만 내 글로 번 돈이라 의미가 있네요\n\n"
                       "꾸준히 하면 됩니다!",
            "tags": ["애드센스", "수익인증", "100달러"],
        },
        {
            "titles": [
                "체험단 첫 당첨 되었어요!",
                "드디어 체험단 붙었습니다 20번만에!",
                "체험단 20번 신청하고 처음 당첨된 후기",
            ],
            "content": "체험단 신청만 한 20번 한 것 같아요\n"
                       "드디어 처음 당첨됐습니다!!\n\n"
                       "카페 체험단인데 음료 2잔 + 디저트 1개 제공이에요\n\n"
                       "【당첨 당시 블로그 상태】\n"
                       "- 일방문자: 150명\n- 포스팅: 100개\n- 이웃: 200명\n\n"
                       "열심히 리뷰 써야겠어요!",
            "tags": ["체험단", "첫당첨", "블로그성과"],
        },
        {
            "titles": [
                "이웃 500명 달성! 1년 소통 여정 공유합니다",
                "서이추 500명 모으기까지 1년이 걸렸어요",
                "이웃 500명 달성 후기와 소통 노하우",
            ],
            "content": "1년이 걸렸지만 이웃 500명 달성했어요!\n\n"
                       "처음엔 100명도 어려웠는데 꾸준히 소통하니까 늘더라고요\n\n"
                       "【제가 한 것들】\n"
                       "- 매일 10개 블로그에 진심 댓글 달기\n"
                       "- 같은 관심사 블로그 위주로 서이추\n"
                       "- 댓글에 항상 정성 답글\n\n"
                       "숫자에 집착 않고 진짜 소통하는 이웃 만드는 게 중요한 것 같아요",
            "tags": ["이웃500명", "블로그소통", "성장기록"],
        },
        {
            "titles": [
                "일 방문자 1000명 처음 찍었어요!",
                "드디어 일방 1000명 돌파했습니다!",
                "하루 방문자 1000명 달성 후기",
            ],
            "content": "평소에는 100-200명 정도였는데 오늘 갑자기 1000명 넘었어요!\n\n"
                       "확인해보니까 글 하나가 '강릉 맛집' 검색에서 상위에 떴더라고요\n\n"
                       "그 글을 쓸 때 특별히 한 것:\n"
                       "- 직접 방문한 맛집 5곳 비교\n"
                       "- 사진 25장 + 상세 메뉴판\n"
                       "- 본문 3500자\n\n"
                       "역시 콘텐츠 퀄리티가 답인 것 같습니다!",
            "tags": ["일방1000", "방문자급증", "상위노출"],
        },
    ],
}

# ============ 카테고리별 댓글 ============
COMMENT_TEMPLATES_BY_CATEGORY = {
    "free": [
        "저도 완전 공감이에요 비슷한 상황인데 힘내세요!",
        "와 제 얘기인 줄 알았어요 저도 비슷한 시기인데 똑같아요",
        "저도 그랬는데 꾸준히 하니까 6개월쯤에 변화가 왔어요",
        "공감 100% 저도 요즘 슬럼프 와서 고민중이에요",
        "이런 글 보면 위로가 돼요 혼자 고민하는 게 아니구나",
        "저는 1년차인데 아직도 그런 날이 있어요 같이 힘내요!",
        "비슷한 경험인데 저는 그냥 쉬었다가 다시 하니까 나아졌어요",
        "글 읽으면서 많이 공감했어요 파이팅입니다!",
        "ㅋㅋㅋ 진짜 맞아요 블로그 하면서 다들 겪는 일인 듯",
        "응원합니다! 꾸준함이 답이라고 믿어요",
    ],
    "tip": [
        "오 이거 바로 적용해봐야겠어요! 좋은 정보 감사합니다",
        "저도 비슷하게 하고 있는데 소제목 활용하는 거는 몰랐어요",
        "꿀팁이네요! 저장해두고 글 쓸 때마다 확인해야겠어요",
        "체크리스트 너무 유용해요 항상 빠뜨리는 게 있었는데",
        "이거 해보니까 효과 진짜 있었어요 추천합니다!",
        "초보한테 너무 도움되는 글이에요 감사해요!",
        "정리를 너무 잘 해주셨네요 참고할게요!",
        "이 방법 2주 정도 적용해봤는데 확실히 달라졌어요",
        "좋은 정보 공유 감사합니다 바로 실천해보겠습니다",
    ],
    "question": [
        "저도 같은 궁금증이 있었는데 답변들 참고하겠습니다",
        "저도 같은 고민이에요 공감돼요",
        "제 경험으로는 키워드 전략을 바꾸니까 효과가 있었어요",
        "저는 이 문제를 이렇게 해결했어요: 꾸준히 하면 됩니다!",
        "좋은 질문이에요! 저도 배워갑니다",
        "저도 초반에 같은 고민 했었는데 결국 시간이 해결해줬어요",
        "제가 알기로는 보통 3-6개월 정도면 변화가 온다고 해요",
        "비슷한 질문이 많은 걸 보면 다들 같은 고민을 하나봐요",
    ],
    "success": [
        "축하드려요!! 저도 이렇게 되고 싶어요 부러워요",
        "와 대박 축하합니다! 비결이 뭐예요?",
        "저도 열심히 해야겠다는 자극이 되네요 감사합니다",
        "진짜 멋있어요! 포기 안하고 꾸준히 한 보람이 있네요",
        "우와 축하드려요 저도 빨리 이런 글 쓰고 싶어요",
        "동기부여 됩니다! 저도 파이팅 할게요!",
        "이런 성공 후기 보면 힘이 나요 축하합니다!",
        "구체적인 과정 공유해주셔서 감사해요 참고하겠습니다!",
        "역시 꾸준함이 답이네요 저도 포기하지 않겠습니다!",
    ],
}

COMMENT_TEMPLATES_GENERAL = [
    "좋은 글이네요 잘 읽었습니다",
    "공감이에요 ㅎㅎ",
    "오 그렇군요 참고하겠습니다",
    "글 잘 읽었어요~",
    "저도 비슷한 생각이에요",
    "좋은 정보 감사합니다!",
    "응원합니다!",
    "구경 잘 하고 갑니다~",
]

# ============ 데이터 생성 함수 ============

_used_titles = set()


def generate_post_content(category: str) -> Dict:
    """고품질 게시글 내용 생성"""
    global _used_titles
    templates = POST_TEMPLATES.get(category, POST_TEMPLATES["free"])

    random.shuffle(templates)
    for template in templates:
        titles = template["titles"]
        random.shuffle(titles)
        for title in titles:
            if title not in _used_titles:
                _used_titles.add(title)
                return {
                    "title": title,
                    "content": template["content"],
                    "category": category,
                    "tags": template.get("tags", []),
                }

    # 모든 템플릿 사용 시 번호 붙여서 재사용
    template = random.choice(templates)
    title = f"{random.choice(template['titles'])} #{random.randint(1, 9999)}"
    return {
        "title": title,
        "content": template["content"],
        "category": category,
        "tags": template.get("tags", []),
    }


def generate_comment(post_category: str = None) -> str:
    """카테고리 맥락에 맞는 댓글 생성"""
    if post_category and random.random() < 0.7:
        comments = COMMENT_TEMPLATES_BY_CATEGORY.get(
            post_category, COMMENT_TEMPLATES_GENERAL
        )
    else:
        comments = COMMENT_TEMPLATES_GENERAL
    return random.choice(comments)


async def create_posts_batch(count: int, start_user_id: int = 1000) -> List[int]:
    """게시글 배치 생성"""
    posts_data = []
    categories = ["free", "tip", "question", "success"]
    weights = [0.4, 0.3, 0.2, 0.1]

    for i in range(count):
        category = random.choices(categories, weights=weights)[0]
        post = generate_post_content(category)

        days_ago = random.randint(0, 30)
        hours_ago = random.randint(0, 23)
        created_at = (datetime.now() - timedelta(days=days_ago, hours=hours_ago)).isoformat()

        posts_data.append({
            "user_id": start_user_id + random.randint(0, 500),
            "title": post["title"],
            "content": post["content"],
            "category": post["category"],
            "tags": post.get("tags", []),
            "views": random.randint(10, 1000),
            "likes": random.randint(0, 50),
            "comments_count": 0,
            "created_at": created_at,
        })

    try:
        response = supabase.table("posts").insert(posts_data).execute()
        post_ids = [p["id"] for p in response.data]
        print(f"  {len(post_ids)}개 게시글 생성 완료")
        return post_ids
    except Exception as e:
        print(f"  게시글 생성 실패: {e}")
        return []


async def create_comments_batch(post_ids: List[int], comments_per_post: int = 3, start_user_id: int = 1000, post_categories: Dict[int, str] = None):
    """댓글 배치 생성"""
    comments_data = []

    for post_id in post_ids:
        num_comments = random.randint(0, comments_per_post * 2)
        category = post_categories.get(post_id, "free") if post_categories else "free"

        for _ in range(num_comments):
            days_ago = random.randint(0, 7)
            hours_ago = random.randint(0, 23)
            created_at = (datetime.now() - timedelta(days=days_ago, hours=hours_ago)).isoformat()

            comments_data.append({
                "post_id": post_id,
                "user_id": start_user_id + random.randint(0, 500),
                "content": generate_comment(category),
                "created_at": created_at,
            })

    if not comments_data:
        return

    batch_size = 100
    for i in range(0, len(comments_data), batch_size):
        batch = comments_data[i:i+batch_size]
        try:
            supabase.table("post_comments").insert(batch).execute()
        except Exception as e:
            print(f"  댓글 배치 실패: {e}")

    print(f"  {len(comments_data)}개 댓글 생성 완료")

    for post_id in post_ids:
        count = sum(1 for c in comments_data if c["post_id"] == post_id)
        if count > 0:
            try:
                supabase.table("posts").update({"comments_count": count}).eq("id", post_id).execute()
            except:
                pass


async def create_likes_batch(post_ids: List[int], start_user_id: int = 1000):
    """좋아요 배치 생성"""
    likes_data = []

    for post_id in post_ids:
        num_likes = random.randint(0, 30)
        used_users = set()

        for _ in range(num_likes):
            user_id = start_user_id + random.randint(0, 500)
            if user_id not in used_users:
                used_users.add(user_id)
                likes_data.append({
                    "post_id": post_id,
                    "user_id": user_id,
                })

    if not likes_data:
        return

    batch_size = 100
    success_count = 0
    for i in range(0, len(likes_data), batch_size):
        batch = likes_data[i:i+batch_size]
        try:
            supabase.table("post_likes").insert(batch).execute()
            success_count += len(batch)
        except Exception as e:
            pass

    print(f"  {success_count}개 좋아요 생성 완료")


async def create_user_points_batch(count: int = 500, start_user_id: int = 1000):
    """사용자 포인트 배치 생성"""
    users_data = []

    for i in range(count):
        user_id = start_user_id + i
        total_points = random.randint(0, 5000)

        if total_points >= 25000:
            level, level_name = 6, "Master"
        elif total_points >= 10000:
            level, level_name = 5, "Diamond"
        elif total_points >= 5000:
            level, level_name = 4, "Platinum"
        elif total_points >= 2000:
            level, level_name = 3, "Gold"
        elif total_points >= 500:
            level, level_name = 2, "Silver"
        else:
            level, level_name = 1, "Bronze"

        users_data.append({
            "user_id": user_id,
            "total_points": total_points,
            "weekly_points": random.randint(0, min(total_points, 500)),
            "monthly_points": random.randint(0, min(total_points, 2000)),
            "level": level,
            "level_name": level_name,
            "streak_days": random.randint(0, 30),
        })

    batch_size = 100
    for i in range(0, len(users_data), batch_size):
        batch = users_data[i:i+batch_size]
        try:
            supabase.table("user_points").upsert(batch).execute()
        except Exception as e:
            print(f"  사용자 포인트 배치 경고: {e}")

    print(f"  {len(users_data)}명 사용자 포인트 생성 완료")


async def main():
    """메인 실행"""
    print("=" * 50)
    print("커뮤니티 시드 데이터 생성 시작 (고품질 버전)")
    print("=" * 50)

    TOTAL_POSTS = 10000
    BATCH_SIZE = 100
    START_USER_ID = 1000

    print(f"\n목표: 게시글 {TOTAL_POSTS}개")
    print(f"배치 크기: {BATCH_SIZE}개씩")

    # 1. 사용자 포인트 생성
    print("\n[1/4] 사용자 포인트 생성 중...")
    await create_user_points_batch(500, START_USER_ID)

    # 2. 게시글 생성 (배치)
    print(f"\n[2/4] 게시글 {TOTAL_POSTS}개 생성 중...")
    all_post_ids = []

    for batch_num in range(TOTAL_POSTS // BATCH_SIZE):
        print(f"  배치 {batch_num + 1}/{TOTAL_POSTS // BATCH_SIZE}...")
        post_ids = await create_posts_batch(BATCH_SIZE, START_USER_ID)
        all_post_ids.extend(post_ids)
        await asyncio.sleep(0.5)

    print(f"  총 {len(all_post_ids)}개 게시글 생성됨")

    # 3. 댓글 생성
    print(f"\n[3/4] 댓글 생성 중...")
    for i in range(0, len(all_post_ids), 100):
        batch_ids = all_post_ids[i:i+100]
        await create_comments_batch(batch_ids, 3, START_USER_ID)
        await asyncio.sleep(0.3)

    # 4. 좋아요 생성
    print(f"\n[4/4] 좋아요 생성 중...")
    for i in range(0, len(all_post_ids), 100):
        batch_ids = all_post_ids[i:i+100]
        await create_likes_batch(batch_ids, START_USER_ID)
        await asyncio.sleep(0.3)

    print("\n" + "=" * 50)
    print("시드 데이터 생성 완료!")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
