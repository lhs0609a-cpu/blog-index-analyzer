# -*- coding: utf-8 -*-
"""등록 안 된 것들이 '왜' 막혔는지 로컬에서 재현한다.

등록 워커의 도메인 게이트(_run_pool_register)와 같은 판정을 여기서 돌려,
컷 사유를 neg-token / 점수미달 / 정크 로 쪼갠다. 점수미달이면 relevance_keywords 에
무슨 어휘가 빠졌는지가 답이다.
"""
import json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.environ.get("KT_DIR", ""))
from dovision_axis3_bfs import grade  # noqa: E402

NEG_BASE = (
    "침대", "매트", "매트리스", "선반", "가구", "대여", "렌탈", "렌트", "침구", "이불",
    "베개", "소파", "책상", "의자", "수납", "옷장", "주택", "분양", "아파트", "오피스텔",
    "인테리어", "조명", "커튼", "벽지", "그릇", "용기", "포장", "택배", "자동차", "중고차",
    "타이어", "보험", "대출", "적금", "예금", "주식", "펀드", "코인", "비트코인", "재테크",
    "여행", "호텔", "펜션", "리조트", "항공권", "강의", "학원", "인강", "과외", "토익",
    "토플", "자격증", "공무원", "게임", "영화", "드라마", "웹툰", "만화", "레시피", "맛집",
    "식당", "배달", "쇼핑몰", "직구", "운동화", "신발", "가방", "지갑", "선글라스", "안경",
    "화장품", "향수", "립스틱", "컨실러", "쿠션", "파운데이션", "비비크림", "마스카라",
    "유산균", "젤리", "홍삼", "영양제", "비타민제", "콜라겐젤리", "오메가3", "프로틴",
    "노트북", "휴대폰", "에어컨", "냉장고", "세탁기", "청소기", "공기청정기",
)
ALLOW = {"학원", "과외", "강의", "인강", "자격증", "대여"}
NEG = tuple(t for t in NEG_BASE if t not in ALLOW)
JUNK = ("후기", "추천", "비용", "상담", "전문", "정보", "비교", "잘하는곳")


def build_gate():
    prof = json.load(urllib.request.urlopen(
        "https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/"
        "domain-profile?user_id=1&customer_id=4403292", timeout=180))["profile"]
    rel = [s for s in prof["relevance_keywords"] if s and len(s) >= 2]
    ga3, ga2 = set(), set()
    for s in rel:
        if len(s) >= 4:
            ga3.add(s)
        for n in (2, 3):
            for i in range(len(s) - n + 1):
                a = s[i:i + n]
                (ga2 if len(a) == 2 else ga3).add(a)
    return rel, ga3, ga2


def why(kw, rel, ga3, ga2):
    c = kw.replace(" ", "")
    if len(c) >= 20:
        return "정크:길이"
    dup = [t for t in JUNK if c.count(t) >= 2]
    if dup:
        return f"정크:{dup[0]}중복"
    hit = [n for n in NEG if n in c]
    if hit:
        return f"neg:{hit[0]}"
    sc = 0
    for s in rel:
        if s in kw:
            sc = 100
            break
        if kw and kw in s:
            sc = 95
            break
    if sc == 0:
        sc = min(95, min(80, sum(1 for a in ga3 if a in kw) * 20)
                 + min(30, sum(1 for a in ga2 if a in kw) * 5))
    return "통과" if sc >= 30 else f"점수:{sc}"


def main():
    rel, ga3, ga2 = build_gate()
    b2b = {r["keyword"]: r["monthly_total"]
           for r in json.load(open(os.path.join(HERE, "dovision_b2b_final.json"), encoding="utf-8"))}
    gap = {k: v["total"] for k, v in
           json.load(open(os.path.join(HERE, "dovision_gap_found.json"), encoding="utf-8")).items()}
    ax = json.load(open(os.path.join(HERE, "_dovision_axis3_raw.json"), encoding="utf-8"))
    ax = {k: v["total"] for k, v in ax.items()
          if v["total"] >= 10 and grade(k) in ("S", "A")
          and "운전직" not in k and "전직지원" not in k}
    allkw = {**b2b, **gap, **ax}

    import collections
    reasons = collections.defaultdict(list)
    for k, v in allkw.items():
        r = why(k, rel, ga3, ga2)
        if r != "통과":
            reasons[r.split(":")[0]].append((v, k, r))
    for grp, lst in sorted(reasons.items(), key=lambda kv: -len(kv[1])):
        lst.sort(reverse=True)
        print(f"\n■ {grp} — {len(lst)}개 / 월 {sum(x[0] for x in lst):,}")
        for v, k, r in lst[:30]:
            print(f"   {v:>7,} {k:<26} [{r}]")


if __name__ == "__main__":
    main()
