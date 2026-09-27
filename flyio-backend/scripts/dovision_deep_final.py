# -*- coding: utf-8 -*-
"""딥리서치 원장 → 온도메인 채택 + 간절도 점수 + 중분류 배정 → CSV/JSON.

간절도 기준은 하나: **지금 두비전에 전화할 학부모인가.**
  - 내방 직전 행동(지역+학원/클리닉, 검사예약, 상담·비용 문의)이 가장 간절하다.
  - 진단명을 들고 온 사람(난독·경계선지능·느린학습자·ADHD)은 이미 돈을 쓰고 있다.
  - 고통 표현('공부해도성적이안올라')은 간절하지만 아직 해결책 미정 → 그 다음.
  - 방법 정보 탐색('암기법')은 볼륨은 크고 전환은 얕다 → 중간.
  - 무료/자료/pdf/다운로드/디시는 사러 온 사람이 아니다 → 감점.
"""
import csv, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dovision_deep_classify import classify, MIN_VOL, REGION_RE  # noqa: E402

RAW = os.path.join(HERE, "_dv_deep_raw.json")
AC = os.path.join(HERE, "_dv_deep_ac_vol.json")        # 자동완성 채널
AC2 = os.path.join(HERE, "_dv_deep_ac2_vol.json")      # 자동완성 2차
REGION = os.path.join(HERE, "_dv_deep_region_vol.json")  # 지역×서비스 조합
OUT_J = os.path.join(HERE, "dovision_deep_final.json")
OUT_C = os.path.join(HERE, "dovision_deep_final.csv")

BANDS = [
    ("내방직전", 55, ("학습클리닉", "학습센터", "학습코칭", "학습상담", "학습컨설팅",
                  "기억력학원", "암기법학원", "집중력학원", "두뇌학원", "공부방법학원",
                  "검사예약", "검사비용", "상담예약", "무료검사", "검사받는곳", "잘하는곳",
                  "추천", "비용", "가격", "학원비", "수강료", "상담")),
    ("진단보유", 50, ("난독", "경계선지능", "느린학습자", "학습장애", "adhd", "주의력결핍",
                  "읽기장애", "난산", "인지발달지연", "지적장애", "학습치료", "인지치료",
                  "웩슬러", "풀배터리", "종합심리검사")),
    ("검사탐색", 42, ("인지능력검사", "학습능력검사", "학습유형검사", "지능검사", "아이큐검사",
                  "뇌기능검사", "뇌파검사", "두뇌검사", "학습진단", "주의력검사", "다중지능",
                  "영재판별", "적성검사", "기질검사")),
    ("고통표현", 40, ("성적이안", "성적안오", "공부해도", "아무리공부", "머리나쁜", "이해력부족",
                  "기억을못", "돌아서면", "금방까먹", "까먹", "집중못", "집중이안", "산만한",
                  "공부싫", "공부안하", "학습부진", "기초학력", "성적하락", "고민")),
    ("솔루션탐색", 32, ("훈련", "프로그램", "코칭", "클리닉", "센터", "과외", "학원", "교습소",
                   "수업", "강의", "커리큘럼", "교재")),
    ("방법정보", 22, ("암기법", "기억법", "공부법", "공부방법", "학습법", "외우는법", "기억술",
                  "메타인지", "마인드맵", "속독", "노트필기", "오답노트", "공부습관",
                  "자기주도", "집중력높이", "기억력향상")),
    ("브랜드대체", 28, ("눈높이", "구몬", "빨간펜", "씽크빅", "재능교육", "홈런", "밀크티",
                   "엘리하이", "천재교육", "대교", "한우리", "기탄", "셀파", "와이즈만",
                   "시매쓰", "소마", "cms", "필즈", "팩토", "학습지")),
]
PENALTY = (("무료", -12), ("자료", -10), ("pdf", -14), ("다운", -14), ("한글파일", -14),
           ("ppt", -12), ("디시", -16), ("나무위키", -16), ("더쿠", -16), ("블로그", -8),
           ("유튜브", -10), ("뜻", -10), ("영어로", -12), ("뜻풀이", -12), ("사이트", -6),
           ("앱", -6), ("게임", -10), ("테스트해보기", -8), ("이미지", -6), ("사진", -8))


def score(kw, axis, total):
    k = kw.replace(" ", "").lower()
    s, label = 10, "일반"
    for lb, sc, toks in BANDS:
        if any(t in k for t in toks):
            if sc > s:
                s, label = sc, lb
    if REGION_RE.search(k) and any(t in k for t in ("학원", "클리닉", "센터", "교습소",
                                                   "공부방", "과외", "검사")):
        s += 15; label = "지역내방"           # 지역어 = 내방 가능 거리
    for t, p in PENALTY:
        if t in k:
            s += p
    # 볼륨 보정 — 아주 큰 머리어는 전환이 얕고 CPC 만 비싸다
    if total >= 20000:
        s -= 6
    elif total >= 5000:
        s -= 3
    return max(0, s), label


def load_pool():
    """세 채널을 하나의 원장으로 합친다. 같은 키워드는 더 큰 볼륨을 남긴다."""
    pool = json.load(open(RAW, encoding="utf-8"))
    src = {k: "연관확장" for k in pool}
    for path, tag in ((AC, "자동완성"), (AC2, "자동완성2"), (REGION, "지역조합")):
        if not os.path.exists(path):
            continue
        for kw, v in json.load(open(path, encoding="utf-8")).items():
            if not v:
                continue
            e = pool.get(kw)
            if e is None:
                pool[kw] = {"total": v, "pc": 0, "mo": 0, "comp": None,
                            "clk": 0, "axes": [tag], "anchors": []}
                src[kw] = tag
            else:
                e["total"] = max(e["total"], v)
                if src.get(kw) and tag not in src[kw]:
                    src[kw] += "+" + tag
    return pool, src


def main():
    pool, src = load_pool()
    rows = []
    for kw, v in pool.items():
        ax, why = classify(kw)
        if ax is None or v["total"] < MIN_VOL:
            continue
        sc, band = score(kw, ax, v["total"])
        rows.append({"keyword": kw, "monthly_total": v["total"], "monthly_pc": v["pc"],
                     "monthly_mobile": v["mo"], "comp_idx": v.get("comp"),
                     "axis": ax, "band": band, "score": sc,
                     "source": src.get(kw, "연관확장")})
    rows.sort(key=lambda r: (-r["score"], -r["monthly_total"]))
    json.dump(rows, open(OUT_J, "w", encoding="utf-8"), ensure_ascii=False)
    with open(OUT_C, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)

    print(f"원장 {len(pool):,} → 채택 {len(rows):,} / 월검색합 "
          f"{sum(r['monthly_total'] for r in rows):,}")
    from collections import Counter
    print("\n[중분류]")
    ca, cv = Counter(), Counter()
    for r in rows:
        ca[r["axis"]] += 1; cv[r["axis"]] += r["monthly_total"]
    for a, n in ca.most_common():
        print(f"  {a:16} {n:>7,}개  월검색 {cv[a]:>10,}")
    print("\n[간절도 밴드]")
    cb, cbv = Counter(), Counter()
    for r in rows:
        cb[r["band"]] += 1; cbv[r["band"]] += r["monthly_total"]
    for b, n in cb.most_common():
        print(f"  {b:12} {n:>7,}개  월검색 {cbv[b]:>10,}")
    print("\n[상위 30]")
    for r in rows[:30]:
        print(f"  {r['score']:>3} {r['monthly_total']:>7,} {r['axis']:<12} "
              f"{r['band']:<10} {r['keyword']}")
    print(f"\n→ {OUT_C}")


if __name__ == "__main__":
    main()
