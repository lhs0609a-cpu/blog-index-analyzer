# -*- coding: utf-8 -*-
"""대형 한글 질환백과 3소스 전수 스크랩 — 루트 대량 확보 (2026-07-30 라운드2).

라운드1(질병관리청 희귀질환 1,386 + ICHD-3 1,011)이 죽었다던 채널을 22배로 되살렸다.
수율이 전적으로 **루트의 신선함**에 붙으므로, 이번엔 루트 자체를 훨씬 크게 만든다.

소스 (전부 공개 목록 페이지. ⚠️ KOICD 는 캡차로 대량조회를 차단하므로 쓰지 않는다):
  1. 서울아산병원 질환백과 `amc.seoul.kr/asan/healthinfo/disease/diseaseList.do` — 1,285건.
     항목마다 **증상명 링크**(symptomList.do?symptomId=)도 있어 증상 어휘까지 덤으로 걷힌다.
  2. 서울대학교병원 의학정보 `snuh.org/health/nMedInfo/nList.do`
  3. 국가건강정보포털 `health.kdca.go.kr` 건강문제 목록

산출: `_haeul_enc_terms.json` {용어: 출처}
"""
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
BASE = "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend/"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    " (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}


def get(url, tries=3):
    for a in range(tries):
        try:
            return urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=40).read().decode("utf-8", "replace")
        except Exception:
            time.sleep(1.2 * (a + 1))
    return ""


def clean(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)).strip()


_PAREN = re.compile(r"\([^)]*\)")


def ko_only(s):
    """`간의 양성 신생물(Benign neoplasm of the liver)` → 한글명만."""
    s = _PAREN.sub("", s).strip()
    s = re.sub(r"[A-Za-z]{3,}.*$", "", s).strip()
    return s


terms = {}


def add(t, src):
    t = ko_only(t)
    if not t:
        return
    flat = re.sub(r"[^0-9가-힣A-Za-z]", "", t)
    if 3 <= len(flat) <= 22 and re.search(r"[가-힣]", flat):
        terms.setdefault(flat, src)


# ==================================================================
# 1. 서울아산병원 질환백과 (+ 증상명)
# ==================================================================
def asan(pi):
    h = get(f"https://www.amc.seoul.kr/asan/healthinfo/disease/diseaseList.do?pageIndex={pi}")
    out = []
    for m in re.findall(r'diseaseDetail\.do\?contentId=\d+"[^>]*>(.*?)</a>', h, re.S):
        out.append(("질환", clean(m)))
    for m in re.findall(r'symptomList\.do\?symptomId=[A-Z0-9]+"[^>]*>(.*?)</a>', h, re.S):
        out.append(("증상", clean(m)))
    return out


h1 = get("https://www.amc.seoul.kr/asan/healthinfo/disease/diseaseList.do?pageIndex=1")
tot = re.search(r"([\d,]+)건", clean(h1))
n_tot = int(tot.group(1).replace(",", "")) if tot else 1285
pages = (n_tot // 10) + 2
print(f"아산 질환백과 {n_tot:,}건 → {pages}페이지", flush=True)
with ThreadPoolExecutor(max_workers=6) as ex:
    for rows in ex.map(asan, range(1, pages + 1)):
        for kind, t in rows:
            add(t, "아산_" + kind)
print(f"  누적 용어 {len(terms):,}", flush=True)


# ==================================================================
# 2. 서울대학교병원 의학정보
# ==================================================================
def snuh(pi):
    h = get("https://www.snuh.org/health/nMedInfo/nList.do"
            f"?searchYn=Y&pageIndex={pi}&category=DIS")
    return [clean(m) for m in re.findall(r'nView\.do\?[^"]*"[^>]*>(.*?)</a>', h, re.S)]


got = 0
with ThreadPoolExecutor(max_workers=6) as ex:
    for rows in ex.map(snuh, range(1, 121)):
        for t in rows:
            before = len(terms)
            add(t, "서울대_질환")
            got += len(terms) - before
print(f"서울대 의학정보 → 신규 {got:,} · 누적 {len(terms):,}", flush=True)


# ==================================================================
# 3. 국가건강정보포털 — 건강문제 목록
# ==================================================================
def kdca_health(pi):
    h = get("https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/"
            f"gnrlzHealthInfoView.do" if False else
            "https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/"
            f"gnrlzHealthInfoList.do?pageIndex={pi}")
    return [clean(m) for m in re.findall(r'gnrlzHealthInfoView\.do\?[^"]*"[^>]*>(.*?)</a>', h, re.S)]


got = 0
with ThreadPoolExecutor(max_workers=5) as ex:
    for rows in ex.map(kdca_health, range(1, 61)):
        for t in rows:
            before = len(terms)
            add(t, "국가건강정보_질환")
            got += len(terms) - before
print(f"국가건강정보포털 → 신규 {got:,} · 누적 {len(terms):,}", flush=True)

from collections import Counter
print("\n출처별:", dict(Counter(terms.values()).most_common()), flush=True)
print("샘플:", list(terms)[:20], flush=True)
json.dump(terms, open(BASE + "_haeul_enc_terms.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
