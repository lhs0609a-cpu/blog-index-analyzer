# -*- coding: utf-8 -*-
"""무관 키워드 전수감사 리포트 + 삭제계획(dry-run) 생성"""
import csv, json, os, sys
from collections import Counter, defaultdict

D = os.path.dirname(os.path.abspath(__file__))
P = lambda n: os.path.join(D, n)
sys.stdout.reconfigure(encoding="utf-8")
S = json.load(open(P("k_split5.json"), encoding="utf-8"))

A_BUCKETS = ["OFF", "JUNK", "REGION_A"]
B_BUCKETS = ["ADULT", "INFO", "REGION_B", "NEG", "SUPP", "SPORT", "CARE", "BROAD"]
LAB = {"OFF": "명백 무관(주제 이탈)", "JUNK": "기계생성 쓰레기",
       "REGION_A": "지점 없는 지역(충청·호남·강원·제주)",
       "ADULT": "성인 비만/다이어트", "INFO": "정보성 질의",
       "REGION_B": "지점 도시 아님(울산·경북·경남·경기외곽)",
       "NEG": "프로파일 negative(예상키·평균키·계산기)", "SUPP": "건기식/영양제",
       "SPORT": "스포츠/체육", "CARE": "육아/어린이집", "BROAD": "단독 초광범위어"}

out = []
print("=" * 78)
print("키네스(441986) 무관 키워드 전수감사 — 2026-08-12")
print("=" * 78)
tot_uni = sum(len(v) for v in S.values())
print(f"\n등록 키워드 고유 {tot_uni:,} / 인스턴스 {sum(v['inst'] for d in S.values() for v in d.values()):,}\n")

for grade, bl in (("A", A_BUCKETS), ("B", B_BUCKETS)):
    gu = gi = gl = 0
    print(f"── {grade}등급 ──")
    for b in bl:
        d = S.get(b) or {}
        if not d:
            continue
        li = sum(v["live"] for v in d.values())
        ii = sum(v["inst"] for v in d.values())
        gu += len(d); gi += ii; gl += li
        print(f"   {LAB[b]:<36} 고유 {len(d):>6,}   등록 {ii:>6,}   노출가능 {li:>6,}")
    print(f"   {'소계':<36} 고유 {gu:>6,}   등록 {gi:>6,}   노출가능 {gl:>6,}\n")

# 지역별 상세
print("── A등급 지역 상세 (지점 없는 광역권) ──")
byarea = defaultdict(Counter)
for kw, v in S["REGION_A"].items():
    area, tok = v["why"].split(":")
    byarea[area][tok] += 1
for area in ["충청", "호남", "강원", "제주"]:
    c = byarea[area]
    print(f"   [{area}] 고유 {sum(c.values()):,}  — " +
          ", ".join(f"{k} {n}" for k, n in c.most_common(12)))
print("\n── B등급 지역 상세 ──")
byarea = defaultdict(Counter)
for kw, v in S["REGION_B"].items():
    area, tok = v["why"].split(":")
    byarea[area][tok] += 1
for area in ["울산", "경북", "경남", "경기외곽"]:
    c = byarea[area]
    print(f"   [{area}] 고유 {sum(c.values()):,}  — " +
          ", ".join(f"{k} {n}" for k, n in c.most_common(12)))

# 돈이 나갈 위험 상위 (노출가능 × 유효입찰)
print("\n── 지금 광고비가 나갈 위험 상위 40 (노출가능 & 입찰 높은 순) ──")
risk = []
for b in A_BUCKETS + B_BUCKETS:
    for kw, v in (S.get(b) or {}).items():
        if v["live"]:
            risk.append((v["maxbid"], v["live"], kw, b, v["why"], v["vol"]))
risk.sort(reverse=True)
for bid, live, kw, b, why, vol in risk[:40]:
    print(f"   {kw:<26} 입찰 {bid:>7,}원  노출가능 {live:<3} 월검색 {vol if vol is not None else '-':<6} [{LAB[b]}]")

# 삭제 계획 (A등급) — 정확 ID
plan = {}
for b in A_BUCKETS:
    for kw, v in (S.get(b) or {}).items():
        plan[kw] = {"bucket": b, "why": v["why"], "ids": v["ids"],
                    "live": v["live"], "maxbid": v["maxbid"], "vol": v["vol"]}
json.dump(plan, open(P("k_delete_planA.json"), "w", encoding="utf-8"), ensure_ascii=False)
nid = sum(len(v["ids"]) for v in plan.values())
print(f"\n삭제계획(A등급) 저장: k_delete_planA.json — 고유 {len(plan):,} / 삭제 대상 인스턴스 {nid:,}")

# 광고주 지목 키워드 대조표
FLAG = ["자세교정슬리퍼", "대전성장판검사", "군산성장클리닉", "전주성장판검사", "제주성장검사",
        "강릉성장클리닉", "영어어린이집", "사춘기멜론키", "어린이집매매", "내반슬교정",
        "서귀포소아비만", "소아비만합병증", "순천성장판검사", "익산청소년성장클리닉",
        "조경앤드밀", "대전성장호르몬", "엠비티아이검사", "일산비만클리닉", "초경가격",
        "대전성장클리닉"]
loc = {kw: b for b, d in S.items() for kw in d}
print("\n── 광고주가 노란색으로 지목한 키워드 대조 ──")
for f in FLAG:
    b = loc.get(f)
    if not b:
        print(f"   {f:<20} ▷ 계정에 등록돼 있지 않음(이미 삭제됨 — 보고서 기간에만 존재)")
    else:
        v = S[b][f]
        print(f"   {f:<20} ▷ {LAB.get(b, b)} / 노출가능 {v['live']} / 입찰 {v['maxbid']:,}원")
