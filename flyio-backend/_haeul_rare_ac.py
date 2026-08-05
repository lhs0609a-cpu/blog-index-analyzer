# -*- coding: utf-8 -*-
"""신규 공식 어휘 루트 × 자동완성 다채널 열거 (2026-07-30).

keywordstool 이웃은 루트를 신규 어휘로 갈아도 사망(195콜 → 게이트통과 18)임을 먼저
실측했다. 남은 유효 채널은 자동완성뿐이고, 그 중 **네이버 PC ac + 자모 접두사**가
볼륨보유율 85% 로 최상(2026-07-28 실측).

루트 = ICHD-3 공식역어 + 희귀질환 실볼륨명 + 딥리서치 어휘 (지금까지 한 번도 이 채널에
투입된 적 없는 문자열들). 접두사 72종(초성19+음절52)으로 각 루트의 제안 트리를 배수한다.

채널: 네이버 PC ac(st=100) · 네이버 모바일 ac(st=111) · Bing osjson
산출: `_haeul_rare_cand.json` 후보(볼륨 미검증) / 이후 `_haeul_rare_final.py` 가 검증·납품
"""
import io
import json
import os
import random
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
        "937e50ce-e620-44d2-8ad2-78c11c394bc3/scratchpad/")
VOLC = WORK + "_haeul_rare_volcache.json"
CAND = WORK + "_haeul_rare_cand.json"
STATE = WORK + "_haeul_rare_ac_state.json"

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    " (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}
UA_MO = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                       "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148"}

CHOSEONG = list("ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㄲㄸㅃㅆㅉ")
SYLLABLE = ["가", "고", "그", "나", "내", "너", "다", "더", "도", "때", "마", "머", "무",
            "바", "병", "부", "빨", "사", "생", "소", "심", "아", "안", "어", "언", "얼",
            "오", "왜", "왼", "원", "위", "이", "임", "자", "잘", "제", "조", "좋", "주",
            "증", "지", "차", "채", "초", "치", "코", "타", "턱", "통", "하", "한", "혈"]
PREFIX = [""] + CHOSEONG + SYLLABLE
PREFIX_D2 = [""] + CHOSEONG        # ⚠️ 2자모 접두(`편두통ㅇㅅ`)는 네이버 ac 가 응답 0


def jload(p, d):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return d


def jdump(o, p):
    """⚠️ 원자적 저장 필수 — 26만행 캐시를 직접 write 하면 동시 읽기가 반쪽 파일을 보고,
    쓰는 중 프로세스가 죽으면 수 시간치 검증 결과가 통째로 날아간다(2026-07-31 실측)."""
    import os as _oz
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(o, f, ensure_ascii=False)
    _oz.replace(tmp, p)


# 게이트 재사용 (_haeul_rare_bfs.py 의 2단 게이트)
_g = open(BASE + "_haeul_rare_bfs.py", encoding="utf-8").read()
_g = _g.split("# ==================================================================\n"
              "# 채널 1")[0]
_g = _g.replace('vol = jload(VOLC, None)', 'vol = jload(VOLC, {}) or {}')
_g = "\n".join(l for l in _g.splitlines() if not l.startswith("sys.stdout"))
_gn = {}
exec(compile(_g, "gate_defs", "exec"), _gn)
gate, vol = _gn["gate"], _gn["vol"]
CORPUS = set(vol)
print(f"코퍼스 {len(CORPUS):,} · 실볼륨 "
      f"{sum(1 for v in vol.values() if v[2] and v[0]+v[1] >= 10):,}", flush=True)

_stat = {"q": 0, "sug": 0, "err": 0}
_lk = threading.Lock()


def naver_ac(q, mobile=False):
    if mobile:
        url = "https://mac.search.naver.com/mobile/ac?" + urllib.parse.urlencode(
            {"q": q, "con": 0, "frm": "mobile_nv", "ans": 2, "r_format": "json",
             "r_enc": "UTF-8", "r_unicode": 0, "st": 111, "r_lt": 111, "q_enc": "UTF-8"})
        hd = UA_MO
    else:
        url = "https://ac.search.naver.com/nx/ac?" + urllib.parse.urlencode(
            {"q": q, "con": 1, "frm": "nv", "ans": 2, "r_format": "json", "r_enc": "UTF-8",
             "r_unicode": 0, "t_koreng": 1, "run": 2, "rev": 4, "q_enc": "UTF-8", "st": 100})
        hd = UA
    for _ in range(2):
        try:
            d = json.load(urllib.request.urlopen(
                urllib.request.Request(url, headers=hd), timeout=8))
            break
        except Exception:
            time.sleep(0.3)
    else:
        with _lk:
            _stat["err"] += 1
        return []
    out = []
    for grp in d.get("items") or []:
        for it in grp or []:
            if isinstance(it, list) and it and isinstance(it[0], str):
                out.append(it[0].strip())
    with _lk:
        _stat["q"] += 1
        _stat["sug"] += len(out)
    return out


_bing_lk = threading.Lock()


def bing_ac(q):
    url = "https://api.bing.com/osjson.aspx?language=ko&query=" + urllib.parse.quote(q)
    for _ in range(2):
        try:
            d = json.load(urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=8))
            with _lk:
                _stat["q"] += 1
            return [s.strip() for s in (d[1] if len(d) > 1 else []) if isinstance(s, str)]
        except Exception:
            time.sleep(0.3)
    with _lk:
        _stat["err"] += 1
    return []


# ------------------------------------------------------------------
# 루트
# ------------------------------------------------------------------
# ROOTS 로 루트 파일을 갈아끼울 수 있다 — 라운드가 늘어날 때 이미 훑은 루트를 다시 안 돌게.
# 수율은 전적으로 '루트의 신선함'에 붙으므로 라운드별 루트 분리가 그대로 비용 절감이다.
_rf = os.environ.get("ROOTS", "")
if _rf:
    _r = jload(BASE + _rf, {})
    roots = sorted(_r if isinstance(_r, (list, set)) else _r.keys())
    print(f"루트파일 {_rf} → {len(roots):,}", flush=True)
else:
    vocab = jload(BASE + "_haeul_rare_vocab.json", {})
    rare_live = {r["kw"] for r in jload(BASE + "_haeul_rare_live.json", [])}
    roots = sorted(set(vocab) | rare_live)
    print(f"신규 어휘 루트 {len(roots):,} (ICHD3+희귀+딥리서치)", flush=True)

cand = jload(CAND, {})
state = jload(STATE, {"done": []})
done = set(state["done"])


def crawl(rts, prefixes, tag, chan="pc", workers=24):
    """루트×접두사 열거. 후보는 게이트 통과 + 코퍼스 밖만 적립."""
    jobs = [(r, p) for r in rts for p in prefixes]
    fn = (bing_ac if chan == "bing"
          else (lambda q: naver_ac(q, mobile=(chan == "mo"))))
    got = {}
    t0 = time.time()

    def one(job):
        r, p = job
        for s in fn(r + p):
            k = s.replace(" ", "")
            if k in CORPUS or k in cand or k in got:
                continue
            if gate(k):
                got[k] = tag
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for i in range(0, len(jobs), 4000):
            list(ex.map(one, jobs[i:i + 4000]))
            el = time.time() - t0
            print(f"  [{tag}/{chan}] {min(i+4000,len(jobs)):,}/{len(jobs):,}q "
                  f"· 신규후보 {len(got):,} · {_stat['q']/max(el,1):.0f}q/s "
                  f"· err {_stat['err']:,} · {el/60:.1f}분", flush=True)
    cand.update(got)
    jdump(cand, CAND)
    print(f"  → [{tag}/{chan}] 신규후보 {len(got):,} "
          f"({len(got)/max(1,len(jobs)):.4f}/q)", flush=True)
    return got


PHASE = os.environ.get("PHASE", "d1")

if PHASE == "d1":
    # 네이버 PC ac — 최상 채널. 전 루트 × 72접두.
    d1 = crawl(roots, PREFIX, "D1", "pc")
    # 모바일 ac — 제안 트리가 PC 와 다르다. 초성만(질의절약).
    d1m = crawl(roots, [""] + CHOSEONG, "D1", "mo", workers=30)
    # Bing — 머리어에서 최고수율. 접두 없이 루트만(롱테일에선 붕괴하므로).
    d1b = crawl(roots, [""], "D1", "bing", workers=12)
    state["done"] = list(done | {"d1"})
    jdump(state, STATE)

elif PHASE == "d2":
    # depth-2: D1 후보 중 게이트통과분을 루트로 재투입 (초성만)
    front = sorted(k for k, v in cand.items() if v == "D1")
    print(f"D2 frontier {len(front):,}", flush=True)
    crawl(front, PREFIX_D2, "D2", "pc", workers=28)
    state["done"] = list(done | {"d2"})
    jdump(state, STATE)

elif PHASE == "bare":
    # 루트가 **10만 단위 조합**일 때 쓴다. 접두사까지 붙이면 질의가 수백만이 되는데,
    # 조합 루트는 대부분 자동완성이 아무것도 안 준다(수율 1/13) — 먼저 bare 로 훑어
    # '살아있는 루트'가 어디인지부터 알아낸다. 살아있는 것만 나중에 접두사로 판다.
    crawl(roots, [""], "BARE", "pc", workers=30)
    crawl(roots, [""], "BARE", "bing", workers=12)
    state["done"] = list(done | {"bare"})
    jdump(state, STATE)

elif PHASE == "gb":
    # ★ 지난 세션 실측 최고수율 채널: Bing 머리어 0.230/q · Google 0.144/q.
    #   단 롱테일 루트로 내려가면 전 채널이 0.006/q 로 붕괴하므로 **볼륨 상위 루트만**
    #   접두사까지 파고, 하위 루트는 루트 단독으로 훑는다.
    top = sorted(roots, key=lambda r: -(vol.get(r, [0, 0, 0])[0]
                                       + vol.get(r, [0, 0, 0])[1]))[:250]
    crawl(top, [""] + CHOSEONG, "GB", "bing", workers=12)
    # Google — ⚠️ 동시 30워커에서 즉시 403. 12워커 + 쿨다운 브레이커 필수.
    _g_block = [0.0]

    def google_ac(q):
        if time.time() < _g_block[0]:
            return []
        url = ("https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&q="
               + urllib.parse.quote(q))
        try:
            d = json.loads(urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=8).read().decode("utf-8"))
            with _lk:
                _stat["q"] += 1
            return [s.strip() for s in (d[1] if len(d) > 1 else []) if isinstance(s, str)]
        except urllib.error.HTTPError as e:
            if e.code == 403:
                _g_block[0] = time.time() + 300      # 5분 쿨다운
            with _lk:
                _stat["err"] += 1
            return []
        except Exception:
            with _lk:
                _stat["err"] += 1
            return []

    got = {}
    jobs = [r + p for r in top for p in ([""] + CHOSEONG)]
    t0 = time.time()

    def one_g(q):
        for s in google_ac(q):
            k = s.replace(" ", "")
            if k not in CORPUS and k not in cand and k not in got and gate(k):
                got[k] = "GB"
    with ThreadPoolExecutor(max_workers=12) as ex:
        for i in range(0, len(jobs), 2000):
            list(ex.map(one_g, jobs[i:i + 2000]))
            print(f"  [GB/google] {min(i+2000,len(jobs)):,}/{len(jobs):,}q · "
                  f"신규후보 {len(got):,} · err {_stat['err']:,} · "
                  f"{(time.time()-t0)/60:.1f}분", flush=True)
    cand.update(got)
    jdump(cand, CAND)
    print(f"  → [GB/google] 신규후보 {len(got):,} ({len(got)/max(1,len(jobs)):.4f}/q)",
          flush=True)
    state["done"] = list(done | {"gb"})
    jdump(state, STATE)

elif PHASE == "bd":
    # ★ 실측 최고 채널 = Bing. 신규 희귀질환/ICHD 루트에서 루트단독 **0.4473/q**,
    #   접두사 포함 0.1454/q — 네이버 PC ac(0.0202/q)의 7~22배.
    #   지난 세션 Bing 기록(머리어 0.230/q)도 넘는다. 어휘가 새로우면 Bing 이 가장 먼저 반응한다.
    #   → 전 루트 × 초성 + 발굴된 후보를 루트로 재투입까지 깊게 파낸다.
    crawl(roots, [""] + CHOSEONG, "BD1", "bing", workers=12)
    front = sorted(k for k, v in cand.items() if v in ("D1", "D2", "GB", "BD1"))
    print(f"BD2 frontier {len(front):,}", flush=True)
    crawl(front, [""], "BD2", "bing", workers=12)
    state["done"] = list(done | {"bd"})
    jdump(state, STATE)

elif PHASE == "d3":
    front = sorted(k for k, v in cand.items() if v == "D2")
    print(f"D3 frontier {len(front):,}", flush=True)
    crawl(front, PREFIX_D2, "D3", "pc", workers=28)
    state["done"] = list(done | {"d3"})
    jdump(state, STATE)

print(f"\n총 후보 {len(cand):,} · 질의 {_stat['q']:,} · 제안 {_stat['sug']:,} "
      f"· 오류 {_stat['err']:,}", flush=True)
