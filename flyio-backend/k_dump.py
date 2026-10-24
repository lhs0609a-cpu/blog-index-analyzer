# -*- coding: utf-8 -*-
"""키네스 전량 재덤프 (READ-ONLY) — 캠페인 → 광고그룹 → 키워드(정확 ID 포함)"""
import json, os, sys, threading
from concurrent.futures import ThreadPoolExecutor

D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, D)
P = lambda n: os.path.join(D, n)
sys.stdout.reconfigure(encoding="utf-8")
from _kiness_raw import raw

# ── 캠페인 ──
if os.path.exists(P("k_camps.json")) and os.path.getsize(P("k_camps.json")) > 100:
    C = json.load(open(P("k_camps.json"), encoding="utf-8"))
else:
    C = raw("/ncc/campaigns") or []
    C = [c for c in C if not c.get("delFlag")]
    json.dump(C, open(P("k_camps.json"), "w", encoding="utf-8"), ensure_ascii=False)
print(f"캠페인 {len(C):,}", flush=True)

# ── 그룹 ──
if os.path.exists(P("k_groups.json")) and os.path.getsize(P("k_groups.json")) > 100:
    G = json.load(open(P("k_groups.json"), encoding="utf-8"))
else:
    G = {}
    LK = threading.Lock()

    def gwork(c):
        gs = raw(f"/ncc/adgroups?nccCampaignId={c['nccCampaignId']}") or []
        out = {}
        for g in gs:
            if g.get("delFlag"):
                continue
            out[g["nccAdgroupId"]] = {
                "gname": g.get("name"), "gbid": g.get("bidAmt") or 0,
                "gstatus": g.get("status"), "guserLock": 1 if g.get("userLock") else 0,
                "cid": c["nccCampaignId"], "cname": c.get("name"),
                "campTp": c.get("campaignTp"), "cstatus": c.get("status"),
                "cuserLock": 1 if c.get("userLock") else 0,
                "cbudget": (c.get("dailyBudget") or 0) if c.get("useDailyBudget") else 0,
            }
        with LK:
            G.update(out)

    with ThreadPoolExecutor(max_workers=4) as ex:
        list(ex.map(gwork, C))
    json.dump(G, open(P("k_groups.json"), "w", encoding="utf-8"), ensure_ascii=False)
print(f"광고그룹 {len(G):,}", flush=True)

# ── 키워드 ──
out = json.load(open(P("k_kws.json"), encoding="utf-8")) if os.path.exists(P("k_kws.json")) and os.path.getsize(P("k_kws.json")) > 10 else {}
todo = [g for g in G if g not in out]
print(f"남은 그룹 {len(todo):,}", flush=True)
LOCK = threading.Lock()
n = [0]
fail = []


def work(gid):
    kws = raw(f"/ncc/keywords?nccAdgroupId={gid}")
    if kws is None:
        with LOCK:
            fail.append(gid)
        return
    rows = [[(k.get("keyword") or "").strip(), k.get("nccKeywordId"), k.get("bidAmt") or 0,
             1 if k.get("useGroupBidAmt") else 0, 1 if k.get("userLock") else 0,
             k.get("status"), (k.get("regTm") or "")[:10]] for k in kws]
    with LOCK:
        out[gid] = rows
        n[0] += 1
        if n[0] % 200 == 0:
            print(f"  ... {n[0]}/{len(todo)}", flush=True)
            json.dump(dict(out), open(P("k_kws.json"), "w", encoding="utf-8"), ensure_ascii=False)


with ThreadPoolExecutor(max_workers=5) as ex:
    list(ex.map(work, todo))

json.dump(out, open(P("k_kws.json"), "w", encoding="utf-8"), ensure_ascii=False)
inst = sum(len(v) for v in out.values())
uniq = len({r[0] for v in out.values() for r in v})
print(f"완료 — 인스턴스 {inst:,} / 고유 {uniq:,} / 실패그룹 {len(fail)}")
json.dump(fail, open(P("k_fail.json"), "w", encoding="utf-8"))
