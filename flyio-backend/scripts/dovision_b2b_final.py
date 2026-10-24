# -*- coding: utf-8 -*-
"""두비전 B2B 최종 큐레이션 — 축(중분류) × 소분류 확정 + 눈검수 제외.

분류 라벨은 서버 _DOVISION_TAXONOMY 에 넣을 이름과 1:1. 캠페인명은
'[두비전] 창업·수익 - <중분류>', 광고그룹명은 <소분류> 가 된다.

제외 사유는 코드에 남긴다 — 나중에 "왜 뺐나" 를 다시 묻지 않으려고.
"""
import csv, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# ── 눈검수 제외: 페르소나가 아예 다르거나 두비전이 팔 수 없는 것 ──────
EXCLUDE_SUBSTR = [
    # 다른 직군 자격 — 아동교육과 무관
    "경비지도사", "노인", "실버", "치매", "요양", "장애인활동",
    "스포츠지도사", "생활체육", "체육지도사", "수영강사", "탁구", "무용", "댄스",
    "노래강사", "캘리그라피", "컴퓨터강사", "한국어지도사", "중국어지도사",
    "안전교육지도사", "안전지도사", "은퇴설계",
    # 취업(피고용) 트랙 — 창업/가맹 상담으로 안 온다
    "어린이집일자리", "유치원일자리", "맘시터", "육아도우미", "노인일자리",
    "돌봄교사채용", "강사구인", "강사채용", "지도사채용",
    # 남성·20대 — 두비전 가맹주 페르소나 아님(광고주 검토 대상으로 뺌)
    "남자", "남성", "20대",
    # 인쇄·판촉 발주 의도 (원장이지만 '전환' 의도가 아니라 '구매' 의도)
    "홍보물", "전단지제작", "전단지디자인", "개원선물", "홍보물품",
    # 손부업(포장·조립) — 교육과 무관
    "손부업",
    # 오분류
    "대학원생모집", "평생직업교육학원등록",
]

# ── 소분류 배정 (중분류 → [(소분류, 토큰...)]) — 위에서부터 첫 매칭 ──
SUBS = {
    "교육창업": [
        # 예체능·영어 학원 창업 — 페르소나(교육업 예비창업자)는 맞지만 두비전 과목이 아니다.
        # 광고주가 통째로 끄기 쉽게 맨 앞에서 따로 걷어낸다.
        ("타업종교육창업", ("미술", "피아노", "음악", "실용음악", "영어", "윤선생", "체육", "태권도")),
        ("공부방창업", ("공부방",)),
        ("교습소창업", ("교습소",)),
        ("학원창업·인수", ("학원창업", "학원차리", "학원개원", "학원인수", "학원양도", "학원컨설")),
        ("교육프랜차이즈", ("프랜차이즈", "교육창업", "교육사업", "교육가맹")),
        ("교육창업일반", ()),
    ],
    "운영·원생모집": [
        ("원생모집", ("원생모집", "학생모집", "수강생모집")),
        ("학원홍보·마케팅", ("홍보", "마케팅", "전단지")),
        ("운영실무", ()),
    ],
    "지도사·자격입문": [
        ("독서·논술지도사", ("독서", "논술", "글쓰기", "문해", "토론", "그림책", "스토리텔링")),
        ("수학·사고력지도사", ("수학", "연산", "주산", "창의", "코딩", "AI", "SW", "인지", "학습코칭",
                        "자기주도", "학습지도사", "두뇌")),
        ("유아·교구지도사", ("가베", "몬테소리", "교구", "놀이", "유아", "한글", "동화", "구연",
                       "부모교육", "발달", "특수")),
        ("한자·기타지도사", ()),
    ],
    "교사·강사모집": [
        ("학습지·방문교사", ("학습지", "방문교사", "방문선생", "구몬", "눈높이", "재능교육",
                       "씽크빅", "빨간펜", "밀크티", "홈런", "대교")),
        ("공부방·교습소교사", ("공부방", "교습소")),
        ("방과후·돌봄교사", ("방과후", "돌봄")),
        ("강사모집일반", ()),
    ],
    "가맹모집·상담": [
        ("교육가맹문의", ("학원", "교육", "수학", "영어", "국어", "독서", "논술", "미술", "전집", "초등")),
        ("가맹·설명회", ()),
    ],
    "창업비용·수익성": [
        ("여성창업지원금", ("지원금", "창업자금", "지원사업", "경진대회", "지원센터")),
        ("소자본창업", ("소자본", "1인창업", "무점포")),
        ("수익·비용", ()),
    ],
    "인허가·절차": [
        ("공부방·교습소신고", ("공부방", "교습소", "개인과외")),
        ("학원등록·자격", ()),
    ],
    "주부·경단녀": [
        ("주부부업·재택", ("부업", "재택", "투잡", "집에서")),
        ("여성창업", ("창업",)),
        ("경단녀·여성일자리", ("경단녀", "경력단절", "여성일자리", "여자직업", "여성직업",
                        "주부일자리", "일자리", "직업", "할수있는일")),
        ("중년·주부자격증", ()),
    ],
}

def sub_of(mid, kw):
    for label, toks in SUBS[mid]:
        if not toks:
            return label
        if any(t.lower() in kw.lower() for t in toks):
            return label
    return SUBS[mid][-1][0]

def main():
    keep = json.load(open(os.path.join(HERE, "_dovision_b2b_keep.json"), encoding="utf-8"))
    rows, dropped = [], []
    for kw, v in keep.items():
        if any(x in kw for x in EXCLUDE_SUBSTR):
            dropped.append((v["total"], kw)); continue
        mid = v["axis"]
        rows.append({"keyword": kw, "monthly_total": v["total"], "monthly_pc": v["pc"],
                     "monthly_mobile": v["mo"], "comp_idx": v["comp"],
                     "mid": mid, "sub": sub_of(mid, kw)})
    rows.sort(key=lambda r: (r["mid"], r["sub"], -r["monthly_total"]))
    json.dump(rows, open(os.path.join(HERE, "dovision_b2b_final.json"), "w",
                         encoding="utf-8"), ensure_ascii=False, indent=0)
    with open(os.path.join(HERE, "dovision_b2b_final.csv"), "w", encoding="utf-8-sig",
              newline="") as f:
        w = csv.DictWriter(f, fieldnames=["mid", "sub", "keyword", "monthly_total",
                                          "monthly_pc", "monthly_mobile", "comp_idx"])
        w.writeheader()
        for r in rows:
            w.writerow({k: r[k] for k in w.fieldnames})
    import collections
    agg = collections.defaultdict(lambda: [0, 0])
    for r in rows:
        a = agg[(r["mid"], r["sub"])]; a[0] += 1; a[1] += r["monthly_total"]
    print(f"최종 {len(rows):,}개 / 월검색합 {sum(r['monthly_total'] for r in rows):,}"
          f"   (눈검수 제외 {len(dropped)}개)")
    cur = None
    for (mid, sub), (n, vol) in sorted(agg.items()):
        if mid != cur:
            tn = sum(v[0] for k, v in agg.items() if k[0] == mid)
            tv = sum(v[1] for k, v in agg.items() if k[0] == mid)
            print(f"\n■ {mid}  —  {tn}개 / {tv:,}회"); cur = mid
        print(f"    └ {sub:<18} {n:>4}개 {vol:>8,}회")
    print("\n제외 상위:", ", ".join(f"{k}({t:,})" for t, k in sorted(dropped, reverse=True)[:15]))

if __name__ == "__main__":
    main()
