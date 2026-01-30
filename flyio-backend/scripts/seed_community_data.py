"""
커뮤니티 시드 데이터 생성 스크립트
자연스러운 게시글/댓글 1만개 생성
"""
import os
import sys
import random
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict
import json

# Supabase 설정
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ SUPABASE_URL과 SUPABASE_KEY 환경변수를 설정하세요")
    print("예: set SUPABASE_URL=https://xxx.supabase.co")
    print("    set SUPABASE_KEY=eyJ...")
    sys.exit(1)

from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ============ 자연스러운 표현들 ============

# 감탄사/추임새
EXCLAMATIONS = [
    "ㅋㅋㅋ", "ㅋㅋㅋㅋ", "ㅋㅋㅋㅋㅋ", "ㅎㅎ", "ㅎㅎㅎ",
    "ㅠㅠ", "ㅜㅜ", "ㅠㅜ", "ㅡㅡ", ";;", "...", "ㄷㄷ", "ㄷㄷㄷ",
    "ㅇㅇ", "ㄹㅇ", "ㅇㅈ", "ㄱㅇㄷ", "ㅇㄱㄹㅇ", "ㅁㅊ", "ㅈㄹ",
    "헐", "대박", "미쳤다", "레전드", "실화냐", "ㄹㅇㅋㅋ",
    "와", "오", "우와", "와씨", "아니", "진짜", "마자", "맞아",
]

# 긍정 반응
POSITIVE = [
    "좋네요", "좋아요", "굳굳", "굿굿", "ㄱㄱ", "개꿀", "꿀팁", "갓",
    "짱", "최고", "인정", "ㅇㅈ", "공감", "이거다", "찐이다",
    "너무좋아요", "감사합니다", "도움됐어요", "유용하네요",
    "오 이거 괜찮네", "이거 대박인데", "찐으로 도움됨",
]

# 부정/불만 반응
NEGATIVE = [
    "에휴", "짜증", "ㅂㄷㅂㄷ", "ㅡㅡ", "하..", "아오", "ㅠㅠ",
    "힘드네", "어렵다", "안되네", "왜이래", "뭐지", "이상하네",
    "ㅈ같네", "빡치네", "열받아", "답답", "미치겠다",
]

# 질문 표현
QUESTIONS = [
    "이거 어케함?", "어떻게 해요?", "이게 뭐임?", "뭔가요?",
    "혹시 아시는분?", "도와주세요ㅠㅠ", "질문있어요", "궁금한게",
    "이거 맞나요?", "진짜인가요?", "효과있나요?", "해보신분?",
    "경험자분?", "아시는분 계신가요", "저만 그런가요",
]

# 블로그 운영 관련 주제
TOPICS = {
    "tip": [
        "블로그 상위노출 팁",
        "C-Rank 올리는 법",
        "D.I.A. 점수 높이는 방법",
        "키워드 선정하는 법",
        "블로그 지수 올리기",
        "이웃 늘리는 방법",
        "방문자수 늘리는 팁",
        "블로그 수익화 방법",
        "애드포스트 수익 인증",
        "체험단 신청 꿀팁",
        "원고료 협찬 받는법",
        "블로그 마케팅 노하우",
        "상위노출 성공 후기",
        "저품질 탈출 방법",
        "최적화 블로그 만들기",
    ],
    "question": [
        "블로그 저품질 왜 걸리나요",
        "상위노출이 안돼요",
        "C-Rank가 뭔가요",
        "D.I.A. 점수 어떻게 봐요",
        "키워드 몇개가 적당해요",
        "글 몇개 써야 상위노출",
        "이웃 몇명이면 최적화",
        "방문자 100명 어떻게",
        "애드포스트 승인 조건",
        "체험단 어디서 신청",
        "블로그 지수 확인 방법",
        "최적화 블로그 기준",
        "저품질 확인하는 법",
        "상위노출 유지 기간",
        "키워드 경쟁도 확인",
    ],
    "free": [
        "오늘 블로그 현황",
        "드디어 상위노출 성공",
        "방문자 1000명 돌파",
        "첫 체험단 당첨",
        "애드포스트 수익 인증",
        "블로그 시작 1개월차",
        "오늘 쓴 글 피드백",
        "슬럼프 왔어요",
        "동기부여 필요해요",
        "블로그 하면서 느낀점",
        "오늘도 화이팅",
        "블로그 루틴 공유",
        "일상 + 블로그 병행",
        "직장인 블로거 일상",
        "육아맘 블로거 일상",
    ],
    "success": [
        "드디어 상위노출 성공했어요",
        "첫 협찬 후기",
        "월 수익 100만원 달성",
        "방문자 1만명 돌파",
        "최적화 블로그 됐어요",
        "저품질 탈출 성공",
        "C-Rank 70점 달성",
        "상위노출 1위 찍음",
        "첫 원고료 입금",
        "체험단 10개 동시 진행중",
    ],
}

# 게시글 내용 템플릿
POST_TEMPLATES = {
    "tip": [
        """안녕하세요 블로그 {months}개월차입니다
오늘은 {topic}에 대해 공유할게요 {exc}

제가 직접 해보니까 확실히 효과있더라구요
{tip1}
{tip2}
{tip3}

이거 ㄹㅇ 해보시면 바로 효과봄
저도 이거 하고 {result}

혹시 궁금한거 있으면 댓글 남겨주세요~""",

        """{topic} 꿀팁 공유함 {exc}

1. {tip1}
2. {tip2}
3. {tip3}

이거 안하면 손해임 ㄹㅇ
나도 이거 모르고 {months}개월 날렸음 ㅠㅠ

도움됐으면 좋아요 ㄱㄱ""",

        """블로그 하시는 분들 필독 {exc}

{topic} 진짜 중요한데 모르는 분들 많더라

핵심만 말하면
- {tip1}
- {tip2}
- {tip3}

이거 하고 {result} 실화임
질문은 댓글로~""",
    ],

    "question": [
        """저 블로그 {months}개월찬데요 ㅠㅠ
{topic}?

{problem}
이거 왜이러는지 아시는분 ㅠㅠ

{detail}
진짜 답답해서 글 올립니다 도와주세요""",

        """{topic}?? {exc}

블로그 하시는분들 질문있어요

{problem}
이거 어떻게 해결하셨어요?

{detail}
경험자분들 답변 부탁드려요~""",

        """초보 질문입니다 ㅠㅠ

{topic}??

{problem}

{detail}
아시는분 댓글좀요 {exc}""",
    ],

    "free": [
        """오늘 블로그 현황 공유 {exc}

글 {posts}개 / 방문자 {visitors}명 / 이웃 {neighbors}명

{feeling}
{plan}

다들 오늘도 화이팅 {exc2}""",

        """{months}개월차 블로거입니다 {exc}

요즘 {feeling}

{thought}

블로그 하시는분들 다 공감하시죠? ㅋㅋ
댓글로 공감해주세요~""",

        """그냥 끄적끄적 {exc}

{feeling}

{thought}

{plan}

읽어주셔서 감사해요 {exc2}""",
    ],

    "success": [
        """와 드디어 {achievement} {exc}{exc}{exc}

솔직히 포기할뻔 했는데 ㄹㅇ 기뻐서 글씀

{months}개월 걸렸어요
{process}

{tip}

포기하지 마세요 여러분도 할 수 있어요!!""",

        """{achievement} 인증 {exc}

후... 드디어 해냈다 ㅠㅠ

{months}개월동안 {process}

비결은 {secret}

다들 화이팅!!""",

        """ㅋㅋㅋㅋ {achievement}

나 진짜 대박 ㅠㅠㅠㅠ

{months}개월만에 드디어

{process}

{tip}

질문 받아요~""",
    ],
}

# 댓글 템플릿
COMMENT_TEMPLATES = [
    # 공감/응원
    "오 {exc} 저도 해봐야겠어요",
    "와 대박 {exc} 도움됐어요",
    "이거 진짜 꿀팁이네요 {exc}",
    "감사합니다 {exc} 바로 적용해볼게요",
    "저도 이렇게 하니까 효과봤어요 ㅎㅎ",
    "ㅇㅈ {exc} 인정합니다",
    "굳굳 좋은 정보네요",
    "오 이거 몰랐는데 {exc}",
    "저장해둡니다 {exc}",
    "공유 감사해요!",
    "화이팅 {exc}",
    "응원합니다 {exc}",
    "저도 같이 해볼게요",
    "좋은 글 감사합니다~",

    # 질문
    "근데 이거 {question}?",
    "혹시 {question} 아세요?",
    "질문있는데 {question}",
    "이거 {question}인가요?",
    "저도 궁금했는데 {question}",

    # 경험 공유
    "저도 이거 해봤는데 {result}",
    "저는 {alternative} 했어요",
    "근데 저는 {experience}",
    "오 저도 {months}개월차인데 공감",
    "저도 비슷한 경험 있어요 ㅋㅋ",

    # 부정적/불만
    "저는 안되던데 ㅠㅠ",
    "이거 해봤는데 효과 별로였어요",
    "음 저는 다른 방법이 나았어요",
    "어렵네요 ㅠㅠ",
    "저만 안되나..",

    # 짧은 반응
    "ㅋㅋㅋㅋ",
    "ㅇㅈ",
    "ㄹㅇ",
    "굳",
    "ㅎㅎ",
    "오오",
    "와",
    "대박",
    "인정",
    "공감",
    "ㅠㅠ",
    "화이팅!",
    "굿굿",
    "꿀팁",
]

# 팁 내용
TIPS = [
    "키워드 3개 이상 넣기",
    "제목에 키워드 필수",
    "본문 2000자 이상 쓰기",
    "이미지 최소 10장",
    "매일 1포스팅",
    "이웃 소통 열심히",
    "댓글 답글 꼭 달기",
    "상위노출 키워드 분석",
    "경쟁 낮은 키워드 공략",
    "롱테일 키워드 활용",
    "시리즈물로 연재하기",
    "정보성 글 위주로",
    "직접 찍은 사진 사용",
    "솔직한 후기 작성",
    "검색자 입장에서 글쓰기",
    "서론-본론-결론 구조",
    "소제목 활용하기",
    "핵심 키워드 반복",
    "관련 키워드 추가",
    "내부링크 걸기",
]

# 결과/성과
RESULTS = [
    "상위노출 됐어요",
    "방문자 2배 늘었어요",
    "이웃 100명 늘었음",
    "C-Rank 올랐어요",
    "D.I.A. 점수 상승",
    "첫 협찬 받음",
    "애드포스트 승인",
    "최적화 됐어요",
    "저품질 탈출함",
    "월수익 10만원 달성",
]

# 문제/고민
PROBLEMS = [
    "갑자기 방문자가 뚝 떨어졌어요",
    "상위노출이 하루만에 내려갔어요",
    "글을 써도 노출이 안돼요",
    "C-Rank가 계속 낮아요",
    "저품질인것 같은데 확인이 안돼요",
    "이웃은 많은데 방문자가 적어요",
    "어떤 키워드를 써야할지 모르겠어요",
    "경쟁 키워드는 너무 어렵고..",
    "매일 쓰는데 효과가 없어요",
    "뭘 잘못하고 있는지 모르겠어요",
]

# 감정/느낌
FEELINGS = [
    "요즘 블로그가 너무 재밌어요",
    "슬럼프가 좀 왔어요 ㅠㅠ",
    "동기부여가 필요해요",
    "귀찮은데 해야해서..",
    "보람찬 하루였어요",
    "오늘 좀 힘들었어요",
    "뿌듯해요 ㅎㅎ",
    "아직 갈길이 멀어요",
    "조금씩 성장하는게 보여요",
    "포기하고 싶을때도 있어요",
]

# ============ 데이터 생성 함수 ============

def add_typo(text: str) -> str:
    """랜덤하게 오타 추가"""
    if random.random() < 0.1:  # 10% 확률
        typos = [
            ("ㅋㅋㅋ", "ㅋㅋㅋㅋ"),
            ("요", "욤"),
            ("어요", "어용"),
            ("해요", "햄"),
            ("네요", "넹"),
            ("죠", "쥬"),
            (" ", ""),  # 띄어쓰기 제거
        ]
        old, new = random.choice(typos)
        text = text.replace(old, new, 1)
    return text


def generate_post_content(category: str) -> Dict:
    """게시글 내용 생성"""
    topic = random.choice(TOPICS.get(category, TOPICS["free"]))
    template = random.choice(POST_TEMPLATES.get(category, POST_TEMPLATES["free"]))

    months = random.randint(1, 24)
    posts = random.randint(10, 500)
    visitors = random.randint(50, 5000)
    neighbors = random.randint(20, 2000)

    content = template.format(
        topic=topic,
        months=months,
        posts=posts,
        visitors=visitors,
        neighbors=neighbors,
        exc=random.choice(EXCLAMATIONS),
        exc2=random.choice(EXCLAMATIONS),
        tip1=random.choice(TIPS),
        tip2=random.choice(TIPS),
        tip3=random.choice(TIPS),
        tip=random.choice(TIPS),
        result=random.choice(RESULTS),
        problem=random.choice(PROBLEMS),
        detail=random.choice(FEELINGS),
        feeling=random.choice(FEELINGS),
        thought=random.choice(FEELINGS),
        plan=f"내일은 {random.choice(TIPS)} 해봐야겠어요",
        achievement=random.choice(RESULTS),
        process=f"매일 글 쓰면서 {random.choice(TIPS)} 했어요",
        secret=random.choice(TIPS),
        question="",
        alternative="다른 방법",
        experience="비슷한 경험",
    )

    content = add_typo(content)

    return {
        "title": add_typo(topic),
        "content": content,
        "category": category,
    }


def generate_comment() -> str:
    """댓글 내용 생성"""
    template = random.choice(COMMENT_TEMPLATES)

    comment = template.format(
        exc=random.choice(EXCLAMATIONS),
        question=random.choice(["이거 얼마나 걸려요", "어떤 키워드요", "몇개월 하셨어요", "효과 있어요"]),
        result=random.choice(RESULTS),
        alternative=random.choice(TIPS),
        experience=random.choice(FEELINGS),
        months=random.randint(1, 12),
    )

    return add_typo(comment)


async def create_posts_batch(count: int, start_user_id: int = 1000) -> List[int]:
    """게시글 배치 생성"""
    posts_data = []
    categories = ["free", "tip", "question", "success"]
    weights = [0.4, 0.3, 0.2, 0.1]  # free가 가장 많음

    for i in range(count):
        category = random.choices(categories, weights=weights)[0]
        post = generate_post_content(category)

        # 랜덤 시간 (최근 30일 내)
        days_ago = random.randint(0, 30)
        hours_ago = random.randint(0, 23)
        created_at = (datetime.now() - timedelta(days=days_ago, hours=hours_ago)).isoformat()

        posts_data.append({
            "user_id": start_user_id + random.randint(0, 500),
            "title": post["title"],
            "content": post["content"],
            "category": post["category"],
            "tags": [],
            "views": random.randint(10, 1000),
            "likes": random.randint(0, 50),
            "comments_count": 0,  # 나중에 업데이트
            "created_at": created_at,
        })

    # Supabase에 삽입
    try:
        response = supabase.table("posts").insert(posts_data).execute()
        post_ids = [p["id"] for p in response.data]
        print(f"✅ {len(post_ids)}개 게시글 생성 완료")
        return post_ids
    except Exception as e:
        print(f"❌ 게시글 생성 실패: {e}")
        return []


async def create_comments_batch(post_ids: List[int], comments_per_post: int = 3, start_user_id: int = 1000):
    """댓글 배치 생성"""
    comments_data = []

    for post_id in post_ids:
        # 각 게시글에 0~comments_per_post*2개 댓글 (랜덤)
        num_comments = random.randint(0, comments_per_post * 2)

        for _ in range(num_comments):
            days_ago = random.randint(0, 7)
            hours_ago = random.randint(0, 23)
            created_at = (datetime.now() - timedelta(days=days_ago, hours=hours_ago)).isoformat()

            comments_data.append({
                "post_id": post_id,
                "user_id": start_user_id + random.randint(0, 500),
                "content": generate_comment(),
                "created_at": created_at,
            })

    if not comments_data:
        return

    # 배치로 나눠서 삽입 (한 번에 100개씩)
    batch_size = 100
    for i in range(0, len(comments_data), batch_size):
        batch = comments_data[i:i+batch_size]
        try:
            supabase.table("post_comments").insert(batch).execute()
        except Exception as e:
            print(f"❌ 댓글 배치 실패: {e}")

    print(f"✅ {len(comments_data)}개 댓글 생성 완료")

    # 각 게시글의 comments_count 업데이트
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
        # 각 게시글에 0~30개 좋아요 (랜덤)
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

    # 배치로 나눠서 삽입
    batch_size = 100
    success_count = 0
    for i in range(0, len(likes_data), batch_size):
        batch = likes_data[i:i+batch_size]
        try:
            supabase.table("post_likes").insert(batch).execute()
            success_count += len(batch)
        except Exception as e:
            # 중복 무시
            pass

    print(f"✅ {success_count}개 좋아요 생성 완료")


async def create_user_points_batch(count: int = 500, start_user_id: int = 1000):
    """사용자 포인트 배치 생성"""
    users_data = []

    for i in range(count):
        user_id = start_user_id + i
        total_points = random.randint(0, 5000)

        # 레벨 계산
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

    # 배치로 삽입
    batch_size = 100
    for i in range(0, len(users_data), batch_size):
        batch = users_data[i:i+batch_size]
        try:
            supabase.table("user_points").upsert(batch).execute()
        except Exception as e:
            print(f"⚠️ 사용자 포인트 배치 경고: {e}")

    print(f"✅ {len(users_data)}명 사용자 포인트 생성 완료")


async def main():
    """메인 실행"""
    print("=" * 50)
    print("커뮤니티 시드 데이터 생성 시작")
    print("=" * 50)

    # 설정
    TOTAL_POSTS = 10000
    BATCH_SIZE = 100
    START_USER_ID = 1000

    print(f"\n목표: 게시글 {TOTAL_POSTS}개")
    print(f"배치 크기: {BATCH_SIZE}개씩")
    print(f"사용자 ID 범위: {START_USER_ID} ~ {START_USER_ID + 500}")

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

        # API 부하 방지
        await asyncio.sleep(0.5)

    print(f"  총 {len(all_post_ids)}개 게시글 생성됨")

    # 3. 댓글 생성
    print(f"\n[3/4] 댓글 생성 중...")
    # 배치로 처리
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
    print("✅ 시드 데이터 생성 완료!")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
