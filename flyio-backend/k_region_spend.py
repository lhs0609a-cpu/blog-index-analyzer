# -*- coding: utf-8 -*-
"""지점 없는 지역 키워드가 어느 캠페인/그룹에 사는지 + 예산 절감 레버 진단 (READ-ONLY)

레버 판정
  ① 캠페인의 라이브 인스턴스가 사실상 전부 '지점없는지역' → 캠페인 일예산 인하가 정답
  ② 섞여 있음 → 캠페인 예산을 건들면 온도메인이 같이 죽는다 → 해당 키워드 입찰만 70원
     ⚠ useGroupBidAmt(그룹 기본입찰 상속)면 그룹을 내리면 안 되고 개별입찰을 새로 박아야 한다
"""
import json, os, sys
from collections import Counter, defaultdict

D = os.path.dirname(os.path.abspath(__file__))
P = lambda n: os.path.join(D, n)
sys.stdout.reconfigure(encoding="utf-8")

G = json.load(open(P("k_groups.json"), encoding="utf-8"))
K = json.load(open(P("k_kws.json"), encoding="utf-8"))
S = json.load(open(P("k_split5.json"), encoding="utf-8"))
RA, RB = set(S["REGION_A"]), set(S["REGION_B"])

camp_live = Counter()          # 캠페인별 라이브 인스턴스 총계
camp_A = Counter()
camp_B = Counter()
rows_A = []                    # (kw, kid, gid, cname, eff_bid, ugb)
rows_B = []
for gid, rows in K.items():
    g = G.get(gid) or {}
    gok = g.get("gstatus") == "ELIGIBLE" and not g.get("guserLock")
    cok = g.get("cstatus") == "ELIGIBLE" and not g.get("cuserLock")
    cname, gbid = g.get("cname") or "?", g.get("gbid") or 0
    for kw, kid, bid, ugb, lock, st, reg in rows:
        if lock or st != "ELIGIBLE" or not gok or not cok:
            continue
        camp_live[cname] += 1
        eff = gbid if ugb else (bid or 0)
        if kw in RA:
            camp_A[cname] += 1
            rows_A.append((kw, kid, gid, cname, eff, ugb))
        elif kw in RB:
            camp_B[cname] += 1
            rows_B.append((kw, kid, gid, cname, eff, ugb))

CB = {}
for g in G.values():
    CB[g.get("cname")] = g.get("cbudget") or 0

print("── A등급(충청·호남·강원·제주) 라이브 인스턴스가 사는 캠페인 ──")
print(f"{'캠페인':<28}{'일예산':>9}{'A건':>7}{'B건':>7}{'캠전체':>8}{'A비중':>8}")
for c, n in camp_A.most_common(30):
    tot = camp_live[c]
    print(f"{c:<28}{CB.get(c,0):>9,}{n:>7,}{camp_B[c]:>7,}{tot:>8,}{n/max(tot,1)*100:>7.1f}%")

print(f"\nA 라이브 인스턴스 합 {sum(camp_A.values()):,} / B {sum(camp_B.values()):,}")
inh = sum(1 for r in rows_A if r[5])
print(f"A 중 그룹입찰 상속 {inh:,} ({inh/max(len(rows_A),1)*100:.1f}%) — 개별입찰 신규 지정 필요")
print(f"A 현재 유효입찰 합 {sum(r[4] for r in rows_A):,}원 / 70원 통일 시 {len(rows_A)*70:,}원")
b70 = sum(1 for r in rows_A if r[4] <= 70)
print(f"  이미 70원 이하 {b70:,}건 → 실제 하향 대상 {len(rows_A)-b70:,}건")

# 캠페인이 통째로 '지점없는지역' 인 곳 = 예산 인하가 맞는 곳
print("\n── 캠페인 전체가 사실상 타지역인 곳(예산 인하 후보) ──")
for c, n in camp_A.most_common():
    tot = camp_live[c]
    if tot and (n + camp_B[c]) / tot >= 0.8:
        print(f"   {c:<26} 일예산 {CB.get(c,0):>7,}  타지역 {(n+camp_B[c]):,}/{tot:,}")

json.dump({"A": rows_A, "B": rows_B}, open(P("k_region_rows.json"), "w", encoding="utf-8"),
          ensure_ascii=False)
print("\n저장: k_region_rows.json")
