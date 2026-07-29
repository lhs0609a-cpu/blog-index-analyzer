# -*- coding: utf-8 -*-
"""두통 시드 1만 확장 — 네이버 **모바일** 자동완성 채널 (2026-07-29).

지난 세션의 자모 드레인은 전부 PC 엔드포인트(`ac.search.naver.com/nx/ac`, st=100)였다.
모바일(`mac.search.naver.com/mobile/ac`, st=111)은 **다른 제안 트리**를 준다:
    PC   편두통 → 원인/약/영어로/위치/약국약/이유/완화법/응급실
    모바일 편두통 → 원인/심할때/약/증상/지압/병원/치료/위치/전정편두통
실측 900질의에 코퍼스밖 신규 0.014/q — PC 음절드레인(0.0009/q)의 15배, 게다가 300q/s.

루트는 사용자 요청대로 두통 연관 코어 시드 10,069(`_haeul_mega_seeds_core.json`).
접두사는 PC 드레인과 동일하게 초성19 + 음절(구·신) 전량.
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
CAND = WORK + "_haeul_mac_cand.json"
STATE = WORK + "_haeul_mac_state.json"

MINVOL = 10
WORKERS = int(os.environ.get("WORKERS", "14"))
ROOT_CAP = int(os.environ.get("ROOT_CAP", "10069"))
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


CHOSEONG = list("ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㄲㄸㅃㅆㅉ")
SYLL = ["가", "고", "그", "나", "내", "너", "다", "더", "도", "때", "마", "머", "무",
        "바", "병", "부", "빨", "사", "생", "소", "심", "아", "안", "어", "언", "얼",
        "오", "왜", "왼", "원", "위", "이", "임", "자", "잘", "제", "조", "좋", "주",
        "증", "지", "차", "채", "초", "치", "코", "타", "턱", "통", "하", "한", "혈",
        "검", "결", "관", "구", "귀", "근", "급", "기", "눈", "느", "단", "당", "대",
        "동", "두", "만", "맞", "목", "몸", "물", "밤", "방", "별", "복", "비", "새",
        "서", "속", "수", "스", "시", "식", "신", "실", "약", "양", "없", "여", "연",
        "열", "예", "완", "요", "우", "울", "응", "의", "인", "입", "재", "적", "전",
        "점", "정", "중", "쥐", "찌", "척", "천", "체", "침", "크", "탈", "파", "편",
        "피", "핑", "허", "호", "화", "회", "후", "흉", "힘"]
PREFIX = [""] + CHOSEONG + SYLL

UA = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1"}
_stat = {"q": 0, "hit": 0, "err": 0}
_lock = threading.Lock()


def mac(q):
    u = "https://mac.search.naver.com/mobile/ac?" + urllib.parse.urlencode(
        {"q": q, "con": 0, "frm": "mobile_nv", "ans": 2, "r_format": "json",
         "r_enc": "UTF-8", "r_lt": 111, "st": 111, "q_enc": "UTF-8"})
    for _ in range(2):
        try:
            d = json.loads(urllib.request.urlopen(
                urllib.request.Request(u, headers=UA), timeout=8).read().decode("utf-8", "ignore"))
            break
        except Exception:
            time.sleep(0.3)
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
        _stat["q"] += 1
        _stat["hit"] += len(out)
    return out


raw = _jload(RAW, {})
corpus = set(raw) | set(_jload(WORK + "_haeul_mega_cand.json", []))
cand = set(_jload(CAND, []))
state = _jload(STATE, {"phase": "crawl", "cursor": 0})
print(f"코퍼스 {len(corpus):,} / 볼륨캐시 {len(raw):,}", flush=True)


def save_light():
    json.dump(sorted(cand), open(CAND, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(state, open(STATE, "w", encoding="utf-8"), ensure_ascii=False)


def save_all():
    json.dump(raw, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
    save_light()


def crawl():
    roots = [r for r in _jload(BASE + "_haeul_mega_seeds_core.json", []) if len(r) <= 14][:ROOT_CAP]
    jobs = [r + p for r in roots for p in PREFIX]
    start = state.get("cursor", 0)
    print(f"[MAC] 루트 {len(roots):,} × 접두 {len(PREFIX)} = {len(jobs):,} 질의 "
          f"(재개 {start:,})", flush=True)
    new = set()
    t0 = time.time()

    def one(q):
        return [k for k in (s.replace(" ", "") for s in mac(q)) if k and tier(k)]

    with ThreadPoolExecutor(WORKERS) as ex:
        for i, res in enumerate(ex.map(one, jobs[start:])):
            for k in res:
                if k not in cand:
                    cand.add(k)
                    if k not in corpus:
                        new.add(k)
            if (i + 1) % 20000 == 0:
                el = time.time() - t0
                state["cursor"] = start + i + 1
                print(f"  [MAC] {start+i+1:,}/{len(jobs):,}q  후보 {len(cand):,} "
                      f"신규 {len(new):,}  ({el/60:.1f}분, {(i+1)/max(el,1):.0f}q/s)", flush=True)
                save_light()
                json.dump(sorted(new), open(WORK + "_haeul_mac_new.json", "w",
                                            encoding="utf-8"), ensure_ascii=False)
    state["cursor"] = len(jobs)
    json.dump(sorted(new), open(WORK + "_haeul_mac_new.json", "w",
                                encoding="utf-8"), ensure_ascii=False)
    save_light()
    print(f"[MAC] 완료 — 후보 {len(cand):,} 신규 {len(new):,} "
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


def main():
    t0 = time.time()
    if state.get("phase") == "crawl":
        crawl()
        state["phase"] = "verify"
        save_light()
    new = set(_jload(WORK + "_haeul_mac_new.json", []))
    verify(sorted(new), "MAC")
    el = [(k, raw[k]["total"]) for k in new
          if raw.get(k, {}).get("real") and raw[k]["total"] >= MINVOL and tier(k)]
    el.sort(key=lambda x: -x[1])
    json.dump([k for k, v in el], open(WORK + "_haeul_mac_eligible.json", "w",
                                       encoding="utf-8"), ensure_ascii=False)
    print(f"### MAC 신규 적격 {len(el):,} / 신규후보 {len(new):,} "
          f"/ {(time.time()-t0)/60:.1f}분", flush=True)
    for k, v in el[:30]:
        print(f"   {v:>8,}  {k}", flush=True)


main()
