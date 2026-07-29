# -*- coding: utf-8 -*-
"""두통 시드 1만 확장 — 타엔진 서제스트 채널 (2026-07-29).

배경: 네이버 자동완성은 2026-07-28 자모 접두사 드레인(41.4만 질의, D4 고갈)으로
사실상 소진됐다. 이번 세션 음절 접두사 확장(1.57M 질의)은 **0.003 신규/질의** —
채널이 정말 말랐다는 뜻이다.

★ 새 채널 = **구글·빙 서제스트**. 같은 두통 루트 800질의 실측:
    구글 0.144 신규/질의 · 빙 0.230 신규/질의  (네이버 음절드레인의 50~75배)
같은 언어권이라도 엔진마다 질의 로그가 다르므로 롱테일 분포가 겹치지 않는다.
네이버 자동완성이 못 준 `긴장성두통편두통차이`·`두통후구토`·`부위별두통원인`
`편두통수지침`·`어지럼증의원인과관련질환` 이 여기서 나온다.

⚠️ 다만 이 제안들은 '네이버 검색량'을 보장하지 않는다(네이버 ac 는 85% 보유).
   → 반드시 keywordstool 로 볼륨검증하고, 실검색량 ≥10 만 납품한다.

작업캐시 C: 스크래치패드, 납품물만 G:.
"""
import io
import json
import os
import sys
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

BASE = "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend/"
WORK = ("C:/Users/lhs06/AppData/Local/Temp/claude/"
        "G---------developer-blog-index-analyzer/"
        "01e22490-ab40-48a4-a8b5-1eea4fbbbe03/scratchpad/")
RAW = WORK + "_haeul_mega_raw.json"
CAND = WORK + "_haeul_gb_cand.json"
STATE = WORK + "_haeul_gb_state.json"

MINVOL = 10
WORKERS = int(os.environ.get("WORKERS", "14"))
ROOT_CAP = int(os.environ.get("ROOT_CAP", "4000"))
DEPTH = int(os.environ.get("DEPTH", "2"))
MAX_VERIFY_CALLS = int(os.environ.get("MAX_VERIFY_CALLS", "30000"))

_src = open(BASE + "_haeul_disease_bfs2.py", encoding="utf-8").read()
_src = _src.split("# ============================================================\n# 코퍼스")[0]
_src = "\n".join(l for l in _src.splitlines() if not l.startswith("sys.stdout"))
_ns = {}
exec(compile(_src, "bfs2_defs", "exec"), _ns)
tier, keywordstool, _vol = _ns["tier"], _ns["keywordstool"], _ns["_vol"]


def _jload(p, d):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return d


# ============================================================
# 접두사 — 구글/빙은 자모를 못 받는다. 띄어쓰기+음절이 자연 질의형.
# ============================================================
PREFIX = [""] + [" " + s for s in [
    "원", "증", "치", "약", "병", "한", "효", "부", "비", "자", "기", "오", "왜", "어",
    "수", "머", "아", "후", "전", "예", "검", "침", "주", "만", "심", "재", "급", "완",
    "좋", "없", "계", "목", "눈", "귀", "턱", "속", "밤", "낮", "여", "남", "아이", "임신",
    "스트", "무슨", "어떻게", "언제", "얼마",
]]

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
_stat = {"q": 0, "hit": 0, "err": 0}
_lock = threading.Lock()


def _get(url):
    for _ in range(2):
        try:
            return json.loads(urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=8).read().decode("utf-8", "ignore"))
        except Exception:
            time.sleep(0.3)
    with _lock:
        _stat["err"] += 1
    return None


# 구글은 동시 30 워커에서 403(레이트리밋) 났다. 쿨다운 서킷브레이커를 달고
# 막히면 빙 단독으로 계속 간다 — 빙이 원래 더 고수율이다(0.230 vs 0.144/q).
_goog_block_until = [0.0]


def suggest(q):
    """구글·빙 동시 질의 → 제안 합집합. 구글 403 시 5분 쿨다운."""
    out = []
    if time.time() >= _goog_block_until[0]:
        d = _get("https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&q="
                 + urllib.parse.quote(q))
        if d and len(d) > 1:
            out += d[1]
        elif d is None:
            _goog_block_until[0] = time.time() + 300
    d = _get("https://api.bing.com/osjson.aspx?language=ko&query=" + urllib.parse.quote(q))
    if d and len(d) > 1:
        out += d[1]
    with _lock:
        _stat["q"] += 1
        _stat["hit"] += len(out)
    return out


# ============================================================
# 상태
# ============================================================
raw = _jload(RAW, {})
corpus = set(raw) | set(_jload(WORK + "_haeul_mega_cand.json", []))
cand = set(_jload(CAND, []))
state = _jload(STATE, {"depth": 1, "cursor": 0, "done_roots": []})
print(f"코퍼스 {len(corpus):,} / 볼륨캐시 {len(raw):,} / 기존 gb후보 {len(cand):,}", flush=True)


def save_light():
    json.dump(sorted(cand), open(CAND, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(state, open(STATE, "w", encoding="utf-8"), ensure_ascii=False)


def save_all():
    json.dump(raw, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
    save_light()


def crawl(roots, tag):
    jobs = [r + p for r in roots for p in PREFIX]
    print(f"[{tag}] 루트 {len(roots):,} × 접두 {len(PREFIX)} = {len(jobs):,} 질의", flush=True)
    new = set()
    t0 = time.time()
    start = state.get("cursor", 0) if tag == f"D{state.get('depth')}" else 0
    todo = jobs[start:]

    def one(q):
        return [k for k in (s.replace(" ", "") for s in suggest(q)) if k and tier(k)]

    with ThreadPoolExecutor(WORKERS) as ex:
        for i, res in enumerate(ex.map(one, todo)):
            for k in res:
                if k not in cand:
                    cand.add(k)
                    if k not in corpus:
                        new.add(k)
            if (i + 1) % 2000 == 0:
                el = time.time() - t0
                state["cursor"] = start + i + 1
                print(f"  [{tag}] {start+i+1:,}/{len(jobs):,}q  후보 {len(cand):,} "
                      f"코퍼스밖신규 {len(new):,}  ({el/60:.1f}분, {(i+1)/max(el,1):.0f}q/s)",
                      flush=True)
                save_light()
    state["cursor"] = 0
    save_light()
    print(f"[{tag}] 완료 — 후보 {len(cand):,} 신규 {len(new):,} "
          f"(질의 {_stat['q']:,} 제안 {_stat['hit']:,} 오류 {_stat['err']:,})", flush=True)
    return new


def verify(keys, tag):
    todo = [k for k in keys if k not in raw]
    if not todo:
        print(f"[{tag}] 검증대상 없음", flush=True)
        return
    calls = min((len(todo) + 4) // 5, MAX_VERIFY_CALLS)
    print(f"[{tag}] 볼륨검증 {len(todo):,}개 / {calls:,}콜", flush=True)
    t0 = time.time()

    def one(chunk):
        out = {}
        for row in keywordstool(chunk):
            k = (row.get("relKeyword") or "").replace(" ", "")
            if not k:
                continue
            pc, rp = _vol(row.get("monthlyPcQcCnt"))
            mo, rm = _vol(row.get("monthlyMobileQcCnt"))
            out[k] = {"pc": pc, "mo": mo, "total": pc + mo, "real": (rp or rm)}
        for h in chunk:
            out.setdefault(h, {"pc": 0, "mo": 0, "total": 0, "real": False})
        return out

    chunks = [todo[i:i + 5] for i in range(0, min(len(todo), calls * 5), 5)]
    done = 0
    with ThreadPoolExecutor(3) as ex:
        for out in ex.map(one, chunks):
            for k, v in out.items():
                if k not in raw or (v["real"] and not raw[k]["real"]):
                    raw[k] = v
            done += 1
            if done % 500 == 0:
                print(f"  [{tag}] {done:,}/{len(chunks):,}콜  캐시 {len(raw):,} "
                      f"({(time.time()-t0)/60:.1f}분)", flush=True)
                save_all()
    save_all()
    print(f"[{tag}] 검증완료 — 캐시 {len(raw):,}", flush=True)


def eligible(pool):
    out = [(k, raw[k]["total"]) for k in pool
           if raw.get(k, {}).get("real") and raw[k]["total"] >= MINVOL and tier(k)]
    out.sort(key=lambda x: -x[1])
    return out


def main():
    t0 = time.time()
    roots = [r for r in _jload(BASE + "_haeul_mega_seeds_core.json", []) if len(r) <= 12][:ROOT_CAP]
    seen = set(state.get("done_roots", []))
    d = state.get("depth", 1)
    while d <= DEPTH:
        front = roots if d == 1 else None
        if front is None:
            el = eligible(cand)
            front = [k for k, v in el if k not in seen and len(k) <= 12][:4000]
            if not front:
                print(f"### D{d} frontier 고갈", flush=True)
                break
        new = crawl(front, f"D{d}")
        seen |= set(front)
        state["done_roots"] = sorted(seen)
        verify(sorted(new), f"D{d}")
        el = eligible(new)
        print(f"### D{d} 신규 적격 {len(el):,} / 신규후보 {len(new):,} "
              f"({(time.time()-t0)/60:.1f}분)", flush=True)
        for k, v in el[:25]:
            print(f"   {v:>8,}  {k}", flush=True)
        d += 1
        state["depth"] = d
        save_all()

    el = eligible(cand)
    fresh = [(k, v) for k, v in el if k not in corpus]
    json.dump([k for k, v in fresh], open(WORK + "_haeul_gb_eligible.json", "w",
                                          encoding="utf-8"), ensure_ascii=False)
    print(f"### 총 적격 {len(el):,} / 코퍼스밖 완전신규 {len(fresh):,} "
          f"/ {(time.time()-t0)/60:.1f}분", flush=True)


main()
