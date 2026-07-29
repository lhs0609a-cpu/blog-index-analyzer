# -*- coding: utf-8 -*-
"""10만 시드 뱅크 전수 볼륨검증 (2026-07-29).

`_haeul_100k_seedbank.json` 10만 조합 중 **실제 네이버 검색량이 있는 것**만 골라낸다.
서버 explode(시드당 10~30초, 워커 단일슬롯)로 10만을 태우면 수십 일이 걸리지만,
로컬 keywordstool 직결이면 5힌트/콜로 전수를 몇 십 분에 끝낸다.

산출:
  · `_haeul_100k_live.json`  — 실검색량 ≥10 인 조합 (그대로 등록 시드로 투입 가능)
  · `_haeul_100k_dead.json`  — 무볼륨 (explode 힌트로만 가치, 등록은 어차피 min_volume 컷)
이 숫자가 곧 "두통 도메인에서 10만이 가능한가"의 최종 답이다.
"""
import io
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

BASE = "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend/"
WORK = ("C:/Users/lhs06/AppData/Local/Temp/claude/"
        "G---------developer-blog-index-analyzer/"
        "01e22490-ab40-48a4-a8b5-1eea4fbbbe03/scratchpad/")
RAW = WORK + "_haeul_mega_raw.json"
STATE = WORK + "_haeul_100k_verify_state.json"
WORKERS = int(os.environ.get("WORKERS", "4"))   # 서버 explode 와 같은 API 계정 — 과하게 안 땡긴다

_src = open(BASE + "_haeul_disease_bfs2.py", encoding="utf-8").read()
_src = _src.split("# ============================================================\n# 코퍼스")[0]
_src = "\n".join(l for l in _src.splitlines() if not l.startswith("sys.stdout"))
_ns = {}
exec(compile(_src, "bfs2_defs", "exec"), _ns)
keywordstool, _vol, tier = _ns["keywordstool"], _ns["_vol"], _ns["tier"]

# ⚠️ keywordstool 쿼터는 **서버 explode 와 공유**한다(같은 NAVER_AD 계정).
#    기본 0.34s 간격 × 4워커로 돌렸더니 즉시 429 가 떨어졌고, 등록 마라톤까지 굶는다.
#    등록이 우선이므로 로컬 검증은 콜 간격을 크게 벌린다.
GAP = float(os.environ.get("GAP", "1.5"))
_lastcall = [0.0]


def _slow_throttle():
    d = GAP - (time.time() - _lastcall[0])
    if d > 0:
        time.sleep(d)
    _lastcall[0] = time.time()


_ns["_throttle"] = _slow_throttle      # keywordstool 이 호출 시점에 전역에서 찾는다


def _jload(p, d):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return d


raw = _jload(RAW, {})
bank = _jload(BASE + "_haeul_100k_seedbank.json", [])
state = _jload(STATE, {"cursor": 0})
todo = [k for k in bank if k not in raw]
print(f"뱅크 {len(bank):,} / 캐시 {len(raw):,} / 미검증 {len(todo):,} "
      f"(재개 {state['cursor']:,})", flush=True)

chunks = [todo[i:i + 5] for i in range(0, len(todo), 5)]
start = state["cursor"]
print(f"콜 {len(chunks):,} (남은 {len(chunks)-start:,})", flush=True)


def one(chunk):
    """⚠️ 실패(429/타임아웃)와 '무볼륨'을 절대 섞지 말 것.

    keywordstool 은 3회 백오프 후 실패해도 `[]` 를 돌려준다. 이걸 무볼륨으로 간주해
    캐시에 굳히면 **멀쩡한 키워드가 영구히 죽은 것으로 기록**된다. 힌트 자신이 응답에
    없더라도 다른 행이 하나라도 왔을 때만(=콜 성공) 무볼륨으로 확정한다.
    """
    out = {}
    try:
        rows = keywordstool(chunk)
    except Exception:
        rows = []
    if not rows:
        return out          # 콜 실패 — 아무것도 기록하지 않고 다음 라운드에 재시도
    for row in rows:
        k = (row.get("relKeyword") or "").replace(" ", "")
        if not k:
            continue
        pc, rp = _vol(row.get("monthlyPcQcCnt"))
        mo, rm = _vol(row.get("monthlyMobileQcCnt"))
        out[k] = {"pc": pc, "mo": mo, "total": pc + mo, "real": (rp or rm)}
    for h in chunk:
        out.setdefault(h, {"pc": 0, "mo": 0, "total": 0, "real": False})
    return out


t0 = time.time()
done = start
with ThreadPoolExecutor(WORKERS) as ex:
    for out in ex.map(one, chunks[start:]):
        for k, v in out.items():
            if k not in raw or (v["real"] and not raw[k]["real"]):
                raw[k] = v
        done += 1
        if done % 500 == 0:
            live = sum(1 for k in bank if raw.get(k, {}).get("real")
                       and raw[k]["total"] >= 10)
            el = time.time() - t0
            state["cursor"] = done
            print(f"  {done:,}/{len(chunks):,}콜  캐시 {len(raw):,}  뱅크실볼륨 {live:,}  "
                  f"({el/60:.1f}분, ETA {(len(chunks)-done)*el/max(done-start,1)/60:.0f}분)",
                  flush=True)
            json.dump(raw, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
            json.dump(state, open(STATE, "w", encoding="utf-8"), ensure_ascii=False)

state["cursor"] = len(chunks)
json.dump(raw, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
json.dump(state, open(STATE, "w", encoding="utf-8"), ensure_ascii=False)

live = [(k, raw[k]["total"]) for k in bank
        if raw.get(k, {}).get("real") and raw[k]["total"] >= 10 and tier(k)]
live.sort(key=lambda x: -x[1])
dead = [k for k in bank if not (raw.get(k, {}).get("real") and raw[k]["total"] >= 10)]
json.dump([k for k, v in live], open(BASE + "_haeul_100k_live.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=0)
json.dump(dead, open(BASE + "_haeul_100k_dead.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=0)
print(f"\n### 뱅크 {len(bank):,} 중 실검색량≥10 = **{len(live):,}** / 무볼륨 {len(dead):,} "
      f"({(time.time()-t0)/60:.1f}분)", flush=True)
print(f"검색량합 {sum(v for _, v in live):,}", flush=True)
for k, v in live[:30]:
    print(f"   {v:>8,}  {k}", flush=True)
