# -*- coding: utf-8 -*-
"""한방 처방명(방제) 전수 스크랩 — 라운드3 루트 (2026-07-30).

한의원 계정에 가장 적합도 높은 어휘층. `반하백출천마탕 효능` 처럼 처방명+의도로 실제 검색된다.
소스: 약학정보원 한약처방 DB(`health.kr/researchInfo/herbalMedicine2.asp`, HVpaging_value+HVsetLine=100
      + 초성검색) + OASIS 전통의학정보포털 목록.

⚠️ **2~3글자 약재명은 앵커 금지**(백지→백지영, 천마→부천마사지, 시호→야노시호, 황금→황금코다리).
   처방명은 4글자 이상이 대부분이라 안전하지만, 3글자 이하는 여기서 걸러낸다.

산출: `_haeul_herb_terms.json`
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

# 방제 접미 — 이 형태로 끝나는 한글어만 처방명으로 인정한다(일반 문장 오수집 방지)
SUF = ("탕", "산", "환", "음", "단", "원", "고", "전", "다", "주", "정", "차")
NAME = re.compile(r"^[가-힣]{3,18}$")


def get(url, tries=3):
    for a in range(tries):
        try:
            return urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=40).read().decode("utf-8", "replace")
        except Exception:
            time.sleep(1.0 * (a + 1))
    return ""


terms = {}


def add(t, src):
    t = re.sub(r"[^0-9가-힣A-Za-z]", "", t)
    # ⚠️ 4글자+ 만. 2~3글자 한방 어휘는 인명/지명/브랜드 부분문자열 지뢰다.
    if NAME.match(t) and len(t) >= 4 and t.endswith(SUF):
        terms.setdefault(t, src)


# ------------------------------------------------------------------
# 1. 약학정보원 — 초성 × 페이징
# ------------------------------------------------------------------
CHO = list("ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ")


def health_kr(job):
    cho, pg = job
    u = ("https://health.kr/researchInfo/herbalMedicine2.asp?inputField="
         f"&HVsearchTerm={urllib.parse.quote(cho)}&HVpaging_value={pg}"
         "&HVsetLine=100&HVsearchMode=initial")
    h = get(u)
    return re.findall(r">([가-힣]{3,18})<", h)


jobs = [(c, p) for c in CHO for p in range(1, 9)]
with ThreadPoolExecutor(max_workers=6) as ex:
    for rows in ex.map(health_kr, jobs):
        for t in rows:
            add(t, "약학정보원_처방")
print(f"약학정보원 → 처방 {len(terms):,}", flush=True)

# ------------------------------------------------------------------
# 2. OASIS 전통의학정보포털
# ------------------------------------------------------------------
before = len(terms)
for pg in range(1, 40):
    h = get("https://oasis.kiom.re.kr/contents/c_kiom04.do"
            f"?srch_menu_nix=y7044C4k&pageIndex={pg}")
    if not h:
        break
    for t in re.findall(r">([가-힣]{3,18})<", h):
        add(t, "OASIS_처방")
print(f"OASIS → 신규 {len(terms)-before:,} · 누적 {len(terms):,}", flush=True)

# ------------------------------------------------------------------
# 3. 두통/어지럼 관련 고빈도 처방 — 리서치 확보분(누락 방지용 하드코딩)
# ------------------------------------------------------------------
KNOWN = """청상견통탕 반하백출천마탕 오수유탕 조등산 천궁차조산 갈근탕 계지인삼탕
당귀보혈탕 반하후박탕 시호계지탕 영계술감탕 진무탕 택사탕 자음건비탕 혈부축어탕
통규탕 소경활혈탕 천마구등음 대천궁산 승마갈근탕 가미소요산 가미온담탕 곽향정기산
구미강활탕 당귀수산 독활기생탕 마자인환 맥문동탕 반하사심탕 방기황기탕 보중익기탕
사군자탕 사물탕 삼소음 생맥산 소청룡탕 시호청간탕 안중산 연교패독산 오적산
육군자탕 이중탕 인진호탕 자음강화탕 조위승기탕 평위산 형개연교탕 황련해독탕
황금작약탕 대영전 삼출건비탕 시경반하탕 오패산 이진탕 팔물탕 향사평위산
귀비탕 온담탕 소요산 억간산 조등산 천왕보심단 공진단 경옥고 쌍화탕 십전대보탕"""
before = len(terms)
for t in KNOWN.split():
    add(t, "리서치_두통처방")
print(f"리서치 처방 → 신규 {len(terms)-before:,} · 총 {len(terms):,}", flush=True)

from collections import Counter
print("출처별:", dict(Counter(terms.values()).most_common()), flush=True)
print("샘플:", sorted(terms)[:25], flush=True)
json.dump(terms, open(BASE + "_haeul_herb_terms.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
