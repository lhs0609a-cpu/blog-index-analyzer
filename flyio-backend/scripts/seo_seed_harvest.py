# -*- coding: utf-8 -*-
"""SEO 키워드 큐 씨앗 수확.

왜 필요한가 (2026-09-23 실측):
크론(.github/workflows/seo-pages-cron.yml)은 매시 정상으로 돌지만 한 달째
1분 만에 끝난다 — "측정 대상 없음". 고장이 아니라 **캘 게 없어서** 끝난 것이다.
메타축(블로그·지수·상위노출)만 열어두면 검색량 100 이상 키워드 우주가 371개이고
그중 340개가 이미 발행됐다. 주제축을 열면 같은 기준으로 10만 개 이상이다.

이 스크립트는 keywordstool BFS 로 주제축 키워드를 검색량과 함께 캐서 큐에 넣는다.
필터는 여기서 새로 만들지 않는다 — enqueue_with_volume() 이 in_domain() 과
MIN_QUEUE_VOLUME 을 그대로 적용하므로, 판정은 한 군데(seo_keyword_pages_db)에만 산다.

  python seo_seed_harvest.py --target 12000 --budget 900            # 드라이런(기본)
  python seo_seed_harvest.py --target 12000 --budget 900 --apply    # 실제 큐 적재
"""
import argparse, asyncio, json, os, random, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import seo_keyword_pages_db as seo_db
from services.naver_ad_service import NaverAdApiClient

# 네이버 블로그에 글이 실제로 쌓이는 주제축. category_weights.CATEGORY_KEYWORDS
# 의 10개 도메인 카테고리를 덮도록 고른다 — 판정기가 아는 축에서만 캐야
# 수확물의 대부분이 게이트를 통과한다.
SEEDS = [
    # 맛집
    "맛집", "카페추천", "디저트", "고깃집", "횟집", "브런치카페", "술집", "베이커리",
    # 여행
    "여행", "호텔추천", "펜션", "리조트", "제주도여행", "일본여행", "국내여행", "캠핑장",
    # 의료
    "피부과", "치과", "한의원", "정형외과", "건강검진", "임플란트", "교정", "영양제",
    # 뷰티
    "화장품추천", "선크림", "스킨케어", "헤어살롱", "네일", "향수추천", "마스크팩",
    # IT
    "노트북추천", "스마트폰", "이어폰추천", "모니터추천", "키보드추천", "카메라추천",
    # 육아
    "육아용품", "유모차", "카시트", "이유식", "기저귀", "어린이집", "임신준비", "돌잔치",
    # 교육
    "영어학원", "수학학원", "인강", "토익", "자격증", "코딩학원", "공무원시험", "과외",
    # 재테크
    "주식투자", "부동산", "적금추천", "대출", "보험추천", "연금저축", "etf", "절세",
    # 반려동물
    "강아지사료", "고양이용품", "동물병원", "애견카페", "펫호텔", "강아지훈련",
    # 인테리어
    "인테리어", "소파추천", "매트리스", "조명", "이사업체", "청소업체", "에어컨", "청소기",
    # 메타축(블로그 운영) — 남은 30개를 마저 줍는다
    "블로그지수", "블로그상위노출", "체험단", "애드포스트", "블로그마케팅",
]


def to_int(v):
    """keywordstool 의 '< 10' 은 문자열이다. 숫자로 긁으면 10이 되어 후보가 2배로 부푼다."""
    if v is None:
        return 0
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v).replace(",", "").strip()
    if s.startswith("<"):
        return 5
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return 0


async def harvest(target: int, budget_s: float, expand_min_vol: int):
    client = NaverAdApiClient()
    harvested: dict = {}          # in_domain 통과 + 검색량 >= MIN_QUEUE_VOLUME
    rejected_sample: list = []    # 게이트 탈락 표본 (사람이 눈으로 확인할 용도)
    frontier, visited = list(SEEDS), set()
    calls = 0
    t0 = time.time()

    while frontier and len(harvested) < target and time.time() - t0 < budget_s:
        batch = []
        while frontier and len(batch) < 5:
            h = frontier.pop(0).replace(" ", "")   # 공백 포함 시 네이버 11001 거부
            if h and h not in visited:
                visited.add(h)
                batch.append(h)
        if not batch:
            break
        try:
            resp = await client._request(
                "GET", "/keywordstool",
                {"hintKeywords": ",".join(batch), "showDetail": "1"},
            )
            calls += 1
        except Exception as e:
            print(f"[warn] {batch[:2]}… -> {str(e)[:100]}", flush=True)
            await asyncio.sleep(1.5)
            continue

        items = resp.get("keywordList", []) if isinstance(resp, dict) else []
        for it in items:
            kw = (it.get("relKeyword") or "").strip()
            if not kw or kw in harvested:
                continue
            vol = to_int(it.get("monthlyPcQcCnt")) + to_int(it.get("monthlyMobileQcCnt"))
            if vol < seo_db.MIN_QUEUE_VOLUME:
                continue
            if not seo_db.in_domain(kw):
                if len(rejected_sample) < 400:
                    rejected_sample.append(kw)
                continue
            harvested[kw] = vol
            # 수요가 큰 것의 이웃만 다시 캔다. 무제한 확장하면 도메인에서 멀어진다.
            if vol >= expand_min_vol and kw not in visited and len(frontier) < 6000:
                frontier.append(kw)

        if calls % 50 == 0:
            print(json.dumps({"calls": calls, "harvested": len(harvested),
                              "frontier": len(frontier), "t": round(time.time() - t0, 1)},
                             ensure_ascii=False), flush=True)
        await asyncio.sleep(0.3)

    return harvested, rejected_sample, calls, time.time() - t0


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, default=12000)
    ap.add_argument("--budget", type=float, default=900.0)
    ap.add_argument("--expand-min-vol", type=int, default=1000)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    seo_db.init_seo_pages_db()
    before = seo_db.stats()

    harvested, rejected, calls, elapsed = await harvest(
        args.target, args.budget, args.expand_min_vol
    )

    rnd = random.Random(20260923)
    accepted_sample = rnd.sample(list(harvested), min(60, len(harvested)))
    rejected_sample = rnd.sample(rejected, min(30, len(rejected)))

    report = {
        "calls": calls,
        "elapsed_s": round(elapsed, 1),
        "harvested": len(harvested),
        "min_volume": seo_db.MIN_QUEUE_VOLUME,
        "queue_before": before["queue"],
        "accepted_sample": sorted(
            ((k, harvested[k]) for k in accepted_sample), key=lambda x: -x[1]
        ),
        "rejected_sample": rejected_sample,
    }

    if args.apply:
        added = seo_db.enqueue_with_volume(harvested, source="topic_axis_harvest", depth=1)
        report["enqueued"] = added
        report["queue_after"] = seo_db.stats()["queue"]
    else:
        report["enqueued"] = 0
        report["note"] = "DRY RUN — --apply 를 붙여야 큐에 들어간다"

    with open(os.environ.get("DATA_DIR", "/data") + "/_seo_seed_harvest.json", "w", encoding="utf-8") as f:
        json.dump({"harvested": harvested, "report": report}, f, ensure_ascii=False)
    print("REPORT " + json.dumps(report, ensure_ascii=False), flush=True)


asyncio.run(main())
