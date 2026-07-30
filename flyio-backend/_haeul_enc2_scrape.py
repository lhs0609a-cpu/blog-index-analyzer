# -*- coding: utf-8 -*-
"""라운드3 루트 — 아산 증상 전수 + 검사/시술 542 + 한방 처방 (2026-07-30).

라운드2(질환백과 2,677 루트)가 0.139/q(네이버) · 1.223/q(Bing) 를 냈다. 수율은 루트의
신선함에 붙으므로 계속 새 루트층을 붙인다. 이번 층:
  · 서울아산병원 **증상** 전수 (`symptomList.do`) — 환자가 실제로 치는 표현에 가장 가깝다
  · 서울아산병원 **검사/시술** 542 (`managementList.do`) — `갑상선기능검사` 류, 검색량 있음
  · 한방 처방명 (`_haeul_herb_terms.json`)

산출: `_haeul_enc2_terms.json`
"""
import io
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
BASE = "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend/"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    " (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}
_PAREN = re.compile(r"\([^)]*\)")


def get(url, tries=3):
    for a in range(tries):
        try:
            return urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=40).read().decode("utf-8", "replace")
        except Exception:
            time.sleep(1.0 * (a + 1))
    return ""


def norm(s):
    s = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)).strip()
    s = _PAREN.sub("", s)
    s = re.sub(r"[A-Za-z]{3,}.*$", "", s)
    return re.sub(r"[^0-9가-힣A-Za-z]", "", s)


terms = {}


def add(t, src):
    t = norm(t)
    if 3 <= len(t) <= 22 and re.search(r"[가-힣]", t):
        terms.setdefault(t, src)


def page(kind, pi):
    if kind == "증상":
        h = get(f"https://www.amc.seoul.kr/asan/healthinfo/symptom/symptomList.do?pageIndex={pi}")
        pat = r'symptomDetail\.do\?[^"]*"[^>]*>(.*?)</a>'
    else:
        h = get("https://www.amc.seoul.kr/asan/healthinfo/management/managementList.do"
                f"?pageIndex={pi}")
        pat = r'managementDetail\.do\?[^"]*"[^>]*>(.*?)</a>'
    return re.findall(pat, h, re.S)


for kind, pages in (("증상", 40), ("검사", 60)):
    before = len(terms)
    with ThreadPoolExecutor(max_workers=6) as ex:
        for rows in ex.map(lambda p, k=kind: page(k, p), range(1, pages + 1)):
            for t in rows:
                add(t, "아산_" + kind)
    print(f"아산 {kind} → 신규 {len(terms)-before:,} · 누적 {len(terms):,}", flush=True)

before = len(terms)
for t in json.load(open(BASE + "_haeul_herb_terms.json", encoding="utf-8")):
    add(t, "한방처방")
print(f"한방처방 → 신규 {len(terms)-before:,} · 누적 {len(terms):,}", flush=True)

# 라운드2 루트와 중복 제거 (이미 훑은 루트를 다시 돌리면 비용만 든다)
r2 = set(json.load(open(BASE + "_haeul_enc_terms.json", encoding="utf-8")))
r1 = set(json.load(open(BASE + "_haeul_rare_vocab.json", encoding="utf-8")))
fresh = {k: v for k, v in terms.items() if k not in r2 and k not in r1}
from collections import Counter
print(f"\n★ 라운드3 신선 루트 **{len(fresh):,}** (수집 {len(terms):,} - 기존라운드 중복)", flush=True)
print("출처별:", dict(Counter(fresh.values()).most_common()), flush=True)
print("샘플:", sorted(fresh)[:22], flush=True)
json.dump(fresh, open(BASE + "_haeul_enc2_terms.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
