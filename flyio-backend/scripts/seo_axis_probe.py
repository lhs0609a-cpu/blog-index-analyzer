# -*- coding: utf-8 -*-
"""축별 키워드 우주의 **천장**을 잰다.

왜 이 도구가 필요한가: "○○ 관련 콘텐츠 1만 개" 같은 요구가 실현 가능한지는
그 축에 키워드가 실제로 몇 개 있느냐로 정해진다. 추측하면 안 되고 재야 한다.
BFS 로 frontier 가 0이 될 때까지 파서, 더 캘 게 없는 지점을 확인한다.

실측 기록:
  블로그 메타축(지수·로직·상위노출)  2,055개 (검색량 100↑ 383) — frontier 소진
  주제축(맛집·여행·의료…)            102,150개 이상 — 소진되지 않음

  python scripts/seo_axis_probe.py ad   280    # 파워링크·검색광고 축
  python scripts/seo_axis_probe.py blog 400    # 블로그 메타축
"""
import asyncio, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.naver_ad_service import NaverAdApiClient

SEEDS = [
    "파워링크", "파워링크광고", "네이버파워링크", "파워링크단가", "파워링크입찰",
    "네이버검색광고", "검색광고", "키워드광고", "네이버키워드광고", "CPC광고",
    "네이버광고", "광고단가", "광고비", "입찰가", "노출순위",
    "파워컨텐츠", "브랜드검색", "플레이스광고", "쇼핑검색광고", "네이버쇼핑광고",
    "검색광고센터", "광고관리시스템", "네이버광고대행사", "광고대행", "대행사수수료",
    "품질지수", "클릭률", "전환율", "ROAS", "광고효율",
    "구글애즈", "구글광고", "카카오광고", "당근광고", "메타광고",
    "네이버검색광고시스템", "광고소재", "확장소재", "제외키워드", "광고그룹",
]
AXIS = sys.argv[1] if len(sys.argv) > 1 else "ad"
BUDGET_S = float(sys.argv[2]) if len(sys.argv) > 2 else 300.0

# 광고축 토큰. STRONG 하나면 인정, WEAK 는 2개 이상.
STRONG = ("파워링크", "검색광고", "키워드광고", "파워컨텐츠", "브랜드검색",
          "구글애즈", "애드워즈", "광고대행", "플레이스광고", "쇼핑검색광고",
          "확장소재", "제외키워드", "광고그룹", "품질지수", "roas")
WEAK = ("광고", "입찰", "단가", "cpc", "cpm", "노출", "클릭", "전환",
        "네이버", "구글", "카카오", "예산", "효율", "대행")
EXCLUDE = ("광고지우기", "광고차단", "광고제거", "유튜브프리미엄", "광고없이",
           "팝업차단", "광고스킵")


def to_int(v):
    if v is None: return 0
    if isinstance(v, (int, float)): return int(v)
    s = str(v).replace(",", "").strip()
    if s.startswith("<"): return 5
    try: return int(float(s))
    except (ValueError, TypeError): return 0


def is_ad(kw: str) -> bool:
    k = (kw or "").lower()
    if any(x in k for x in EXCLUDE): return False
    if any(t in k for t in STRONG): return True
    return sum(1 for t in WEAK if t in k) >= 2


async def main():
    client = NaverAdApiClient()
    seen = {}
    frontier, visited = list(SEEDS), set()
    calls = 0
    t0 = time.time()
    while frontier and time.time() - t0 < BUDGET_S:
        batch = []
        while frontier and len(batch) < 5:
            h = frontier.pop(0).replace(" ", "")
            if h and h not in visited:
                visited.add(h); batch.append(h)
        if not batch: break
        try:
            resp = await client._request("GET", "/keywordstool",
                {"hintKeywords": ",".join(batch), "showDetail": "1"})
            calls += 1
        except Exception as e:
            print(f"[warn] {str(e)[:80]}", flush=True); await asyncio.sleep(1.2); continue
        items = resp.get("keywordList", []) if isinstance(resp, dict) else []
        for it in items:
            kw = (it.get("relKeyword") or "").strip()
            if not kw or not is_ad(kw): continue
            vol = to_int(it.get("monthlyPcQcCnt")) + to_int(it.get("monthlyMobileQcCnt"))
            if kw not in seen:
                seen[kw] = vol
                if kw not in visited and len(frontier) < 8000:
                    frontier.append(kw)
        if calls % 40 == 0:
            print(json.dumps({"calls": calls, "ad_seen": len(seen),
                              "ge100": sum(1 for v in seen.values() if v >= 100),
                              "frontier": len(frontier), "t": round(time.time()-t0,1)},
                             ensure_ascii=False), flush=True)
        await asyncio.sleep(0.3)
    top = sorted(seen.items(), key=lambda x: -x[1])[:25]
    out = {"calls": calls, "elapsed_s": round(time.time()-t0,1),
           "ad_total_any_volume": len(seen),
           "ge_100": sum(1 for v in seen.values() if v >= 100),
           "frontier_left": len(frontier), "exhausted": len(frontier) == 0,
           "top25": top}
    print("RESULT " + json.dumps(out, ensure_ascii=False), flush=True)
    out_path = os.environ.get("DATA_DIR", "/data") + f"/_seo_axis_{AXIS}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"axis": AXIS, "keywords": seen, "summary": out}, f, ensure_ascii=False)

asyncio.run(main())
