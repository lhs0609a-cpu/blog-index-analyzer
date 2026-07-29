# -*- coding: utf-8 -*-
"""두통 시드 1만 확장 — 음절 접두사 드레인 (2026-07-29).

지난 세션(_haeul_mega_ac.py)은 자모 접두사 채널을 열었지만 **끝까지 안 짰다**:
  · D1 루트 750개  → 초성19 + 음절52 = 72 접두사 (풀 드레인)
  · D2~D4 루트 17,250개 → **초성 20개만** (질의수 절약)
즉 지금 done_roots 18,000 중 17,250 은 음절 접두사를 한 번도 안 받았다.

자동완성은 질의당 상위 10개만 준다. `편두통ㅇ` 은 원인/약/영어로/위치… 로 잘리고
`편두통예` 를 쳐야 예방약/예후/예방주사/예방약이름/예방약부작용 이 나온다(실측).
→ 음절 접두사는 초성의 부분집합이 아니라 **10개 컷 아래를 파는 도구**다.

이번 런: 사용자 요청대로 **두통 연관 코어 시드 10,069(_haeul_mega_seeds_core.json)를
루트**로 음절 접두사 전량을 투입한다. 2자모 접두(`편두통ㅇㅅ`)는 응답 0 확인 → 미사용.

작업캐시는 C: 스크래치패드(구글드라이브에 두면 저장이 크롤보다 느리다), 납품물만 G:.
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
RAW = WORK + "_haeul_mega_raw.json"        # 이전 세션 볼륨캐시 162,304 승계
CAND = WORK + "_haeul_x10k_cand.json"
STATE = WORK + "_haeul_x10k_state.json"

MINVOL = 10
AC_WORKERS = int(os.environ.get("AC_WORKERS", "12"))
MAX_AC = int(os.environ.get("MAX_AC", "1500000"))
MAX_VERIFY_CALLS = int(os.environ.get("MAX_VERIFY_CALLS", "30000"))
ROOT_CAP = int(os.environ.get("ROOT_CAP", "10069"))

# --- bfs2 정의부 재사용 (tier / keywordstool / _vol) ---
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
# 접두사
# ============================================================
CHOSEONG = list("ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㄲㄸㅃㅆㅉ")
# 지난 세션 D1 에 쓴 52 음절.
SYLL_OLD = ["가", "고", "그", "나", "내", "너", "다", "더", "도", "때", "마", "머", "무",
            "바", "병", "부", "빨", "사", "생", "소", "심", "아", "안", "어", "언", "얼",
            "오", "왜", "왼", "원", "위", "이", "임", "자", "잘", "제", "조", "좋", "주",
            "증", "지", "차", "채", "초", "치", "코", "타", "턱", "통", "하", "한", "혈"]
# 이번에 추가 — 의료질의 2번째 음절로 실제 자주 오는 것들.
SYLL_NEW = ["검", "결", "계", "관", "구", "귀", "근", "급", "기", "꼬", "낫", "냉", "눈",
            "느", "늘", "단", "당", "대", "덜", "동", "된", "두", "들", "땀", "떨", "뜨",
            "만", "맞", "멀", "목", "몸", "물", "밤", "방", "번", "별", "복", "비", "빈",
            "빠", "새", "서", "석", "속", "수", "스", "시", "식", "신", "실", "쓰", "약",
            "양", "없", "여", "연", "열", "예", "완", "요", "우", "울", "움", "응", "의",
            "인", "입", "잇", "재", "적", "전", "점", "정", "종", "중", "쥐", "찌", "참",
            "척", "천", "체", "축", "침", "케", "크", "탈", "파", "편", "폐", "표", "피",
            "핑", "허", "헛", "호", "화", "확", "회", "후", "흉", "힘"]
SYLL_ALL = SYLL_OLD + SYLL_NEW                 # 154
PREFIX_DONE = SYLL_ALL                          # done_roots 는 초성 이미 받음
PREFIX_FRESH = CHOSEONG + SYLL_ALL              # 미크롤 루트는 초성까지

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Referer": "https://search.naver.com/"}
_stat = {"ac": 0, "hit": 0, "err": 0}
_lock = threading.Lock()


def ac(q):
    url = "https://ac.search.naver.com/nx/ac?" + urllib.parse.urlencode(
        {"q": q, "con": 1, "frm": "nv", "ans": 2, "r_format": "json", "r_enc": "UTF-8",
         "r_unicode": 0, "t_koreng": 1, "run": 2, "rev": 4, "q_enc": "UTF-8", "st": 100})
    for _ in range(2):
        try:
            d = json.load(urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=8))
            break
        except Exception:
            time.sleep(0.4)
    else:
        with _lock:
            _stat["err"] += 1
        return []
    out = []
    for grp in d.get("items") or []:
        for it in grp or []:
            if isinstance(it, list) and it and isinstance(it[0], str):
                out.append(it[0].strip())
    with _lock:
        _stat["ac"] += 1
        _stat["hit"] += len(out)
    return out


# ============================================================
# 상태
# ============================================================
raw = _jload(RAW, {})
print(f"볼륨캐시 승계 {len(raw):,}", flush=True)
prev_cand = set(_jload(WORK + "_haeul_mega_cand.json", []))
cand = set(_jload(CAND, [])) | prev_cand
print(f"기존 후보 승계 {len(prev_cand):,}", flush=True)
done_roots = set((_jload(WORK + "_haeul_mega_state.json", {}) or {}).get("done_roots", []))
print(f"기크롤 루트 {len(done_roots):,}", flush=True)
state = _jload(STATE, {"phase": "crawl", "cursor": 0})


def save_light():
    json.dump(sorted(cand), open(CAND, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(state, open(STATE, "w", encoding="utf-8"), ensure_ascii=False)


def save_all():
    json.dump(raw, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
    save_light()


# ============================================================
# 1) 크롤
# ============================================================
def build_jobs():
    roots = _jload(BASE + "_haeul_mega_seeds_core.json", [])[:ROOT_CAP]
    jobs = []
    for r in roots:
        if len(r) > 14:          # 너무 긴 롱테일은 더 안 뻗는다(실측)
            continue
        for p in (PREFIX_DONE if r in done_roots else PREFIX_FRESH):
            jobs.append(r + p)
    return roots, jobs


def crawl(jobs, tag):
    print(f"[{tag}] 질의 {len(jobs):,}", flush=True)
    new = set()
    t0 = time.time()
    start = state.get("cursor", 0)
    todo = jobs[start:]

    def one(q):
        return [k for k in (s.replace(" ", "") for s in ac(q)) if k and tier(k)]

    with ThreadPoolExecutor(AC_WORKERS) as ex:
        for i, res in enumerate(ex.map(one, todo)):
            for k in res:
                if k not in cand:
                    new.add(k)
                cand.add(k)
            if (i + 1) % 10000 == 0:
                el = time.time() - t0
                state["cursor"] = start + i + 1
                print(f"  [{tag}] {start+i+1:,}/{len(jobs):,}q  후보 {len(cand):,} "
                      f"신규 {len(new):,}  ({el/60:.1f}분, {(i+1)/max(el,1):.0f}q/s)", flush=True)
                save_light()
            if _stat["ac"] >= MAX_AC:
                print(f"  [{tag}] MAX_AC 도달", flush=True)
                break
    state["cursor"] = len(jobs)
    save_light()
    print(f"[{tag}] 완료 — 후보 {len(cand):,} (신규 {len(new):,}), "
          f"질의 {_stat['ac']:,} 제안 {_stat['hit']:,} 오류 {_stat['err']:,}", flush=True)
    return new


# ============================================================
# 2) 볼륨 검증
# ============================================================
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
            if done % 1000 == 0:
                el = time.time() - t0
                print(f"  [{tag}] {done:,}/{len(chunks):,}콜  캐시 {len(raw):,} "
                      f"({el/60:.1f}분)", flush=True)
                save_all()
    save_all()
    print(f"[{tag}] 검증완료 — 캐시 {len(raw):,}", flush=True)


def main():
    t0 = time.time()
    roots, jobs = build_jobs()
    print(f"루트 {len(roots):,} → 질의 {len(jobs):,} "
          f"(기크롤 {sum(1 for r in roots if r in done_roots):,})", flush=True)
    if state.get("phase") == "crawl":
        new = crawl(jobs, "SYL")
        json.dump(sorted(new), open(WORK + "_haeul_x10k_new.json", "w",
                                    encoding="utf-8"), ensure_ascii=False)
        state["phase"] = "verify"
        save_light()
    new = set(_jload(WORK + "_haeul_x10k_new.json", []))
    verify(sorted(new), "SYL")
    el = [(k, raw[k]["total"]) for k in cand
          if raw.get(k, {}).get("real") and raw[k]["total"] >= MINVOL and tier(k)]
    el.sort(key=lambda x: -x[1])
    newel = [(k, v) for k, v in el if k in new]
    print(f"### 전체 적격 {len(el):,} / 이번 신규 적격 {len(newel):,} "
          f"/ 후보 {len(cand):,} / 캐시 {len(raw):,} / {(time.time()-t0)/60:.1f}분", flush=True)
    json.dump([k for k, v in el], open(WORK + "_haeul_x10k_eligible.json", "w",
                                       encoding="utf-8"), ensure_ascii=False)
    for k, v in newel[:40]:
        print(f"   {v:>8,}  {k}", flush=True)


main()
