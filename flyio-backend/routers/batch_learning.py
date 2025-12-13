"""
대량 키워드 자동 학습 시스템
- 관리자가 트리거하면 백그라운드에서 대량 키워드 학습
- 네이버 차단 방지를 위한 속도 조절
- 실시간 진행 상황 모니터링
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel
from typing import List, Dict, Optional
import asyncio
import random
import time
import logging
from datetime import datetime

from database.learning_db import add_learning_sample, get_current_weights, save_current_weights, get_learning_statistics
from services.learning_engine import train_model, instant_adjust_weights

router = APIRouter()
logger = logging.getLogger(__name__)

# ========================================
# 학습 상태 관리 (메모리 기반)
# ========================================
learning_state = {
    "is_running": False,
    "current_keyword": "",
    "total_keywords": 0,
    "completed_keywords": 0,
    "total_blogs_analyzed": 0,
    "total_posts_analyzed": 0,  # 글 분석 완료 수
    "start_time": None,
    "estimated_end_time": None,
    "errors": [],
    "recent_keywords": [],
    "accuracy_before": 0,
    "accuracy_after": 0,
    "session_id": None
}

# ========================================
# 학습 로그 저장소 (메모리 기반)
# ========================================
learning_logs = {
    "keywords": [],  # 분석된 키워드 목록
    "keyword_details": {}  # 키워드별 상세 정보 {keyword: {blogs: [...], timestamp: ...}}
}

# ========================================
# 키워드 풀 - 다양한 카테고리별 인기 키워드 (총 1500+ 키워드)
# ========================================
KEYWORD_POOL = {
    "의료": [
        # 치과 (50개)
        "강남치과", "청담치과", "신촌치과", "홍대치과", "건대치과",
        "압구정치과", "역삼치과", "잠실치과", "송파치과", "강동치과",
        "분당치과", "수원치과", "인천치과", "대전치과", "부산치과",
        "대구치과", "광주치과", "울산치과", "세종치과", "창원치과",
        "임플란트치과", "교정치과", "미백치과", "소아치과", "신경치료",
        "충치치료", "사랑니발치", "스케일링", "잇몸치료", "치아성형",
        "라미네이트", "올세라믹", "지르코니아", "브릿지치료", "틀니",
        # 피부과/성형외과 (40개)
        "강남피부과", "청담피부과", "신사피부과", "압구정피부과", "논현피부과",
        "강남성형외과", "청담성형외과", "압구정성형외과", "신사성형외과", "논현성형외과",
        "보톡스", "필러", "리프팅", "레이저토닝", "여드름치료",
        "기미치료", "주근깨제거", "점제거", "흉터치료", "모공치료",
        "쌍꺼풀수술", "눈재수술", "코성형", "안면윤곽", "지방흡입",
        "가슴성형", "복부성형", "팔뚝지방흡입", "허벅지지방흡입", "엉덩이성형",
        # 내과/정형외과/한의원 (35개)
        "강남내과", "서울내과", "인천내과", "대전내과", "부산내과",
        "강남정형외과", "서울정형외과", "인천정형외과", "허리디스크", "목디스크",
        "무릎관절", "어깨통증", "척추측만증", "오십견치료", "관절염치료",
        "강남한의원", "다이어트한의원", "탈모한의원", "교통사고한의원", "추나요법",
        # 검진/기타 (25개)
        "건강검진", "종합검진", "암검진", "위내시경", "대장내시경",
        "초음파검사", "MRI검사", "CT검사", "혈액검사", "소변검사",
        "라식", "라섹", "스마일라식", "렌즈삽입술", "노안수술",
        "이비인후과", "비염치료", "축농증치료", "편도선수술", "수면무호흡",
        "산부인과", "소아과", "비뇨기과", "정신건강의학과", "재활의학과"
    ],
    "맛집": [
        # 서울 지역 맛집 (60개)
        "강남맛집", "홍대맛집", "이태원맛집", "신촌맛집", "건대맛집",
        "압구정맛집", "청담맛집", "삼성역맛집", "역삼맛집", "선릉맛집",
        "교대맛집", "서초맛집", "양재맛집", "잠실맛집", "송파맛집",
        "명동맛집", "종로맛집", "광화문맛집", "을지로맛집", "성수맛집",
        "연남동맛집", "망원동맛집", "합정맛집", "상수맛집", "여의도맛집",
        "영등포맛집", "구로맛집", "신림맛집", "노원맛집", "성북맛집",
        # 수도권/지방 맛집 (40개)
        "분당맛집", "판교맛집", "수원맛집", "인천맛집", "일산맛집",
        "부천맛집", "안양맛집", "성남맛집", "용인맛집", "화성맛집",
        "대전맛집", "부산맛집", "대구맛집", "광주맛집", "울산맛집",
        "제주맛집", "경주맛집", "전주맛집", "속초맛집", "강릉맛집",
        # 음식 종류별 (50개)
        "삼겹살맛집", "고기맛집", "스테이크맛집", "초밥맛집", "회맛집",
        "파스타맛집", "피자맛집", "중식맛집", "일식맛집", "한식맛집",
        "곱창맛집", "대창맛집", "막창맛집", "족발맛집", "보쌈맛집",
        "치킨맛집", "떡볶이맛집", "김치찌개맛집", "된장찌개맛집", "순두부맛집",
        "냉면맛집", "칼국수맛집", "짜장면맛집", "짬뽕맛집", "탕수육맛집",
        "라멘맛집", "우동맛집", "돈카츠맛집", "덮밥맛집", "카레맛집",
        "버거맛집", "샌드위치맛집", "브런치카페", "디저트카페", "베이커리카페",
        "루프탑카페", "뷰맛집", "데이트맛집", "소개팅맛집", "가족외식",
        "회식장소", "단체회식", "혼밥맛집", "점심맛집", "야식맛집",
        "새벽맛집", "24시맛집", "술집추천", "이자카야", "포차추천"
    ],
    "여행": [
        # 국내여행 (50개)
        "제주여행", "부산여행", "강릉여행", "속초여행", "경주여행",
        "전주여행", "여수여행", "통영여행", "거제여행", "포항여행",
        "울릉도여행", "독도여행", "남해여행", "완도여행", "목포여행",
        "춘천여행", "양양여행", "평창여행", "정선여행", "태백여행",
        "안동여행", "대구여행", "울산여행", "창원여행", "진주여행",
        "광주여행", "담양여행", "순천여행", "보성여행", "해남여행",
        "대전여행", "공주여행", "부여여행", "천안여행", "아산여행",
        "수원여행", "인천여행", "파주여행", "가평여행", "양평여행",
        "제주동쪽", "제주서쪽", "제주중문", "제주애월", "제주성산",
        "서울근교여행", "당일치기여행", "드라이브코스", "국내캠핑장", "글램핑",
        # 일본여행 (30개)
        "일본여행", "오사카여행", "도쿄여행", "후쿠오카여행", "교토여행",
        "나라여행", "고베여행", "나고야여행", "삿포로여행", "오키나와여행",
        "홋카이도여행", "큐슈여행", "간사이여행", "간토여행", "시즈오카여행",
        "가나자와여행", "히로시마여행", "나가사키여행", "벳푸여행", "유후인여행",
        "오사카맛집", "도쿄맛집", "오사카호텔", "도쿄호텔", "일본료칸",
        "일본온천", "일본쇼핑", "일본면세점", "JR패스", "일본교통패스",
        # 동남아여행 (30개)
        "태국여행", "방콕여행", "푸켓여행", "치앙마이여행", "파타야여행",
        "베트남여행", "다낭여행", "호치민여행", "하노이여행", "나트랑여행",
        "필리핀여행", "세부여행", "보라카이여행", "마닐라여행", "팔라완여행",
        "싱가포르여행", "말레이시아여행", "쿠알라룸푸르", "랑카위여행", "코타키나발루",
        "인도네시아여행", "발리여행", "자카르타여행", "롬복여행", "라오스여행",
        "캄보디아여행", "앙코르와트", "미얀마여행", "몰디브여행", "스리랑카여행",
        # 기타 해외여행 (40개)
        "유럽여행", "파리여행", "런던여행", "로마여행", "바르셀로나여행",
        "프라하여행", "빈여행", "암스테르담여행", "브뤼셀여행", "스위스여행",
        "독일여행", "뮌헨여행", "베를린여행", "프랑크푸르트", "이탈리아여행",
        "스페인여행", "포르투갈여행", "그리스여행", "산토리니여행", "크로아티아여행",
        "미국여행", "뉴욕여행", "LA여행", "하와이여행", "괌여행",
        "사이판여행", "샌프란시스코", "라스베가스", "시애틀여행", "보스턴여행",
        "캐나다여행", "밴쿠버여행", "토론토여행", "호주여행", "시드니여행",
        "멜버른여행", "뉴질랜드여행", "대만여행", "홍콩여행", "마카오여행"
    ],
    "뷰티": [
        # 스킨케어 (40개)
        "화장품추천", "스킨케어", "선크림추천", "파운데이션추천", "립스틱추천",
        "토너추천", "세럼추천", "크림추천", "에센스추천", "로션추천",
        "아이크림추천", "앰플추천", "미스트추천", "오일추천", "마스크팩",
        "클렌징폼", "클렌징오일", "클렌징워터", "필링젤", "각질제거",
        "모공관리", "여드름관리", "미백관리", "주름관리", "탄력관리",
        "수분관리", "진정케어", "트러블케어", "안티에이징", "리프팅크림",
        "피부장벽", "세라마이드", "레티놀", "비타민C", "나이아신아마이드",
        "히알루론산", "콜라겐", "펩타이드", "AHA", "BHA",
        # 메이크업 (30개)
        "아이섀도우", "마스카라", "아이라이너", "아이브로우", "블러셔",
        "하이라이터", "쉐딩", "컨실러", "프라이머", "세팅스프레이",
        "쿠션추천", "팩트추천", "비비크림", "CC크림", "틴트추천",
        "립글로스", "립밤", "립라이너", "속눈썹", "인조속눈썹",
        "뷰러", "메이크업브러시", "스펀지", "뷰티블렌더", "화장솜",
        "메이크업리무버", "포인트리무버", "화장품파우치", "거울추천", "조명거울",
        # 헤어/네일/바디 (40개)
        "샴푸추천", "트리트먼트", "헤어오일", "헤어에센스", "헤어마스크",
        "두피케어", "탈모샴푸", "염색약", "염색샴푸", "헤어틴트",
        "헤어왁스", "헤어스프레이", "헤어젤", "헤어무스", "포마드",
        "고데기", "드라이기", "헤어롤", "매직기", "헤어아이론",
        "네일아트", "젤네일", "네일샵", "셀프네일", "네일스티커",
        "네일폴리시", "네일리무버", "큐티클오일", "네일케어", "페디큐어",
        "바디로션", "바디크림", "바디오일", "바디스크럽", "바디미스트",
        "핸드크림", "풋크림", "립케어", "아이케어", "넥크림",
        # 다이어트/운동 (40개)
        "다이어트", "다이어트식단", "다이어트보조제", "지방분해", "셀룰라이트",
        "홈트레이닝", "홈트", "필라테스", "요가", "헬스장추천",
        "PT추천", "개인트레이닝", "그룹운동", "스피닝", "크로스핏",
        "러닝", "조깅", "마라톤", "수영", "수영강습",
        "골프", "테니스", "배드민턴", "탁구", "볼링",
        "복싱", "주짓수", "킥복싱", "무에타이", "태권도",
        "발레", "재즈댄스", "폴댄스", "줌바", "에어로빅",
        "스트레칭", "폼롤러", "요가매트", "아령", "케틀벨"
    ],
    "생활": [
        # 이사/청소/인테리어 (40개)
        "이사업체", "포장이사", "원룸이사", "사무실이사", "용달이사",
        "이사비용", "이사견적", "이사날짜", "이사청소", "입주청소",
        "청소업체", "집청소", "에어컨청소", "매트리스청소", "카펫청소",
        "새집증후군", "인테리어", "셀프인테리어", "아파트인테리어", "원룸인테리어",
        "주방인테리어", "욕실인테리어", "거실인테리어", "침실인테리어", "베란다인테리어",
        "벽지", "바닥재", "타일", "조명", "커튼",
        "블라인드", "롤스크린", "가구추천", "소파추천", "침대추천",
        "식탁추천", "책상추천", "의자추천", "수납장", "옷장추천",
        # 가전제품 (40개)
        "가전제품", "냉장고추천", "세탁기추천", "건조기추천", "에어컨추천",
        "TV추천", "공기청정기", "청소기추천", "로봇청소기", "무선청소기",
        "식기세척기", "전자레인지", "오븐추천", "에어프라이어", "전기밥솥",
        "커피머신", "정수기추천", "비데추천", "제습기", "가습기",
        "선풍기추천", "온풍기", "전기히터", "전기장판", "전기요",
        "헤어드라이기", "고데기추천", "전기면도기", "전동칫솔", "안마기",
        "안마의자", "족욕기", "혈압계", "체중계", "체지방계",
        "노트북추천", "아이패드", "갤럭시탭", "스마트폰추천", "이어폰추천",
        # 자동차/금융 (40개)
        "자동차", "중고차", "신차", "전기차", "하이브리드",
        "SUV추천", "세단추천", "경차추천", "수입차", "국산차",
        "현대자동차", "기아자동차", "제네시스", "BMW", "벤츠",
        "아우디", "폭스바겐", "테슬라", "자동차보험", "자동차리스",
        "장기렌트", "렌터카", "카셰어링", "타이어교체", "엔진오일",
        "보험추천", "실비보험", "암보험", "종신보험", "연금보험",
        "저축보험", "운전자보험", "여행자보험", "화재보험", "펫보험",
        "대출", "주택담보대출", "신용대출", "전세대출", "사업자대출",
        # 부동산/창업 (30개)
        "부동산", "아파트", "빌라", "오피스텔", "원룸",
        "투룸", "전세", "월세", "매매", "분양",
        "재건축", "재개발", "신축아파트", "구축아파트", "주택청약",
        "상가", "사무실임대", "창업", "프랜차이즈", "카페창업",
        "음식점창업", "무인창업", "편의점창업", "치킨창업", "배달창업",
        "온라인창업", "쇼핑몰창업", "스마트스토어", "위탁판매", "도매사이트"
    ],
    "교육": [
        # 학원/입시 (50개)
        "영어학원", "수학학원", "국어학원", "과학학원", "사회학원",
        "논술학원", "입시학원", "재수학원", "반수학원", "편입학원",
        "대치동학원", "목동학원", "중계동학원", "분당학원", "평촌학원",
        "수능", "내신", "모의고사", "학종", "수시",
        "정시", "논술전형", "면접준비", "자기소개서", "학생부",
        "SKY", "인서울", "지방국립대", "의대입시", "약대입시",
        "치대입시", "한의대입시", "수의대입시", "간호대입시", "교대입시",
        "경찰대", "사관학교", "카이스트", "포스텍", "유니스트",
        "국제학교", "외고", "과학고", "자사고", "특목고",
        "중학교입시", "초등입시", "영재원", "과학영재", "수학영재",
        # 어학/자격증 (40개)
        "토익", "토플", "아이엘츠", "텝스", "오픽",
        "토익스피킹", "영어회화", "전화영어", "화상영어", "원어민영어",
        "비즈니스영어", "여행영어", "생활영어", "영어문법", "영어단어",
        "일본어", "JLPT", "중국어", "HSK", "스페인어",
        "프랑스어", "독일어", "베트남어", "태국어", "러시아어",
        "공무원", "9급공무원", "7급공무원", "경찰공무원", "소방공무원",
        "교원임용", "행정사", "주택관리사", "공인중개사", "세무사",
        "회계사", "변리사", "노무사", "관세사", "감정평가사",
        # 코딩/IT교육 (30개)
        "코딩학원", "코딩교육", "프로그래밍", "웹개발", "앱개발",
        "파이썬", "자바", "자바스크립트", "리액트", "노드",
        "데이터분석", "빅데이터", "머신러닝", "딥러닝", "AI",
        "부트캠프", "국비지원", "KDT", "내일배움카드", "직업훈련",
        "포트폴리오", "개발자취업", "이직준비", "면접준비", "자소서",
        "정보처리기사", "리눅스마스터", "네트워크관리사", "SQLD", "AWS",
        # 유아/초등교육 (30개)
        "유아교육", "영어유치원", "놀이학교", "어린이집", "유치원",
        "초등학원", "초등영어", "초등수학", "초등국어", "초등과학",
        "미술학원", "피아노학원", "바이올린", "첼로", "플룻",
        "태권도", "수영", "발레", "축구교실", "농구교실",
        "체조", "댄스", "뮤지컬", "연기", "스피치",
        "로봇교육", "레고", "과학실험", "독서논술", "글쓰기"
    ],
    "IT/테크": [
        # 스마트폰/태블릿 (30개)
        "아이폰", "아이폰16", "아이폰15", "갤럭시", "갤럭시S24",
        "갤럭시Z폴드", "갤럭시Z플립", "아이패드", "아이패드프로", "아이패드에어",
        "갤럭시탭", "갤럭시탭S9", "샤오미패드", "스마트폰케이스", "액정보호필름",
        "무선충전기", "보조배터리", "충전케이블", "스마트폰거치대", "셀카봉",
        "에어팟", "에어팟프로", "갤럭시버즈", "무선이어폰", "블루투스이어폰",
        "애플워치", "갤럭시워치", "스마트워치", "핏빗", "가민",
        # 노트북/PC (40개)
        "맥북", "맥북프로", "맥북에어", "윈도우노트북", "게이밍노트북",
        "삼성노트북", "LG그램", "레노버", "HP노트북", "ASUS",
        "MSI", "레이저", "에이서", "델노트북", "서피스",
        "조립PC", "게이밍PC", "사무용PC", "그래픽카드", "RTX4090",
        "RTX4080", "RTX4070", "CPU", "인텔", "AMD라이젠",
        "RAM", "SSD", "NVMe", "파워서플라이", "케이스",
        "모니터추천", "게이밍모니터", "4K모니터", "커브드모니터", "듀얼모니터",
        "키보드추천", "기계식키보드", "무선키보드", "마우스추천", "게이밍마우스",
        # 카메라/영상장비 (30개)
        "카메라추천", "미러리스", "DSLR", "소니카메라", "캐논카메라",
        "니콘카메라", "후지필름", "파나소닉", "렌즈추천", "광각렌즈",
        "망원렌즈", "단렌즈", "줌렌즈", "삼각대", "짐벌",
        "액션캠", "고프로", "인스타360", "드론", "DJI",
        "웹캠", "마이크추천", "콘덴서마이크", "다이나믹마이크", "무선마이크",
        "오디오인터페이스", "모니터스피커", "헤드폰", "스튜디오헤드폰", "DAW",
        # 소프트웨어/앱 (50개)
        "앱추천", "생산성앱", "노트앱", "할일앱", "캘린더앱",
        "사진편집앱", "동영상편집", "유튜브편집", "프리미어프로", "파이널컷",
        "다빈치리졸브", "포토샵", "라이트룸", "일러스트레이터", "피그마",
        "노션", "옵시디언", "에버노트", "원노트", "구글킵",
        "슬랙", "디스코드", "줌", "구글밋", "팀즈",
        "ChatGPT", "클로드", "미드저니", "달리", "스테이블디퓨전",
        "호스팅", "도메인", "워드프레스", "윅스", "스퀘어스페이스",
        "쇼핑몰제작", "카페24", "아임웹", "식스샵", "NHN고도몰",
        "AWS", "구글클라우드", "애저", "네이버클라우드", "NAS추천",
        "시놀로지", "큐냅", "외장하드", "USB메모리", "클라우드스토리지"
    ],
    "취미": [
        # 골프 (30개)
        "골프", "골프연습장", "골프레슨", "골프아카데미", "스크린골프",
        "골프용품", "골프채", "드라이버추천", "아이언추천", "퍼터추천",
        "골프웨어", "골프화", "골프가방", "골프장갑", "골프공",
        "골프거리측정기", "골프GPS", "골프코스", "골프장추천", "회원권",
        "비회원라운딩", "해외골프", "제주골프", "동남아골프", "일본골프",
        "골프여행", "골프숙박", "골프패키지", "싱글", "핸디캡",
        # 라켓스포츠 (20개)
        "테니스", "테니스레슨", "테니스장", "테니스라켓", "테니스화",
        "테니스웨어", "테니스공", "테니스그립", "테니스가방", "테니스스트링",
        "배드민턴", "배드민턴장", "배드민턴라켓", "배드민턴화", "셔틀콕",
        "탁구", "탁구장", "탁구라켓", "탁구공", "탁구대",
        # 아웃도어 (40개)
        "등산", "등산화추천", "등산복", "등산배낭", "등산스틱",
        "등산코스", "산행", "북한산", "설악산", "지리산",
        "캠핑", "캠핑장추천", "캠핑용품", "텐트추천", "타프",
        "캠핑의자", "캠핑테이블", "버너", "코펠", "침낭",
        "글램핑", "카라반", "차박", "루프탑텐트", "캠핑카",
        "낚시", "바다낚시", "민물낚시", "루어낚시", "플라이낚시",
        "낚시대", "릴추천", "미끼", "찌낚시", "원투낚시",
        "낚시포인트", "낚시배", "선상낚시", "갯바위낚시", "방파제낚시",
        # 창작/문화 (30개)
        "사진", "사진강좌", "출사지", "인물사진", "풍경사진",
        "그림", "드로잉", "수채화", "유화", "아크릴화",
        "디지털아트", "아이패드드로잉", "프로크리에이트", "클립스튜디오", "포토샵",
        "독서", "책추천", "베스트셀러", "자기계발서", "소설추천",
        "에세이추천", "경제서적", "심리학책", "역사책", "과학책",
        "악기", "기타레슨", "피아노레슨", "드럼레슨", "우쿨렐레",
        # 기타취미 (30개)
        "보드게임", "퍼즐", "레고", "프라모델", "피규어",
        "원예", "화분", "다육이", "식물키우기", "베란다정원",
        "수족관", "열대어", "금붕어", "새우키우기", "어항추천",
        "DIY", "목공", "가죽공예", "도자기", "뜨개질",
        "재봉", "미싱", "퀼트", "자수", "비즈공예",
        "향수", "디퓨저만들기", "캔들만들기", "비누만들기", "천연화장품"
    ],
    "반려동물": [
        # 강아지 (50개)
        "강아지분양", "말티즈분양", "푸들분양", "비숑분양", "시바견분양",
        "웰시코기분양", "골든리트리버분양", "래브라도분양", "포메라니안분양", "치와와분양",
        "강아지사료", "강아지사료추천", "퍼피사료", "노령견사료", "처방식사료",
        "강아지간식", "강아지껌", "덴탈껌", "육포간식", "동결건조간식",
        "강아지용품", "강아지하우스", "강아지침대", "강아지쿠션", "강아지계단",
        "강아지식기", "급수기", "급식기", "자동급식기", "정수기",
        "강아지옷", "강아지패딩", "강아지우비", "강아지신발", "강아지넥카라",
        "강아지목줄", "강아지하네스", "강아지리드줄", "강아지이동장", "강아지유모차",
        "강아지미용", "강아지목욕", "강아지샴푸", "강아지빗", "발톱깎이",
        "강아지훈련", "반려견교육", "분리불안", "짖음교육", "배변훈련",
        # 고양이 (40개)
        "고양이분양", "코숏분양", "러시안블루분양", "브리티쉬숏헤어", "스코티쉬폴드",
        "페르시안분양", "먼치킨분양", "아비시니안분양", "벵갈고양이", "랙돌분양",
        "고양이사료", "고양이사료추천", "키튼사료", "중성화사료", "노령묘사료",
        "고양이간식", "고양이츄르", "캣닢", "캣그라스", "동결건조간식",
        "고양이용품", "캣타워", "스크래처", "고양이집", "고양이터널",
        "고양이장난감", "낚싯대장난감", "공장난감", "레이저포인터", "자동장난감",
        "고양이화장실", "벤토나이트모래", "두부모래", "펠렛모래", "모래삽",
        "고양이미용", "고양이빗", "고양이발톱깎이", "고양이샴푸", "드라이샴푸",
        # 공통/기타 (30개)
        "동물병원", "강아지병원", "고양이병원", "24시동물병원", "야간동물병원",
        "예방접종", "중성화수술", "건강검진", "치석제거", "슬개골수술",
        "펫보험", "동물등록", "마이크로칩", "펫택시", "펫시터",
        "애견호텔", "캣호텔", "애견카페", "고양이카페", "반려견놀이터",
        "펫샵", "동물용품점", "펫페어", "반려동물박람회", "펫쇼",
        "토끼분양", "햄스터분양", "고슴도치분양", "앵무새분양", "파충류분양"
    ],
    "웨딩": [
        # 웨딩홀/스드메 (40개)
        "웨딩홀", "웨딩홀추천", "호텔웨딩", "호텔예식장", "하우스웨딩",
        "스몰웨딩", "야외웨딩", "가든웨딩", "루프탑웨딩", "채플웨딩",
        "강남웨딩홀", "청담웨딩홀", "여의도웨딩홀", "잠실웨딩홀", "인천웨딩홀",
        "웨딩드레스", "드레스대여", "드레스맞춤", "미니드레스", "셀프웨딩드레스",
        "턱시도", "예복대여", "신랑예복", "웨딩수트", "맞춤정장",
        "웨딩촬영", "스튜디오촬영", "야외촬영", "드레스피팅", "앨범제작",
        "본식스냅", "본식DVD", "원판DVD", "웨딩영상", "하이라이트영상",
        "웨딩플래너", "웨딩컨설팅", "웨딩견적", "웨딩박람회", "웨딩페어",
        # 신혼여행/예물 (40개)
        "신혼여행", "허니문", "허니문추천", "신혼여행지", "신혼여행패키지",
        "몰디브신혼여행", "발리신혼여행", "푸켓신혼여행", "하와이신혼여행", "유럽신혼여행",
        "괌신혼여행", "사이판신혼여행", "보라카이신혼여행", "세부신혼여행", "칸쿤신혼여행",
        "산토리니신혼여행", "파리신혼여행", "스위스신혼여행", "뉴질랜드신혼여행", "호주신혼여행",
        "예물", "결혼반지", "웨딩밴드", "다이아반지", "커플링",
        "예물시계", "예물목걸이", "예물귀걸이", "예물팔찌", "티파니",
        "까르띠에", "불가리", "반클리프아펠", "쇼메", "해리윈스턴",
        "예단", "혼수", "이불세트", "침구세트", "가전혼수",
        # 청첩장/기타 (20개)
        "청첩장", "모바일청첩장", "종이청첩장", "포토청첩장", "디지털청첩장",
        "웨딩카", "리무진", "웨딩데코", "플라워데코", "부케",
        "부토니에", "웨딩케이크", "폐백음식", "이바지", "답례품",
        "한복대여", "신부한복", "신랑한복", "혼주한복", "폐백한복"
    ],
    "육아": [
        # 출산/신생아 (40개)
        "출산준비", "출산용품", "신생아용품", "아기용품", "베이비용품",
        "산후조리원", "산후도우미", "산후조리", "모유수유", "분유추천",
        "젖병추천", "젖병소독기", "유축기", "수유쿠션", "수유브라",
        "기저귀추천", "신생아기저귀", "물티슈", "기저귀갈이대", "아기욕조",
        "아기로션", "아기크림", "아기샴푸", "아기비누", "아기세제",
        "배냇저고리", "신생아옷", "아기옷", "우주복", "바디수트",
        "손싸개", "발싸개", "아기모자", "양말", "속싸개",
        "유아침대", "아기침대", "범퍼침대", "아기이불", "낮잠이불",
        # 유아용품 (40개)
        "유모차", "유모차추천", "디럭스유모차", "휴대용유모차", "절충형유모차",
        "카시트", "신생아카시트", "토들러카시트", "부스터시트", "아이소픽스",
        "아기띠", "힙시트", "아기캐리어", "슬링", "포대기",
        "분유포트", "이유식", "이유식용품", "이유식마스터기", "아기식기",
        "아기숟가락", "빨대컵", "이유식냉동큐브", "하이체어", "부스터체어",
        "치발기", "아기장난감", "오감발달장난감", "모빌", "바운서",
        "점퍼루", "보행기", "걸음마보조기", "아기블록", "아기책",
        "아기그네", "미끄럼틀", "정글짐", "볼풀", "플레이매트",
        # 유아교육/건강 (20개)
        "어린이집", "유치원", "국공립어린이집", "직장어린이집", "가정어린이집",
        "놀이학교", "영어유치원", "유아영어", "한글교육", "수학교육",
        "아이병원", "소아과", "소아청소년과", "아이건강검진", "예방접종",
        "아토피", "알레르기", "아이비염", "아이감기", "아이발열"
    ]
}


# 이미 분석한 키워드 저장 (세션 간 유지)
analyzed_keywords_history = set()


def get_keywords_from_pool(count: int, categories: List[str] = None, exclude_analyzed: bool = True) -> List[str]:
    """키워드 풀에서 지정된 개수만큼 키워드 선택 (이미 분석한 키워드 제외 가능)"""
    global analyzed_keywords_history

    all_keywords = []

    if categories:
        for cat in categories:
            if cat in KEYWORD_POOL:
                all_keywords.extend(KEYWORD_POOL[cat])
    else:
        for keywords in KEYWORD_POOL.values():
            all_keywords.extend(keywords)

    # 중복 제거
    all_keywords = list(set(all_keywords))

    # 이미 분석한 키워드 제외
    if exclude_analyzed and analyzed_keywords_history:
        all_keywords = [kw for kw in all_keywords if kw not in analyzed_keywords_history]
        logger.info(f"Excluded {len(analyzed_keywords_history)} already analyzed keywords")

    # 셔플
    random.shuffle(all_keywords)

    return all_keywords[:count]


async def expand_keywords_with_related(base_keywords: List[str], target_count: int, exclude_analyzed: bool = True) -> List[str]:
    """
    네이버 연관 검색어를 활용하여 키워드를 대량 확장
    - 기본 키워드에서 자동완성 API로 연관 키워드 추출
    - 키워드 조합으로 추가 확장 (예: "강남" + "맛집" → "강남역맛집", "강남점심맛집" 등)
    - 이미 분석한 키워드 제외
    """
    import httpx
    import urllib.parse
    global analyzed_keywords_history

    expanded = set(base_keywords)
    processed = set()

    logger.info(f"Starting keyword expansion: {len(base_keywords)} base -> target {target_count}")

    # 1단계: 키워드 조합으로 먼저 확장 (API 호출 없이)
    suffixes = ["추천", "맛집", "병원", "치과", "피부과", "학원", "가격", "비용", "후기", "리뷰",
                "순위", "비교", "TOP10", "인기", "유명", "좋은", "괜찮은", "저렴한", "싼", "최고",
                "강남", "홍대", "신촌", "이태원", "부산", "대구", "인천", "수원", "분당", "판교"]
    prefixes = ["강남", "홍대", "신촌", "서울", "부산", "대구", "인천", "경기", "수원", "분당",
                "최고의", "인기", "유명", "추천", "2024", "2025"]

    for base in list(base_keywords)[:100]:  # 처음 100개 키워드만 조합
        if len(expanded) >= target_count:
            break
        for suffix in suffixes[:10]:
            combined = f"{base}{suffix}"
            if combined not in expanded:
                expanded.add(combined)
        for prefix in prefixes[:5]:
            combined = f"{prefix}{base}"
            if combined not in expanded:
                expanded.add(combined)

    logger.info(f"After combination expansion: {len(expanded)} keywords")

    # 2단계: 네이버 자동완성 API로 추가 확장
    if len(expanded) < target_count:
        async with httpx.AsyncClient(timeout=5.0) as client:
            keywords_to_expand = list(base_keywords)[:200]
            round_num = 1

            while len(expanded) < target_count and keywords_to_expand and round_num <= 10:
                logger.info(f"API expansion round {round_num}: {len(expanded)} keywords")
                new_keywords = []

                for keyword in keywords_to_expand:
                    if keyword in processed:
                        continue
                    if len(expanded) >= target_count:
                        break

                    processed.add(keyword)

                    try:
                        encoded_kw = urllib.parse.quote(keyword)
                        url = f"https://ac.search.naver.com/nx/ac?q={encoded_kw}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8"
                        resp = await client.get(url)
                        if resp.status_code == 200:
                            data = resp.json()
                            items = data.get("items", [[]])
                            if items and len(items) > 0:
                                for item in items[0][:10]:
                                    if isinstance(item, list) and len(item) > 0:
                                        new_kw = item[0]
                                        if new_kw not in expanded and new_kw not in processed:
                                            expanded.add(new_kw)
                                            new_keywords.append(new_kw)

                        await asyncio.sleep(0.02)  # 20ms 딜레이

                    except Exception as e:
                        logger.warning(f"API error for {keyword}: {e}")

                keywords_to_expand = new_keywords[:300]
                round_num += 1

    logger.info(f"After API expansion: {len(expanded)} keywords")

    # 이미 분석한 키워드 제외
    if exclude_analyzed and analyzed_keywords_history:
        before_count = len(expanded)
        expanded = expanded - analyzed_keywords_history
        logger.info(f"Excluded {before_count - len(expanded)} already analyzed keywords")

    result = list(expanded)
    random.shuffle(result)
    logger.info(f"Keyword expansion complete: {len(result)} keywords available")
    return result[:target_count]


# ========================================
# API 엔드포인트
# ========================================

class BatchLearningRequest(BaseModel):
    keyword_count: int = 100
    categories: Optional[List[str]] = None
    delay_between_keywords: float = 3.0  # 키워드 간 대기 시간 (초)
    delay_between_blogs: float = 0.5  # 블로그 간 대기 시간 (초)
    expand_keywords: bool = True  # 연관 키워드 자동 확장 여부


class BatchLearningStatus(BaseModel):
    is_running: bool
    current_keyword: str
    total_keywords: int
    completed_keywords: int
    total_blogs_analyzed: int
    total_posts_analyzed: int  # 글 분석 완료 수
    progress_percent: float
    start_time: Optional[str]
    estimated_remaining_minutes: float
    recent_keywords: List[str]
    errors_count: int
    accuracy_before: float
    accuracy_after: float


@router.post("/start")
async def start_batch_learning(
    request: BatchLearningRequest,
    background_tasks: BackgroundTasks
):
    """대량 키워드 학습 시작"""
    global learning_state

    if learning_state["is_running"]:
        raise HTTPException(status_code=400, detail="학습이 이미 진행 중입니다")

    # 기본 키워드 선택 (시드)
    base_keywords = get_keywords_from_pool(
        min(request.keyword_count, 500),  # 시드는 최대 500개
        request.categories,
        exclude_analyzed=True
    )

    if not base_keywords:
        raise HTTPException(status_code=400, detail="선택된 카테고리에 가용 키워드가 없습니다 (이미 모두 분석됨)")

    # 키워드 확장이 필요하면 연관 키워드로 확장
    if request.expand_keywords and request.keyword_count > len(base_keywords):
        logger.info(f"Expanding keywords: {len(base_keywords)} -> {request.keyword_count}")
        keywords = await expand_keywords_with_related(
            base_keywords,
            request.keyword_count,
            exclude_analyzed=True
        )
    else:
        keywords = base_keywords[:request.keyword_count]

    if not keywords:
        raise HTTPException(status_code=400, detail="키워드 확장 후에도 가용 키워드가 없습니다")

    # 현재 정확도 기록
    try:
        stats = get_learning_statistics()
        accuracy_before = stats.get("accuracy_within_3", 0)
    except:
        accuracy_before = 0

    # 학습 상태 초기화
    learning_state = {
        "is_running": True,
        "current_keyword": "",
        "total_keywords": len(keywords),
        "completed_keywords": 0,
        "total_blogs_analyzed": 0,
        "total_posts_analyzed": 0,
        "start_time": datetime.now().isoformat(),
        "estimated_end_time": None,
        "errors": [],
        "recent_keywords": [],
        "accuracy_before": accuracy_before,
        "accuracy_after": accuracy_before,
        "session_id": f"batch_{int(time.time())}"
    }

    # 학습 로그 초기화
    global learning_logs
    learning_logs = {
        "keywords": [],
        "keyword_details": {},
        "session_id": learning_state["session_id"],
        "start_time": learning_state["start_time"]
    }

    # 백그라운드에서 학습 실행
    background_tasks.add_task(
        run_batch_learning,
        keywords,
        request.delay_between_keywords,
        request.delay_between_blogs
    )

    return {
        "success": True,
        "message": f"{len(keywords)}개 키워드 학습을 시작합니다",
        "session_id": learning_state["session_id"],
        "keywords_selected": keywords[:10],  # 처음 10개만 미리보기
        "estimated_minutes": len(keywords) * request.delay_between_keywords / 60
    }


@router.post("/stop")
async def stop_batch_learning():
    """학습 중지"""
    global learning_state

    if not learning_state["is_running"]:
        raise HTTPException(status_code=400, detail="진행 중인 학습이 없습니다")

    learning_state["is_running"] = False

    return {
        "success": True,
        "message": "학습이 중지되었습니다",
        "completed_keywords": learning_state["completed_keywords"],
        "total_blogs_analyzed": learning_state["total_blogs_analyzed"]
    }


@router.get("/status", response_model=BatchLearningStatus)
async def get_learning_status():
    """학습 진행 상황 조회"""
    global learning_state

    progress = 0
    if learning_state["total_keywords"] > 0:
        progress = (learning_state["completed_keywords"] / learning_state["total_keywords"]) * 100

    # 남은 시간 계산
    remaining_minutes = 0
    if learning_state["is_running"] and learning_state["start_time"]:
        elapsed = time.time() - datetime.fromisoformat(learning_state["start_time"]).timestamp()
        if learning_state["completed_keywords"] > 0:
            avg_time = elapsed / learning_state["completed_keywords"]
            remaining = learning_state["total_keywords"] - learning_state["completed_keywords"]
            remaining_minutes = (avg_time * remaining) / 60

    return BatchLearningStatus(
        is_running=learning_state["is_running"],
        current_keyword=learning_state["current_keyword"],
        total_keywords=learning_state["total_keywords"],
        completed_keywords=learning_state["completed_keywords"],
        total_blogs_analyzed=learning_state["total_blogs_analyzed"],
        total_posts_analyzed=learning_state.get("total_posts_analyzed", 0),
        progress_percent=round(progress, 1),
        start_time=learning_state["start_time"],
        estimated_remaining_minutes=round(remaining_minutes, 1),
        recent_keywords=learning_state["recent_keywords"][-10:],
        errors_count=len(learning_state["errors"]),
        accuracy_before=learning_state["accuracy_before"],
        accuracy_after=learning_state["accuracy_after"]
    )


@router.get("/categories")
async def get_available_categories():
    """사용 가능한 키워드 카테고리 목록"""
    global analyzed_keywords_history

    # 각 카테고리별 가용 키워드 수 계산 (이미 분석한 것 제외)
    categories_info = []
    for key, keywords in KEYWORD_POOL.items():
        total = len(keywords)
        available = len([kw for kw in keywords if kw not in analyzed_keywords_history])
        categories_info.append({
            "id": key,
            "name": key,
            "count": total,
            "available": available
        })

    total_all = sum(len(v) for v in KEYWORD_POOL.values())
    total_available = sum(c["available"] for c in categories_info)

    return {
        "categories": categories_info,
        "total_keywords": total_all,
        "total_available": total_available,
        "already_analyzed": len(analyzed_keywords_history)
    }


@router.get("/keywords-preview")
async def preview_keywords(
    count: int = Query(default=50, le=500),
    categories: str = Query(default=None, description="쉼표로 구분된 카테고리")
):
    """학습할 키워드 미리보기"""
    cat_list = categories.split(",") if categories else None
    keywords = get_keywords_from_pool(count, cat_list)

    return {
        "count": len(keywords),
        "keywords": keywords
    }


@router.get("/logs")
async def get_learning_logs(
    limit: int = Query(default=50, le=200, description="최근 키워드 개수")
):
    """학습 로그 조회 - 분석된 키워드와 블로그 목록"""
    global learning_logs

    # 최근 키워드 목록 (역순으로)
    recent_keywords = learning_logs.get("keywords", [])[-limit:][::-1]

    return {
        "session_id": learning_logs.get("session_id"),
        "start_time": learning_logs.get("start_time"),
        "total_keywords_analyzed": len(learning_logs.get("keywords", [])),
        "keywords": recent_keywords
    }


@router.get("/logs/{keyword}")
async def get_keyword_log_detail(keyword: str):
    """특정 키워드의 상세 학습 로그 조회"""
    global learning_logs

    if keyword not in learning_logs.get("keyword_details", {}):
        raise HTTPException(status_code=404, detail=f"'{keyword}' 키워드의 로그를 찾을 수 없습니다")

    return learning_logs["keyword_details"][keyword]


@router.get("/logs-summary")
async def get_logs_summary():
    """학습 로그 요약 정보"""
    global learning_logs

    total_blogs = 0
    keyword_stats = []

    for kw, detail in learning_logs.get("keyword_details", {}).items():
        blogs = detail.get("blogs", [])
        total_blogs += len(blogs)
        keyword_stats.append({
            "keyword": kw,
            "blog_count": len(blogs),
            "timestamp": detail.get("timestamp")
        })

    return {
        "session_id": learning_logs.get("session_id"),
        "start_time": learning_logs.get("start_time"),
        "total_keywords": len(learning_logs.get("keywords", [])),
        "total_blogs": total_blogs,
        "keyword_stats": sorted(keyword_stats, key=lambda x: x.get("timestamp", ""), reverse=True)[:50]
    }


@router.get("/analyzed-history")
async def get_analyzed_history():
    """이미 분석한 키워드 히스토리 조회"""
    global analyzed_keywords_history

    return {
        "count": len(analyzed_keywords_history),
        "keywords": sorted(list(analyzed_keywords_history))[:500]  # 최대 500개까지 표시
    }


@router.post("/reset-history")
async def reset_analyzed_history():
    """분석 히스토리 초기화 (같은 키워드 다시 분석 가능)"""
    global analyzed_keywords_history

    count = len(analyzed_keywords_history)
    analyzed_keywords_history = set()

    return {
        "success": True,
        "message": f"{count}개 키워드 히스토리가 초기화되었습니다",
        "cleared_count": count
    }


# ========================================
# 백그라운드 학습 함수
# ========================================

async def run_batch_learning(
    keywords: List[str],
    delay_between_keywords: float,
    delay_between_blogs: float
):
    """백그라운드에서 대량 키워드 학습 실행"""
    global learning_state, learning_logs

    # 필요한 모듈 임포트
    from routers.blogs import fetch_naver_search_results, analyze_blog, analyze_post

    logger.info(f"Starting batch learning: {len(keywords)} keywords")

    for idx, keyword in enumerate(keywords):
        if not learning_state["is_running"]:
            logger.info("Batch learning stopped by user")
            break

        learning_state["current_keyword"] = keyword

        # 이 키워드에 대한 로그 초기화
        keyword_log = {
            "keyword": keyword,
            "timestamp": datetime.now().isoformat(),
            "blogs": [],
            "search_results_count": 0,
            "analyzed_count": 0,
            "errors": []
        }

        try:
            # 1. 네이버 검색 결과 가져오기
            search_results = await fetch_naver_search_results(keyword, limit=13)

            if not search_results:
                learning_state["errors"].append(f"{keyword}: 검색 결과 없음")
                keyword_log["errors"].append("검색 결과 없음")
                learning_logs["keywords"].append(keyword)
                learning_logs["keyword_details"][keyword] = keyword_log
                continue

            keyword_log["search_results_count"] = len(search_results)

            # 2. 각 블로그 분석 및 학습 데이터 수집
            blogs_analyzed = 0
            for result in search_results:
                if not learning_state["is_running"]:
                    break

                try:
                    blog_id = result["blog_id"]
                    actual_rank = result["rank"]
                    post_title = result.get("post_title", result.get("title", ""))
                    blog_name = result.get("blog_name", blog_id)
                    post_url = result.get("post_url", "")

                    # 1. 블로그 분석 (전체 블로그 품질)
                    analysis = await analyze_blog(blog_id)
                    stats = analysis.get("stats", {})
                    index = analysis.get("index", {})

                    # 2. 개별 글 분석 (상위 노출된 해당 글의 특성)
                    post_features = {}
                    if post_url:
                        try:
                            post_analysis = await analyze_post(post_url, keyword)
                            post_features = {
                                "title_has_keyword": post_analysis.get("title_has_keyword", False),
                                "title_keyword_position": post_analysis.get("title_keyword_position", -1),
                                "content_length": post_analysis.get("content_length", 0),
                                "image_count": post_analysis.get("image_count", 0),
                                "video_count": post_analysis.get("video_count", 0),
                                "keyword_count": post_analysis.get("keyword_count", 0),
                                "keyword_density": post_analysis.get("keyword_density", 0),
                                "heading_count": post_analysis.get("heading_count", 0),
                                "paragraph_count": post_analysis.get("paragraph_count", 0),
                                "has_map": post_analysis.get("has_map", False),
                                "has_link": post_analysis.get("has_link", False),
                                "like_count": post_analysis.get("like_count", 0),
                                "comment_count": post_analysis.get("comment_count", 0),
                                "post_age_days": post_analysis.get("post_age_days"),
                            }
                        except Exception as e:
                            logger.warning(f"Post analysis failed for {post_url}: {e}")

                    # 학습 샘플 저장 (블로그 + 글 특성 통합)
                    breakdown = index.get("score_breakdown", {})
                    c_rank_detail = breakdown.get("c_rank_detail", {})
                    dia_detail = breakdown.get("dia_detail", {})

                    blog_features = {
                        # 블로그 전체 특성
                        "c_rank_score": breakdown.get("c_rank", 0),
                        "dia_score": breakdown.get("dia", 0),
                        "context_score": c_rank_detail.get("context", 50),
                        "content_score": c_rank_detail.get("content", 50),
                        "chain_score": c_rank_detail.get("chain", 50),
                        "depth_score": dia_detail.get("depth", 50),
                        "information_score": dia_detail.get("information", 50),
                        "accuracy_score": dia_detail.get("accuracy", 50),
                        "post_count": stats.get("total_posts", 0),
                        "neighbor_count": stats.get("neighbor_count", 0),
                        "visitor_count": stats.get("total_visitors", 0),
                        # 개별 글 특성 추가
                        **post_features
                    }

                    add_learning_sample(
                        keyword=keyword,
                        blog_id=blog_id,
                        actual_rank=actual_rank,
                        predicted_score=index.get("total_score", 0),
                        blog_features=blog_features
                    )

                    # 블로그 + 글 로그 저장
                    keyword_log["blogs"].append({
                        "blog_id": blog_id,
                        "blog_name": blog_name,
                        "post_title": post_title,
                        "post_url": post_url,
                        "actual_rank": actual_rank,
                        "predicted_score": round(index.get("total_score", 0), 1),
                        "c_rank": round(breakdown.get("c_rank", 0), 1),
                        "dia": round(breakdown.get("dia", 0), 1),
                        "post_count": stats.get("total_posts", 0),
                        "blog_url": f"https://blog.naver.com/{blog_id}",
                        # 글 분석 결과 추가
                        "post_analysis": {
                            "content_length": post_features.get("content_length", 0),
                            "image_count": post_features.get("image_count", 0),
                            "video_count": post_features.get("video_count", 0),
                            "keyword_count": post_features.get("keyword_count", 0),
                            "keyword_density": post_features.get("keyword_density", 0),
                            "title_has_keyword": post_features.get("title_has_keyword", False),
                            "heading_count": post_features.get("heading_count", 0),
                            "has_map": post_features.get("has_map", False),
                        } if post_features else None
                    })

                    blogs_analyzed += 1
                    learning_state["total_blogs_analyzed"] += 1

                    # 글 분석이 성공했으면 카운트 증가
                    if post_features and post_features.get("content_length", 0) > 0:
                        learning_state["total_posts_analyzed"] += 1

                    # 블로그 간 딜레이 (네이버 차단 방지)
                    await asyncio.sleep(delay_between_blogs)

                except Exception as e:
                    logger.warning(f"Error analyzing blog in {keyword}: {e}")
                    keyword_log["errors"].append(f"블로그 분석 오류: {str(e)[:50]}")

            # 키워드 로그 완료
            keyword_log["analyzed_count"] = blogs_analyzed
            learning_logs["keywords"].append(keyword)
            learning_logs["keyword_details"][keyword] = keyword_log

            # 분석 완료된 키워드를 히스토리에 추가 (중복 분석 방지)
            analyzed_keywords_history.add(keyword)

            # 키워드 완료
            learning_state["completed_keywords"] += 1
            learning_state["recent_keywords"].append(f"{keyword} ({blogs_analyzed}개)")

            # 최근 키워드 10개만 유지
            if len(learning_state["recent_keywords"]) > 20:
                learning_state["recent_keywords"] = learning_state["recent_keywords"][-20:]

            logger.info(f"Completed {keyword}: {blogs_analyzed} blogs analyzed")

            # 10개 키워드마다 모델 학습 실행
            if learning_state["completed_keywords"] % 10 == 0:
                await run_model_training()

            # 키워드 간 딜레이 (네이버 차단 방지)
            await asyncio.sleep(delay_between_keywords)

        except Exception as e:
            logger.error(f"Error processing keyword {keyword}: {e}")
            learning_state["errors"].append(f"{keyword}: {str(e)}")

    # 최종 모델 학습
    await run_model_training()

    learning_state["is_running"] = False
    logger.info(f"Batch learning completed: {learning_state['completed_keywords']} keywords, {learning_state['total_blogs_analyzed']} blogs")


async def run_model_training():
    """수집된 데이터로 모델 학습"""
    global learning_state

    try:
        from database.learning_db import get_learning_samples

        samples = get_learning_samples(limit=1000)
        if len(samples) >= 20:
            current_weights = get_current_weights()
            if current_weights:
                new_weights, info = instant_adjust_weights(
                    samples=samples,
                    current_weights=current_weights,
                    target_accuracy=95.0,
                    max_iterations=50,
                    learning_rate=0.03,
                    momentum=0.9
                )
                save_current_weights(new_weights)
                learning_state["accuracy_after"] = info.get("final_accuracy", 0)
                logger.info(f"Model trained: accuracy {info.get('initial_accuracy', 0):.1f}% -> {info.get('final_accuracy', 0):.1f}%")
    except Exception as e:
        logger.error(f"Model training failed: {e}")
