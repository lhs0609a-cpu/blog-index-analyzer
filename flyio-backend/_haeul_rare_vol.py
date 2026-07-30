# -*- coding: utf-8 -*-
"""희귀질환 공식명 1,386 전수 실검색량 검증 + 이웃 대량 흡수 (2026-07-30).

두 가지를 동시에 한다:
  1. **질병관리청 희귀질환 공식명이 실제로 검색되는지** 판정 → 검색되는 것만 머리어 승격.
     (공식 학술명은 대부분 무볼륨이라, 이걸 안 걸르고 조합하면 10만 뱅크가 통째로 죽는다.)
  2. keywordstool 은 힌트 5개에 **행 1,200개**를 돌려준다 → 희귀질환 이웃 어휘를
     덤으로 대량 흡수한다. 이게 실제 신규 광맥이다(공식명 자체보다 이웃이 검색된다).

변형 생성: 공백/하이픈/괄호 제거 + 별칭(형/증후군 앞 고유명) — 사람들은 학술 전체명을
치지 않는다(`길랑-바레 증후군`→`길랑바레증후군`).

산출: `_haeul_rare_vol.json` {kw: [pc, mo, ok]} / `_haeul_rare_live.json` 볼륨 보유 공식명
      `_haeul_rare_nb.json` 이웃 어휘 전량(다음 단계 머리어 후보)
"""
import io
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

BASE = "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend/"
WORK = ("C:/Users/lhs06/AppData/Local/Temp/claude/"
        "G---------developer-blog-index-analyzer/"
        "937e50ce-e620-44d2-8ad2-78c11c394bc3/scratchpad/")
NB = WORK + "_haeul_rare_nb.json"          # ⚠️ 작업캐시는 C: (G: 는 덤프가 크롤보다 느리다)
STATE = WORK + "_haeul_rare_vol_state.json"

# keywordstool 클라이언트 재사용 (서명·스로틀)
_src = open(BASE + "_haeul_disease_bfs2.py", encoding="utf-8").read()
_src = _src.split("# ============================================================\n# 질환 루트")[0]
_src = "\n".join(l for l in _src.splitlines() if not l.startswith("sys.stdout"))
_ns = {}
exec(compile(_src, "bfs2_defs", "exec"), _ns)
keywordstool, _vol = _ns["keywordstool"], _ns["_vol"]

GAP = float(os.environ.get("GAP", "0.7"))   # 서버 explode 와 쿼터 공유 — 마라톤 없을 때만 이 값
WORKERS = int(os.environ.get("WORKERS", "2"))
_last = [0.0]


def _throttle():
    d = GAP - (time.time() - _last[0])
    if d > 0:
        time.sleep(d)
    _last[0] = time.time()


_ns["_throttle"] = _throttle


def jload(p, d):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return d


# ------------------------------------------------------------------
# 공식명 → 검색 가능 변형
# ------------------------------------------------------------------
_PAREN = re.compile(r"\([^)]*\)")
_JUNK = re.compile(r"[^0-9가-힣A-Za-z]")


def variants(ko):
    """공식 학술명에서 사람들이 실제로 칠 형태를 뽑는다."""
    out = []
    base = _PAREN.sub("", ko)
    flat = _JUNK.sub("", base)
    if 2 <= len(flat) <= 25:
        out.append(flat)
    # `X-Y 증후군` / `A형 B병` → 접미 유형어 + 그 앞 고유명 결합의 짧은 별칭
    m = re.search(r"(.+?)\s*(증후군|병|증|장애|기형|결핍증|이상증|경화증|위축증|근육병)$", base)
    if m:
        stem = _JUNK.sub("", m.group(1))
        alias = stem + m.group(2)
        if 3 <= len(alias) <= 14 and alias != flat:
            out.append(alias)
        # 고유명(에포님)이 여러 낱말이면 마지막 낱말 + 유형어도 시도
        words = [w for w in m.group(1).split() if w]
        if len(words) > 1:
            tail = _JUNK.sub("", words[-1]) + m.group(2)
            if 3 <= len(tail) <= 14 and tail not in out:
                out.append(tail)
    return out


rare = jload(BASE + "_haeul_rare_list.json", [])
cand, owner = [], {}
for r in rare:
    for v in variants(r["ko"]):
        if v not in owner:
            owner[v] = r["ko"]
            cand.append(v)

nb = jload(NB, {})
state = jload(STATE, {"cursor": 0})
todo = [c for c in cand if c not in nb]
chunks = [todo[i:i + 5] for i in range(0, len(todo), 5)]
print(f"희귀질환 {len(rare):,} → 변형 {len(cand):,} / 캐시 {len(nb):,} / "
      f"미검증 {len(todo):,} → 콜 {len(chunks):,} (재개 {state['cursor']:,})", flush=True)


def one(chunk):
    """⚠️ 콜 실패([])와 '무볼륨'을 절대 섞지 말 것 — 멀쩡한 KW 가 영구 사망 기록된다."""
    rows = keywordstool(chunk)
    if not rows:
        return None                      # 실패 → 캐시에 굳히지 않고 재시도 대상으로 남긴다
    got = {}
    for row in rows:
        kw = (row.get("relKeyword") or "").replace(" ", "")
        if not kw:
            continue
        pc, ok1 = _vol(row.get("monthlyPcQcCnt"))
        mo, ok2 = _vol(row.get("monthlyMobileQcCnt"))
        got[kw] = [pc, mo, bool(ok1 or ok2)]
    for h in chunk:                      # 응답에 자기 자신이 없으면 = 광고 불가/무볼륨
        got.setdefault(h, [0, 0, False])
    return got


done = 0
t0 = time.time()
with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    for i in range(state["cursor"], len(chunks), 40):
        batch = chunks[i:i + 40]
        for got in ex.map(one, batch):
            if got:
                nb.update(got)
        done += len(batch)
        state["cursor"] = i + len(batch)
        json.dump(nb, open(NB, "w", encoding="utf-8"), ensure_ascii=False)
        json.dump(state, open(STATE, "w", encoding="utf-8"))
        el = time.time() - t0
        print(f"  {state['cursor']:,}/{len(chunks):,} 콜 · 코퍼스 {len(nb):,} "
              f"· {el/60:.1f}분", flush=True)

# ------------------------------------------------------------------
# 판정
# ------------------------------------------------------------------
live = []
for v in cand:
    e = nb.get(v)
    if e and e[2] and (e[0] + e[1]) >= 10:
        live.append({"kw": v, "official": owner[v], "pc": e[0], "mo": e[1],
                     "mt": e[0] + e[1]})
live.sort(key=lambda x: -x["mt"])
print(f"\n★ 희귀질환 공식명 {len(cand):,} 중 실검색량≥10 = **{len(live):,}** "
      f"({len(live)/max(1,len(cand))*100:.1f}%)", flush=True)
print(f"   이웃 흡수 코퍼스 총 {len(nb):,} "
      f"(실볼륨 {sum(1 for e in nb.values() if e[2] and e[0]+e[1] >= 10):,})", flush=True)
for x in live[:30]:
    print(f"   {x['mt']:>7,}  {x['kw']}", flush=True)

json.dump(nb, open(NB, "w", encoding="utf-8"), ensure_ascii=False)
json.dump(live, open(BASE + "_haeul_rare_live.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
