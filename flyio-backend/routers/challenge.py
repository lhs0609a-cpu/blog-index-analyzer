"""
블로그 챌린지 API 라우터
30일 챌린지, 게이미피케이션, 동기부여 콘텐츠
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List
import logging
import base64
import os
import uuid
from datetime import datetime

from database.challenge_db import (
    init_challenge_tables,
    start_challenge,
    get_challenge_status,
    get_today_missions,
    complete_mission,
    get_gamification_profile,
    get_leaderboard,
    get_motivation,
    get_all_badges,
    log_writing,
    get_challenge_content,
    get_progress_calendar,
    CHALLENGE_CONTENT,
    LEVEL_REQUIREMENTS
)
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

# 30일 챌린지 상세 학습 콘텐츠 및 체크리스트
LEARNING_CONTENT = {
    1: {
        "learn_content": """📚 블로그란 무엇인가?

블로그(Blog)는 'Web + Log'의 합성어로, 인터넷에 기록하는 일기장이에요.

🎯 블로그의 종류:
• 일상 블로그: 일상, 여행, 맛집 등 개인 경험 공유
• 정보 블로그: 특정 분야의 전문 지식 공유
• 리뷰 블로그: 제품, 서비스 리뷰
• 수익형 블로그: 애드센스, 체험단 등 수익 창출

💡 블로그가 주는 가치:
1. 나만의 온라인 공간을 가질 수 있어요
2. 기록하면서 생각이 정리돼요
3. 같은 관심사를 가진 사람들과 소통할 수 있어요
4. 꾸준히 하면 수익도 창출할 수 있어요

🚀 네이버 블로그의 장점:
• 한국에서 가장 큰 검색 점유율
• 초보자도 쉽게 시작 가능
• 이웃 시스템으로 소통하기 좋음""",
        "checklist": [
            "네이버 블로그 계정 만들기 (이미 있다면 체크)",
            "블로그 프로필 사진 설정하기",
            "블로그 이름 정하기"
        ]
    },
    2: {
        "learn_content": """📚 좋은 블로그의 조건

성공적인 블로그에는 공통점이 있어요!

✅ 좋은 블로그의 5가지 조건:

1. 명확한 주제
   - 무엇에 대해 쓰는 블로그인지 한눈에 알 수 있어요
   - "맛집 블로그", "육아 블로그" 처럼 정체성이 뚜렷해요

2. 꾸준한 업로드
   - 최소 주 2-3회 꾸준히 글을 올려요
   - 독자들이 다시 찾아올 이유를 만들어요

3. 정성 들인 콘텐츠
   - 사진이 깨끗하고 보기 좋아요
   - 글이 읽기 쉽게 구성되어 있어요
   - 실제로 도움이 되는 정보가 있어요

4. 독자와의 소통
   - 댓글에 성실히 답변해요
   - 이웃 블로거들과 교류해요

5. 나만의 개성
   - 글쓰는 스타일이 있어요
   - 다른 블로그와 차별화 포인트가 있어요""",
        "checklist": [
            "좋아하는 블로그 1개 찾기",
            "그 블로그의 좋은 점 3가지 적어보기",
            "내 블로그에 적용할 점 1가지 정하기"
        ]
    },
    3: {
        "learn_content": """📚 첫 글 작성법

첫 글이 가장 어렵죠? 걱정 마세요, 완벽하지 않아도 괜찮아요!

✍️ 첫 글로 좋은 주제:
• 자기소개 글
• 블로그를 시작하게 된 이유
• 앞으로 어떤 글을 쓸 건지 소개

📝 자기소개 글 작성 가이드:

1. 인사로 시작하기
   "안녕하세요, [닉네임]입니다!"

2. 간단한 자기소개
   - 나는 누구인지
   - 관심사나 직업
   - 좋아하는 것들

3. 블로그 소개
   - 왜 블로그를 시작했는지
   - 어떤 글을 쓸 건지
   - 독자에게 약속하는 것

4. 마무리 인사
   "자주 놀러와 주세요!"

💡 TIP:
• 500자 이상 쓰기
• 사진 최소 3장 넣기
• 해시태그 10개 이상 달기""",
        "checklist": [
            "글 제목 정하기 (예: [첫 글] 안녕하세요, OOO입니다!)",
            "본문 500자 이상 작성하기",
            "프로필 관련 이미지 최소 1장 넣기",
            "해시태그 10개 이상 달기",
            "발행하기!"
        ]
    },
    4: {
        "learn_content": """📚 제목의 중요성

제목은 글의 얼굴이에요. 80%의 사람들은 제목만 보고 클릭을 결정해요!

🎯 좋은 제목의 조건:

1. 키워드를 앞에 배치
   ❌ "오늘 다녀온 강남역 맛집 소개"
   ✅ "강남역 맛집 추천 | 분위기 좋은 파스타집"

2. 구체적인 숫자 활용
   ❌ "여행 준비물"
   ✅ "제주도 여행 준비물 10가지 체크리스트"

3. 호기심 유발
   ❌ "다이어트 방법"
   ✅ "한 달 만에 5kg 뺀 직장인의 다이어트 비법"

4. 적절한 길이 (20-40자)
   너무 짧으면 정보 부족
   너무 길면 읽기 힘들어요

📌 제목 공식:
• [키워드] + [숫자] + [베네핏]
• "강남 맛집 TOP 5 | 데이트하기 좋은 레스토랑"
• "아이패드 필름 추천 3가지 | 실제 사용 후기"

💡 같은 내용이라도 제목에 따라 클릭률이 2-3배 차이나요!""",
        "checklist": [
            "내 관심 분야 키워드 1개 정하기",
            "그 키워드로 제목 5개 만들어보기",
            "가장 클릭하고 싶은 제목 1개 선택하기"
        ]
    },
    5: {
        "learn_content": """📚 썸네일 기초

썸네일은 글의 미리보기 이미지예요. 좋은 썸네일은 클릭을 부릅니다!

🎨 좋은 썸네일 조건:

1. 깔끔한 디자인
   - 배경이 복잡하지 않아요
   - 글자가 잘 읽혀요
   - 색상이 3가지 이내

2. 핵심 내용 전달
   - 무슨 글인지 한눈에 알 수 있어요
   - 텍스트는 7자 이내로

3. 통일된 스타일
   - 비슷한 느낌으로 만들면 브랜딩이 돼요

🛠️ 무료 디자인 도구:
• 미리캔버스 (miricanvas.com) - 한국어 지원
• 캔바 (canva.com) - 템플릿 다양
• 망고보드 (mangoboard.net)

📐 네이버 블로그 썸네일 사이즈:
• 권장: 1200 x 630 픽셀
• 비율: 1.91:1

💡 TIP:
• 직접 찍은 사진 + 간단한 텍스트가 가장 효과적
• 저작권 무료 이미지: Unsplash, Pixabay""",
        "checklist": [
            "미리캔버스 또는 캔바 가입하기",
            "블로그 썸네일 템플릿 둘러보기",
            "간단한 썸네일 1개 만들어보기"
        ]
    },
    6: {
        "learn_content": """📚 카테고리 설정

카테고리는 블로그의 뼈대예요. 잘 정리된 카테고리는 독자가 원하는 글을 쉽게 찾게 해줘요!

📁 카테고리 설정 원칙:

1. 3-5개로 시작
   - 너무 많으면 복잡해요
   - 글이 쌓이면 세분화하기

2. 명확한 이름
   ❌ "기타", "잡다한 것"
   ✅ "맛집 리뷰", "일상 기록", "여행 이야기"

3. 독자 관점으로
   - 내가 아닌 방문자 입장에서 생각하기
   - 어떤 글을 찾으러 올까?

📌 카테고리 예시:

[맛집 블로거]
• 서울 맛집
• 카페 탐방
• 배달 음식 리뷰
• 요리 레시피

[육아 블로거]
• 육아 일기
• 육아템 리뷰
• 아이와 놀거리
• 육아 정보

💡 카테고리 순서도 중요해요!
가장 중요한 카테고리를 위에 배치하세요.""",
        "checklist": [
            "내 블로그 메인 주제 1개 정하기",
            "관련 카테고리 3-5개 리스트 만들기",
            "블로그에 카테고리 설정하기"
        ]
    },
    7: {
        "learn_content": """📚 1주차 정리

첫 주를 완료하셨군요! 🎉 정말 대단해요!

📊 1주차에 배운 것들:
• Day 1: 블로그란 무엇인가
• Day 2: 좋은 블로그의 조건
• Day 3: 첫 글 작성법
• Day 4: 제목의 중요성
• Day 5: 썸네일 기초
• Day 6: 카테고리 설정

✅ 1주차 체크리스트:
□ 블로그 계정 만들기
□ 프로필 설정하기
□ 첫 글 발행하기
□ 카테고리 정하기

🎯 2주차 예고:
다음 주에는 "습관 형성"을 배워요!
• 글감 찾는 방법
• 다양한 글쓰기 (일상, 정보, 리뷰)
• 나만의 루틴 만들기

💪 회고는 성장의 시작이에요!
이번 주 느낀 점을 정리하면 다음 주가 더 좋아져요.""",
        "checklist": [
            "1주차 중 가장 인상 깊었던 것 적기",
            "아직 못한 것 1가지 체크하기",
            "1주차 소감 글 발행하기"
        ]
    },
    8: {
        "learn_content": """📚 글감 찾는 법

"쓸 게 없어요"는 가장 많이 듣는 고민이에요. 하지만 글감은 어디에나 있어요!

🔍 글감 찾는 7가지 방법:

1. 일상에서 찾기
   - 오늘 먹은 음식
   - 가본 장소
   - 구매한 물건
   - 배운 것

2. 관심사에서 찾기
   - 좋아하는 분야 깊게 파기
   - 최근 관심 갖게 된 것

3. 질문에서 찾기
   - 주변에서 자주 받는 질문
   - 내가 궁금했던 것

4. 계절/시즌에서 찾기
   - 명절, 연말, 시험 시즌
   - 계절별 콘텐츠

5. 트렌드에서 찾기
   - 실시간 검색어
   - 유행하는 것들

6. 후기에서 찾기
   - 제품/서비스 사용 후기
   - 책/영화/드라마 감상

7. 과거에서 찾기
   - 예전에 했던 경험
   - 오래된 사진첩

💡 글감 메모 습관을 들이세요!
떠오를 때 바로 메모하지 않으면 잊어버려요.""",
        "checklist": [
            "메모 앱 또는 노트 준비하기",
            "지금 떠오르는 글감 5개 적기",
            "글감 중 1개 선택해서 제목 만들기"
        ]
    },
    9: {
        "learn_content": """📚 일상 글쓰기

일상 글은 가장 쓰기 쉬운 글이에요. 특별하지 않아도 괜찮아요!

✍️ 일상 글 잘 쓰는 방법:

1. 구체적으로 쓰기
   ❌ "오늘 맛있는 걸 먹었다"
   ✅ "강남역 골목에서 찾은 숨은 파스타집, 크림 파스타가 진짜 부드러웠다"

2. 감정을 담기
   - 어떤 기분이었는지
   - 왜 그렇게 느꼈는지

3. 사진과 함께
   - 글만 있으면 지루해요
   - 과정 사진이 좋아요

4. 독자에게 말하듯
   - "여러분도 가보셨나요?"
   - "다음에 또 갈 것 같아요"

📝 일상 글 구조:
1. 도입: 오늘 있었던 일 소개
2. 본문: 자세한 이야기 + 사진
3. 마무리: 소감 + 독자에게 질문

💡 일상 글의 힘:
• 가장 진정성 있는 글
• 꾸준히 쓰기 좋은 소재
• 나중에 추억이 됨""",
        "checklist": [
            "오늘 있었던 일 중 하나 선택하기",
            "500자 이상 자세히 쓰기",
            "관련 사진 3장 이상 넣기",
            "발행하기"
        ]
    },
    10: {
        "learn_content": """📚 정보성 글쓰기

정보성 글은 독자에게 실질적인 도움을 주는 글이에요. 검색 유입에 가장 좋아요!

📖 정보성 글의 종류:
• How-to: "~하는 방법"
• 리스트: "~추천 TOP 10"
• 가이드: "완벽 가이드"
• 비교: "A vs B 비교"

✍️ 정보성 글 잘 쓰는 방법:

1. 명확한 주제
   - 한 가지 주제에 집중
   - 제목에 키워드 포함

2. 체계적인 구조
   - 소제목으로 구분
   - 번호 매기기
   - 핵심 강조

3. 구체적인 정보
   - 가격, 위치, 시간 등
   - 직접 경험한 내용
   - 출처 명시

4. 시각 자료 활용
   - 스크린샷
   - 비교표
   - 단계별 사진

💡 정보성 글의 장점:
• 검색에 잘 노출됨
• 체류시간이 길어짐
• 저장/공유가 많음""",
        "checklist": [
            "내가 잘 아는 분야 1개 선택하기",
            "소제목 3개 이상으로 구조 잡기",
            "각 소제목에 3문장 이상 쓰기",
            "1000자 이상 정보글 발행하기"
        ]
    },
    11: {
        "learn_content": """📚 리뷰 글쓰기

리뷰 글은 구매를 고민하는 사람들에게 큰 도움이 돼요!

📝 좋은 리뷰의 조건:

1. 솔직함
   - 장점과 단점 모두 작성
   - 과장하지 않기

2. 구체성
   - 가격, 구매처
   - 사용 기간
   - 실제 사용 사진

3. 비교
   - 비슷한 제품과 비교
   - 기대 vs 실제

📋 리뷰 글 구조:
1. 구매 계기
2. 제품 언박싱/첫인상
3. 실제 사용 후기
4. 장점 3가지
5. 단점 1-2가지
6. 총평 & 추천 대상

💡 리뷰 잘 쓰는 팁:
• 사진은 직접 촬영
• 디테일 컷 포함
• 손 or 다른 물건과 크기 비교
• 사용 전후 비교""",
        "checklist": [
            "최근 구매한 제품 1개 선택하기",
            "제품 사진 5장 이상 촬영하기",
            "장점 3가지, 단점 1가지 정리하기",
            "리뷰 글 발행하기"
        ]
    },
    12: {
        "learn_content": """📚 맛집 글쓰기

맛집 글은 네이버 블로그에서 가장 인기 있는 장르예요!

🍽️ 맛집 글 필수 정보:
• 상호명
• 주소 (지도 포함)
• 영업시간
• 주차 가능 여부
• 대표 메뉴 + 가격

📸 맛집 사진 가이드:
1. 외관 사진
2. 내부 분위기
3. 메뉴판
4. 음식 전체 컷
5. 음식 클로즈업
6. 먹는 중 (젓가락 등)

✍️ 맛집 글 구조:
1. 방문 계기
2. 위치/주차 정보
3. 분위기
4. 메뉴 소개 + 가격
5. 맛 평가
6. 총평 + 재방문 의사

💡 맛집 글 팁:
• 사진은 10장 이상
• 음식 사진은 밝게
• 가격 정보 필수
• 솔직한 맛 평가""",
        "checklist": [
            "최근 방문한 식당 1곳 선택하기",
            "관련 사진 10장 이상 준비하기",
            "메뉴, 가격, 위치 정보 정리하기",
            "맛집 리뷰 발행하기"
        ]
    },
    13: {
        "learn_content": """📚 글쓰기 루틴 만들기

습관이 되면 글쓰기가 쉬워져요!

⏰ 글쓰기 루틴 만들기:

1. 시간 정하기
   - 매일 같은 시간에
   - 아침 or 밤 (집중 가능한 시간)
   - 최소 30분~1시간

2. 장소 정하기
   - 항상 같은 자리에서
   - 방해받지 않는 곳
   - 책상 정리

3. 트리거 만들기
   - 커피 한 잔 마시고 시작
   - 음악 틀고 시작
   - 스트레칭 후 시작

4. 목표 설정
   - 하루 500자
   - 주 3회 발행
   - 작은 목표부터

📅 추천 루틴 예시:
• 아침형: 기상 → 커피 → 30분 글쓰기 → 출근
• 저녁형: 퇴근 → 저녁 → 1시간 글쓰기 → 취침

💡 루틴의 힘:
• 3주만 지키면 습관이 됨
• 영감을 기다리지 않아도 됨
• 꾸준함이 실력을 만듦""",
        "checklist": [
            "글쓰기 시간 정하기 (예: 오후 9시)",
            "글쓰기 장소 정하기",
            "나만의 트리거 1가지 정하기",
            "오늘부터 바로 실천하기"
        ]
    },
    14: {
        "learn_content": """📚 2주차 정리

2주를 완료하셨어요! 🎉 이제 절반 가까이 왔어요!

📊 2주차에 배운 것들:
• Day 8: 글감 찾는 법
• Day 9: 일상 글쓰기
• Day 10: 정보성 글쓰기
• Day 11: 리뷰 글쓰기
• Day 12: 맛집 글쓰기
• Day 13: 글쓰기 루틴 만들기

✅ 2주차 체크리스트:
□ 글감 10개 리스트 만들기
□ 일상 글 1편 발행
□ 정보성/리뷰 글 1편 발행
□ 글쓰기 루틴 정하기

📈 성장 체크:
• 첫 주보다 글쓰기가 쉬워졌나요?
• 어떤 종류의 글이 가장 재미있었나요?
• 루틴을 지키고 있나요?

🎯 3주차 예고:
다음 주에는 "기술 향상"을 배워요!
• SEO 기초
• 검색 최적화
• 이미지 활용법""",
        "checklist": [
            "2주차 중 가장 재미있던 글 종류 적기",
            "앞으로 더 쓰고 싶은 글 유형 정하기",
            "2주차 회고 글 발행하기"
        ]
    },
    15: {
        "learn_content": """📚 SEO 기초

SEO(검색엔진최적화)는 내 글이 검색에 잘 노출되게 하는 기술이에요!

🔍 SEO가 중요한 이유:
• 검색으로 들어오는 방문자 = 진짜 관심 있는 독자
• 한 번 쓴 글이 계속 방문자를 데려옴
• 블로그 성장의 핵심

📌 네이버 SEO 기본 원칙:

1. 키워드 선정
   - 사람들이 검색하는 단어 사용
   - 경쟁이 적은 키워드 찾기

2. 제목 최적화
   - 키워드를 제목 앞쪽에
   - 20-40자 사이

3. 본문 최적화
   - 키워드 자연스럽게 반복
   - 소제목에도 키워드 포함

4. 콘텐츠 품질
   - 1500자 이상
   - 이미지 5장 이상
   - 체류시간이 길어지는 글

💡 블랭크의 키워드 검색을 활용해보세요!
상위 블로그의 특징을 분석할 수 있어요.""",
        "checklist": [
            "블랭크의 키워드 검색 메뉴 들어가기",
            "내 관심 키워드 5개 검색해보기",
            "경쟁이 가장 적은 키워드 1개 찾기"
        ]
    },
    16: {
        "learn_content": """📚 제목 최적화

제목은 SEO에서 가장 중요한 요소예요!

🎯 검색에 잘 노출되는 제목:

1. 키워드 위치
   ✅ "강남 맛집 추천 | 분위기 좋은 곳"
   ❌ "분위기 좋은 곳 강남 맛집 추천"
   → 키워드는 앞에!

2. 제목 길이
   • 20-40자가 적당
   • 검색 결과에서 잘리지 않게

3. 숫자 활용
   • "TOP 5", "3가지 방법"
   • 구체적인 느낌을 줌

4. 구분자 활용
   • | (파이프)
   • - (대시)
   • 가독성 UP

📝 제목 공식 모음:
• [키워드] 추천 TOP [숫자]
• [키워드] 완벽 가이드
• [키워드] 후기 | 실제 사용 [기간]
• [장소] [키워드] 솔직 후기

💡 블랭크의 AI 제목 생성을 활용해보세요!""",
        "checklist": [
            "블랭크 AI 도구에서 '제목 생성' 선택하기",
            "키워드 입력 후 제목 10개 생성하기",
            "가장 마음에 드는 제목 3개 저장하기"
        ]
    },
    17: {
        "learn_content": """📚 본문 구조화

잘 구조화된 글은 읽기 쉽고, SEO에도 유리해요!

📋 글 구조의 기본:

1. 도입부 (서론)
   - 글의 주제 소개
   - 독자의 관심 끌기
   - 키워드 포함

2. 본문 (소제목으로 구분)
   - H2, H3 태그 활용
   - 소제목에도 키워드
   - 적절한 문단 나누기

3. 결론
   - 핵심 정리
   - 독자에게 한마디

✍️ 소제목 활용법:
• 내용을 미리 알려주기
• 훑어보기 좋게
• 3-5개 정도가 적당

📝 구조 예시:
```
[제목] 제주도 3박4일 여행 코스 추천

[도입] 제주도 여행을 계획하시나요?

[소제목1] Day 1: 서쪽 해안 코스
[소제목2] Day 2: 중문 관광단지
[소제목3] Day 3: 동쪽 성산일출봉
[소제목4] Day 4: 시내 맛집 투어

[결론] 이 코스로 제주도를 완벽하게!
```""",
        "checklist": [
            "쓰고 싶은 주제 1개 정하기",
            "소제목 3개 이상 먼저 정하기",
            "각 소제목별 3문장 이상 쓰기",
            "소제목을 활용한 글 발행하기"
        ]
    },
    18: {
        "learn_content": """📚 이미지 최적화

이미지는 글의 품질을 높이고 체류시간을 늘려요!

📸 이미지 활용 원칙:

1. 적절한 수량
   • 최소 5장 이상
   • 300-500자당 1장
   • 너무 많아도 ❌

2. 이미지 품질
   • 밝고 선명하게
   • 흔들리지 않게
   • 적절한 크기 (가로 800px 이상)

3. 대체 텍스트 (ALT)
   • 이미지 설명 입력
   • 키워드 포함
   • 이미지 검색 노출에 도움

4. 배치
   • 관련 내용 아래에
   • 연속으로 너무 많이 ❌
   • 글과 이미지 번갈아가며

🖼️ 이미지 종류:
• 직접 촬영한 사진 (가장 좋음)
• 스크린샷
• 인포그래픽
• 저작권 무료 이미지

💡 저작권 무료 사이트:
• Unsplash
• Pixabay
• Pexels""",
        "checklist": [
            "이미지 10장 이상 포함된 글 주제 정하기",
            "직접 촬영 사진 위주로 준비하기",
            "각 이미지에 대체 텍스트 입력하기",
            "이미지 풍부한 글 발행하기"
        ]
    },
    19: {
        "learn_content": """📚 해시태그 전략

해시태그는 글의 카테고리를 알려주고 검색 노출을 도와요!

#️⃣ 해시태그 기본 원칙:

1. 개수
   • 10-15개가 적당
   • 너무 적으면 노출 ↓
   • 너무 많으면 스팸 느낌

2. 종류
   • 대표 키워드: #강남맛집
   • 세부 키워드: #강남파스타맛집
   • 지역 태그: #강남역맛집
   • 감성 태그: #데이트코스

3. 배치
   • 글 마지막에 모아서
   • 또는 관련 문단 아래에

📝 해시태그 공식:
• 메인 키워드 3개
• 세부 키워드 5개
• 지역/상황 태그 3개
• 감성/트렌드 태그 2개

💡 블랭크의 해시태그 추천 기능을 사용해보세요!
키워드를 입력하면 관련 해시태그를 추천해줘요.""",
        "checklist": [
            "블랭크 AI 도구에서 '해시태그 추천' 선택하기",
            "메인 키워드로 해시태그 추천받기",
            "추천된 태그 중 10개 선택하기",
            "기존 글에 해시태그 추가하기"
        ]
    },
    20: {
        "learn_content": """📚 발행 시간

글을 언제 발행하느냐에 따라 초기 반응이 달라져요!

⏰ 최적의 발행 시간:

1. 평일
   • 아침: 7:00 ~ 9:00 (출근 전)
   • 점심: 12:00 ~ 13:00 (점심시간)
   • 저녁: 19:00 ~ 21:00 (퇴근 후)

2. 주말
   • 오전: 10:00 ~ 12:00
   • 오후: 14:00 ~ 17:00

📊 주제별 최적 시간:
• 맛집: 11-12시 (점심 전)
• 뷰티: 19-21시 (퇴근 후)
• 육아: 21-23시 (아이 재운 후)
• 일반 정보: 아침 7-9시

💡 발행 시간 팁:
• 꾸준히 같은 시간에 발행
• 독자가 활동하는 시간 파악
• 글 예약 기능 활용

📈 네이버 블로그 통계에서
"시간대별 방문자"를 확인해보세요!""",
        "checklist": [
            "내 블로그 방문자 시간대 확인하기",
            "나만의 최적 발행 시간 정하기",
            "글 예약 발행 기능 사용해보기"
        ]
    },
    21: {
        "learn_content": """📚 3주차 정리

3주 완료! 🎉 이제 SEO 기초를 알게 되셨어요!

📊 3주차에 배운 것들:
• Day 15: SEO 기초
• Day 16: 제목 최적화
• Day 17: 본문 구조화
• Day 18: 이미지 최적화
• Day 19: 해시태그 전략
• Day 20: 발행 시간

✅ 3주차 체크포인트:
□ 키워드 검색 해봤다
□ 소제목으로 글 구조화했다
□ 이미지 10장 이상 글 썼다
□ 해시태그 10개 이상 달았다

📈 성장 체크:
• SEO가 뭔지 이해했나요?
• 키워드를 의식하며 글을 쓰나요?
• 구조적인 글쓰기가 되나요?

🎯 4주차 예고:
마지막 주에는 "성장 가속"을 배워요!
• 키워드 분석 심화
• 경쟁 분석
• 상위 노출 전략""",
        "checklist": [
            "3주차에 가장 도움 된 내용 적기",
            "앞으로 가장 신경 쓸 SEO 요소 정하기",
            "3주차 회고 글 발행하기"
        ]
    },
    22: {
        "learn_content": """📚 키워드 분석

블루오션 키워드를 찾으면 상위 노출이 쉬워져요!

🔍 키워드 분석이란?
• 사람들이 뭘 검색하는지 파악
• 경쟁이 적은 키워드 찾기
• 내가 쓸 수 있는 주제 발굴

📊 좋은 키워드의 조건:

1. 검색량
   • 너무 적으면 방문자 ↓
   • 월 500회 이상 추천

2. 경쟁도
   • 상위 블로그 지수가 낮으면 좋음
   • 블랭크에서 확인 가능

3. 내 전문성
   • 내가 쓸 수 있는 주제인가
   • 진정성 있게 쓸 수 있는가

🎯 블루오션 키워드 찾는 법:
• 메인 키워드 + 세부 키워드
  예: "맛집" → "강남역 점심 맛집"
• 롱테일 키워드 노리기
  예: "다이어트" → "직장인 야식 다이어트"

💡 블랭크의 블루오션 키워드 기능을 사용해보세요!""",
        "checklist": [
            "내 블로그 주제 관련 메인 키워드 3개 정하기",
            "블랭크에서 각 키워드 검색해보기",
            "경쟁도 낮은 키워드 1개 찾기"
        ]
    },
    23: {
        "learn_content": """📚 경쟁 분석

상위 노출 블로그를 분석하면 방향이 보여요!

🔎 경쟁 분석이란?
• 상위 1-10위 블로그 살펴보기
• 공통점 찾기
• 내 글에 적용할 점 찾기

📋 분석 항목:

1. 제목
   • 키워드 위치
   • 제목 길이
   • 사용된 단어

2. 본문
   • 글자 수
   • 소제목 개수
   • 이미지 수

3. 블로그 지수
   • 레벨
   • 총 포스팅 수
   • 이웃 수

4. 콘텐츠 특징
   • 어떤 정보를 담고 있는지
   • 이미지 스타일
   • 글쓰기 톤

💡 블랭크 키워드 검색에서
상위 13개 블로그의 지수와
글자수, 사진수를 확인할 수 있어요!""",
        "checklist": [
            "타겟 키워드로 검색하기",
            "상위 5개 블로그 제목 패턴 분석하기",
            "평균 글자수, 이미지수 파악하기",
            "내 글에 적용할 점 3가지 적기"
        ]
    },
    24: {
        "learn_content": """📚 상위 노출 전략

분석한 것을 바탕으로 상위 노출을 노려봐요!

🎯 상위 노출 체크리스트:

1. 키워드 전략
   □ 제목 앞에 키워드
   □ 본문에 키워드 5회 이상
   □ 소제목에 키워드 포함
   □ 해시태그에 키워드

2. 콘텐츠 품질
   □ 상위글 평균 이상 글자수
   □ 이미지 10장 이상
   □ 소제목 3개 이상
   □ 구체적인 정보 포함

3. 블로그 관리
   □ 꾸준한 발행 (주 3회 이상)
   □ 댓글 소통
   □ 이웃 관리

4. 기술적 요소
   □ 대체 텍스트 입력
   □ 적절한 해시태그
   □ 최적 시간 발행

💡 상위 노출은 한 번에 되지 않아요.
꾸준히 좋은 글을 쓰면 자연스럽게 올라갑니다!""",
        "checklist": [
            "경쟁 분석한 키워드 선택하기",
            "상위글 평균보다 긴 글 작성하기",
            "모든 체크리스트 확인 후 발행하기"
        ]
    },
    25: {
        "learn_content": """📚 방문자 분석

데이터를 보면 성장 방향이 보여요!

📊 확인해야 할 통계:

1. 일일 방문자 수
   • 추세 파악
   • 급증/급감 원인 분석

2. 유입 경로
   • 검색 유입 비율
   • 이웃 피드 유입
   • 외부 링크 유입

3. 인기 글
   • 어떤 글이 인기인지
   • 왜 인기인지 분석

4. 검색 유입 키워드
   • 어떤 검색어로 들어오는지
   • 의도하지 않은 키워드 발견

5. 체류시간
   • 오래 머무는 글
   • 빠르게 나가는 글

💡 네이버 블로그 통계 보는 법:
내 블로그 → 관리 → 통계

📈 데이터 기반 개선:
• 인기 글과 비슷한 주제로 더 쓰기
• 유입 키워드로 새 글 쓰기
• 체류시간 긴 글 스타일 참고""",
        "checklist": [
            "네이버 블로그 통계 들어가기",
            "최근 7일 방문자 수 확인하기",
            "가장 인기 있는 글 TOP 3 확인하기",
            "인사이트 3가지 적어보기"
        ]
    },
    26: {
        "learn_content": """📚 콘텐츠 리사이클링

과거 글을 업데이트하면 새 글처럼 효과가 있어요!

♻️ 리사이클링이란?
• 기존 글 내용 보강
• 최신 정보로 업데이트
• 새 이미지 추가

🔄 리사이클링 대상:
1. 조회수 높았던 글
2. 검색 유입이 있는 글
3. 시즌/트렌드 관련 글
4. 정보가 바뀐 글

📝 리사이클링 방법:

1. 내용 보강
   • 500자 이상 추가
   • 새로운 정보 추가
   • 독자 질문에 답변 추가

2. 이미지 추가
   • 최신 사진으로 교체
   • 새 이미지 5장 이상 추가

3. SEO 개선
   • 제목 다시 검토
   • 해시태그 추가
   • 소제목 추가

💡 업데이트 후 글 상단에
"[업데이트] 2024년 1월 최신 정보"
이런 식으로 표시해도 좋아요!""",
        "checklist": [
            "과거 인기글 중 업데이트할 글 1개 선택",
            "내용 500자 이상 추가하기",
            "이미지 3장 이상 추가하기",
            "수정 후 발행하기"
        ]
    },
    27: {
        "learn_content": """📚 시리즈 기획

시리즈 글은 구독자를 만드는 좋은 방법이에요!

📚 시리즈 글의 장점:
• 독자가 다음 편을 기다림
• 관련 글끼리 연결됨
• 전문성이 보임
• 콘텐츠 기획이 쉬워짐

📝 시리즈 기획 방법:

1. 주제 선정
   • 깊이 있게 쓸 수 있는 주제
   • 여러 편으로 나눌 수 있는 주제

2. 구성 설계
   • 몇 편으로 할지 (3-10편 추천)
   • 각 편의 소주제 정하기
   • 발행 주기 정하기

3. 연결 고리
   • 이전/다음 편 링크
   • 시리즈 모아보기 제공

📌 시리즈 제목 예시:
• [블로그 기초] ① 시작하기
• 제주도 여행기 1편: 첫째 날
• 신혼집 인테리어 #1 거실편

💡 시리즈 첫 편에 전체 목차를 넣으면
독자가 미리 볼 수 있어 좋아요!""",
        "checklist": [
            "시리즈로 만들 주제 1개 정하기",
            "3-5편 목차 기획하기",
            "1편 작성 및 발행하기",
            "2편 예고 포함하기"
        ]
    },
    28: {
        "learn_content": """📚 4주차 정리

4주 완료! 🎉 정말 대단해요!

📊 4주차에 배운 것들:
• Day 22: 키워드 분석
• Day 23: 경쟁 분석
• Day 24: 상위 노출 전략
• Day 25: 방문자 분석
• Day 26: 콘텐츠 리사이클링
• Day 27: 시리즈 기획

✅ 4주차 체크포인트:
□ 블루오션 키워드 찾았다
□ 경쟁 분석 해봤다
□ 상위 노출 노린 글 썼다
□ 통계 분석 해봤다
□ 시리즈 기획했다

📈 성장 점검:
• 키워드를 보는 눈이 생겼나요?
• 데이터를 기반으로 개선하고 있나요?
• 전략적인 글쓰기를 하고 있나요?

🎯 마지막 주 예고:
5주차는 마무리와 앞으로의 계획!
30일 챌린지를 완주해봐요! 💪""",
        "checklist": [
            "4주차 가장 큰 성장 포인트 적기",
            "앞으로 집중할 전략 1가지 정하기",
            "4주차 회고 글 발행하기"
        ]
    },
    29: {
        "learn_content": """📚 30일 되돌아보기

거의 다 왔어요! 🎉 30일을 되돌아보는 시간이에요.

📊 30일 동안의 변화:

Week 1: 기초 다지기
• 블로그 시작
• 첫 글 발행
• 기본 설정 완료

Week 2: 습관 형성
• 글쓰기 루틴 만들기
• 다양한 글 써보기
• 꾸준함의 중요성

Week 3: 기술 향상
• SEO 기초 습득
• 최적화 기술 적용
• 품질 높은 글쓰기

Week 4: 성장 가속
• 키워드 전략
• 데이터 분석
• 전략적 접근

✨ 당신의 성장:
□ 블로그 개설/정비
□ 글 10편 이상 발행
□ SEO 기초 습득
□ 나만의 루틴 형성
□ 데이터 기반 개선

💪 이제 당신은 블로거입니다!""",
        "checklist": [
            "30일 동안 발행한 글 수 세어보기",
            "가장 뿌듯한 글 1개 선택하기",
            "가장 큰 변화/성장 적어보기",
            "30일 회고록 작성하기"
        ]
    },
    30: {
        "learn_content": """📚 다음 목표 설정

축하합니다! 🎉 30일 챌린지를 완주하셨어요!

🏆 당신의 달성:
• 30일 연속 학습 완료
• 블로그 기초부터 전략까지 마스터
• 꾸준함의 가치를 경험

🎯 다음 30일 목표 설정:
• 주 3회 이상 발행 유지
• 특정 키워드 상위 노출 도전
• 일일 방문자 OO명 달성

🎯 100일 목표:
• 총 포스팅 50개 이상
• 이웃 100명 달성
• 고정 독자 확보

🎯 1년 목표:
• 월간 방문자 OO명
• 수익화 시작 (체험단/애드포스트)
• 해당 분야 전문 블로거로 성장

💌 마지막으로:
"완벽한 글보다 꾸준한 글이 더 가치 있습니다."

당신의 블로그 여정을 응원합니다! 🚀
블랭크가 항상 함께할게요.""",
        "checklist": [
            "다음 30일 목표 3가지 적기",
            "100일 후 목표 적기",
            "1년 후 목표 적기",
            "앞으로의 다짐 글 발행하기"
        ]
    }
}


# ========== Pydantic 모델 ==========

class StartChallengeRequest(BaseModel):
    challenge_type: str = "30day"


class CompleteMissionRequest(BaseModel):
    day_number: int
    mission_id: str
    mission_type: str  # learn, mission
    notes: Optional[str] = None
    proof_image: Optional[str] = None  # Base64 인코딩된 이미지


class LogWritingRequest(BaseModel):
    day_number: int
    mission_id: str
    title: str
    content_preview: Optional[str] = None
    word_count: int = 0
    blog_url: Optional[str] = None


# ========== 챌린지 API ==========

@router.get("/status")
async def get_status(current_user: dict = Depends(get_current_user)):
    """현재 챌린지 상태 조회"""
    try:
        status = get_challenge_status(current_user["id"])

        if not status:
            return {
                "success": True,
                "has_challenge": False,
                "message": "아직 챌린지를 시작하지 않았습니다."
            }

        return {
            "success": True,
            "has_challenge": True,
            "status": status
        }
    except Exception as e:
        logger.error(f"챌린지 상태 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/start")
async def start(
    request: StartChallengeRequest,
    current_user: dict = Depends(get_current_user)
):
    """챌린지 시작"""
    try:
        result = start_challenge(current_user["id"], request.challenge_type)
        return result
    except Exception as e:
        logger.error(f"챌린지 시작 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/today")
async def get_today(current_user: dict = Depends(get_current_user)):
    """오늘의 미션 조회"""
    try:
        # 챌린지 상태 확인
        status = get_challenge_status(current_user["id"])

        if not status or status.get("status") != "active":
            return {
                "success": False,
                "message": "진행 중인 챌린지가 없습니다.",
                "redirect": "start"
            }

        today_content = get_today_missions(current_user["id"])
        motivation_data = get_motivation()

        # missions를 배열 형태로 변환 (프론트엔드 인터페이스 맞춤)
        missions = []
        day = today_content.get("day", 1)

        # 학습 미션
        if today_content.get("learn"):
            learn = today_content["learn"]
            missions.append({
                "day_number": day,
                "mission_id": learn.get("mission_id", f"learn_{day}"),
                "mission_type": "learn",
                "title": learn.get("title", ""),
                "description": learn.get("content", "오늘의 학습 내용을 확인하세요."),
                "content": LEARNING_CONTENT.get(day, {}).get("learn_content", learn.get("content", "")),
                "tip": today_content.get("tip", ""),
                "xp": 30,
                "completed": learn.get("completed", False)
            })

        # 실습 미션
        if today_content.get("mission"):
            mission = today_content["mission"]
            missions.append({
                "day_number": day,
                "mission_id": mission.get("mission_id", f"mission_{day}"),
                "mission_type": "mission",
                "title": mission.get("title", ""),
                "description": mission.get("description", ""),
                "checklist": LEARNING_CONTENT.get(day, {}).get("checklist", []),
                "tip": today_content.get("tip", ""),
                "xp": mission.get("xp", 50),
                "completed": mission.get("completed", False)
            })

        # 동기부여 데이터 포맷 맞춤
        motivation = {
            "quote": motivation_data.get("content", "오늘도 한 줄이라도 써보세요."),
            "author": motivation_data.get("author", "Unknown"),
            "tip": today_content.get("tip", "작은 시작이 큰 변화를 만듭니다.")
        }

        return {
            "success": True,
            "missions": missions,
            "motivation": motivation,
            "status": status
        }
    except Exception as e:
        logger.error(f"오늘의 미션 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/complete")
async def complete(
    request: CompleteMissionRequest,
    current_user: dict = Depends(get_current_user)
):
    """미션 완료 처리"""
    try:
        # 실습 미션(mission)의 경우 사진 필수
        if request.mission_type == "mission" and not request.proof_image:
            raise HTTPException(
                status_code=400,
                detail="미션 완료를 위해 인증 사진이 필요합니다."
            )

        # 사진이 있으면 저장
        proof_filename = None
        if request.proof_image:
            try:
                # Base64 디코딩
                if "," in request.proof_image:
                    # data:image/jpeg;base64,xxx 형식
                    header, image_data = request.proof_image.split(",", 1)
                else:
                    image_data = request.proof_image

                image_bytes = base64.b64decode(image_data)

                # 파일명 생성
                proof_filename = f"proof_{current_user['id']}_{request.day_number}_{request.mission_id}_{uuid.uuid4().hex[:8]}.jpg"

                # 저장 경로 (Windows/Linux 호환)
                import sys
                if sys.platform == "win32":
                    proof_dir = os.path.join(os.path.dirname(__file__), "..", "data", "proofs")
                else:
                    proof_dir = "/data/proofs"
                os.makedirs(proof_dir, exist_ok=True)

                # 파일 저장
                proof_path = os.path.join(proof_dir, proof_filename)
                with open(proof_path, "wb") as f:
                    f.write(image_bytes)

                logger.info(f"Proof image saved: {proof_path}")
            except Exception as e:
                logger.error(f"Failed to save proof image: {e}")
                # 사진 저장 실패해도 미션 완료는 진행

        result = complete_mission(
            user_id=current_user["id"],
            day_number=request.day_number,
            mission_id=request.mission_id,
            mission_type=request.mission_type,
            notes=request.notes
        )

        # 완료 후 프로필 조회
        profile = get_gamification_profile(current_user["id"])

        return {
            **result,
            "profile": profile,
            "proof_saved": proof_filename is not None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"미션 완료 처리 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/progress")
async def get_progress(current_user: dict = Depends(get_current_user)):
    """전체 진행률 조회"""
    try:
        status = get_challenge_status(current_user["id"])
        calendar = get_progress_calendar(current_user["id"])
        profile = get_gamification_profile(current_user["id"])

        if not status:
            return {
                "success": False,
                "message": "챌린지를 시작해주세요."
            }

        return {
            "success": True,
            "status": status,
            "calendar": calendar,
            "profile": profile
        }
    except Exception as e:
        logger.error(f"진행률 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/leaderboard")
async def leaderboard(limit: int = 20):
    """랭킹 조회 (로그인 불필요)"""
    try:
        rankings = get_leaderboard(limit)
        return {
            "success": True,
            "rankings": rankings,
            "total_participants": len(rankings)
        }
    except Exception as e:
        logger.error(f"랭킹 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/day/{day}")
async def get_day_content(day: int):
    """특정 일차 콘텐츠 조회 (로그인 불필요 - 미리보기)"""
    try:
        if day < 1 or day > 30:
            raise HTTPException(status_code=400, detail="일차는 1-30 사이여야 합니다.")

        content = get_challenge_content(day)

        if not content:
            raise HTTPException(status_code=404, detail="콘텐츠를 찾을 수 없습니다.")

        return {
            "success": True,
            "day": day,
            "content": content
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"일차 콘텐츠 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/overview")
async def get_overview():
    """챌린지 전체 개요 (로그인 불필요)"""
    try:
        weeks = {}
        for day, content in CHALLENGE_CONTENT.items():
            week = content["week"]
            if week not in weeks:
                weeks[week] = {
                    "week": week,
                    "theme": content["theme"],
                    "days": []
                }
            weeks[week]["days"].append({
                "day": day,
                "learn_title": content["learn"]["title"],
                "mission_title": content["mission"]["title"],
                "xp": content["xp"] + 30
            })

        return {
            "success": True,
            "title": "30일 블로그 챌린지",
            "description": "블로그 초보자를 위한 30일 성장 프로그램",
            "total_days": 30,
            "total_xp": sum(c["xp"] + 30 for c in CHALLENGE_CONTENT.values()),
            "weeks": list(weeks.values()),
            "levels": [
                {"level": k, "name": v["name"], "min_xp": v["min_xp"]}
                for k, v in LEVEL_REQUIREMENTS.items()
            ]
        }
    except Exception as e:
        logger.error(f"개요 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== 게이미피케이션 API ==========

@router.get("/gamification/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    """게이미피케이션 프로필 조회"""
    try:
        profile = get_gamification_profile(current_user["id"])
        return {
            "success": True,
            "profile": profile
        }
    except Exception as e:
        logger.error(f"프로필 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/gamification/badges")
async def get_badges(current_user: dict = Depends(get_current_user)):
    """배지 목록 조회"""
    try:
        all_badges = get_all_badges()
        profile = get_gamification_profile(current_user["id"])
        earned_badges = profile.get("badges", [])

        badges_with_status = []
        for badge in all_badges:
            badges_with_status.append({
                **badge,
                "earned": badge["id"] in earned_badges
            })

        return {
            "success": True,
            "badges": badges_with_status,
            "earned_count": len(earned_badges),
            "total_count": len(all_badges)
        }
    except Exception as e:
        logger.error(f"배지 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== 글쓰기 로그 API ==========

@router.post("/writing/log")
async def log_writing_entry(
    request: LogWritingRequest,
    current_user: dict = Depends(get_current_user)
):
    """글쓰기 로그 기록"""
    try:
        log_id = log_writing(
            user_id=current_user["id"],
            day_number=request.day_number,
            mission_id=request.mission_id,
            title=request.title,
            content_preview=request.content_preview,
            word_count=request.word_count,
            blog_url=request.blog_url
        )

        return {
            "success": True,
            "log_id": log_id,
            "message": "글쓰기가 기록되었습니다."
        }
    except Exception as e:
        logger.error(f"글쓰기 로그 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== 동기부여 API ==========

@router.get("/motivation")
async def get_motivation_content():
    """동기부여 콘텐츠 조회 (로그인 불필요)"""
    try:
        motivation = get_motivation()
        return {
            "success": True,
            "motivation": motivation
        }
    except Exception as e:
        logger.error(f"동기부여 콘텐츠 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ========== 체크리스트 API ==========

@router.get("/checklist")
async def get_checklist():
    """글 발행 전 체크리스트 (로그인 불필요)"""
    checklist = [
        {"id": "title", "category": "제목", "item": "키워드가 제목 앞부분에 포함되어 있나요?", "tip": "키워드는 앞에 있을수록 좋습니다."},
        {"id": "title_length", "category": "제목", "item": "제목이 20-40자 사이인가요?", "tip": "너무 짧거나 길면 클릭률이 낮아집니다."},
        {"id": "thumbnail", "category": "썸네일", "item": "대표 이미지가 설정되어 있나요?", "tip": "눈에 띄는 썸네일이 클릭을 유도합니다."},
        {"id": "intro", "category": "본문", "item": "첫 문단에 키워드가 자연스럽게 들어가 있나요?", "tip": "검색엔진은 첫 문단을 중요하게 봅니다."},
        {"id": "structure", "category": "본문", "item": "소제목(H2, H3)으로 구조화되어 있나요?", "tip": "가독성이 좋아지고 SEO에도 유리합니다."},
        {"id": "images", "category": "이미지", "item": "이미지가 5장 이상 포함되어 있나요?", "tip": "적절한 이미지는 체류시간을 늘립니다."},
        {"id": "image_alt", "category": "이미지", "item": "이미지에 대체 텍스트를 넣었나요?", "tip": "이미지 검색 노출에 도움이 됩니다."},
        {"id": "content_length", "category": "본문", "item": "본문이 1,500자 이상인가요?", "tip": "너무 짧은 글은 정보가 부족하다고 판단됩니다."},
        {"id": "hashtags", "category": "해시태그", "item": "관련 해시태그를 10-15개 넣었나요?", "tip": "너무 많거나 적으면 효과가 떨어집니다."},
        {"id": "category", "category": "분류", "item": "적절한 카테고리에 분류했나요?", "tip": "관련성 있는 카테고리가 노출에 유리합니다."},
        {"id": "proofread", "category": "검수", "item": "맞춤법 검사를 했나요?", "tip": "오타는 신뢰도를 떨어뜨립니다."},
        {"id": "mobile", "category": "검수", "item": "모바일에서 미리보기를 확인했나요?", "tip": "대부분의 독자는 모바일로 봅니다."},
    ]

    return {
        "success": True,
        "checklist": checklist,
        "total_items": len(checklist)
    }
