# -*- coding: utf-8 -*-
"""라운드4 — 질환 **동의어/관련질환** 전수 수집 (2026-07-30).

★ 이게 가장 값진 어휘층이다. 사람들은 학술 정식명을 치지 않는다:
  `간의 양성 신생물`(정식) 은 아무도 안 치고 **`간종양`**(동의어)을 친다.
서울아산병원 질환 상세페이지(`diseaseDetail.do?contentId=N`)에 **동의어**와 **관련질환**이
평문으로 들어있다. 1,207페이지 = 몇 분. 라운드2 루트(정식명)의 검색형 짝을 만들어준다.

산출: `_haeul_syn_terms.json`
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
            time.sleep(0.8 * (a + 1))
    return ""


def flat(s):
    s = _PAREN.sub("", re.sub(r"&nbsp;?", " ", s))
    s = re.sub(r"[A-Za-z]{3,}.*$", "", s)
    return re.sub(r"[^0-9가-힣A-Za-z]", "", s)


# ------------------------------------------------------------------
# 1) contentId 전수 수집
# ------------------------------------------------------------------
def ids(pi):
    h = get(f"https://www.amc.seoul.kr/asan/healthinfo/disease/diseaseList.do?pageIndex={pi}")
    return re.findall(r"diseaseDetail\.do\?contentId=(\d+)", h)


cids = set()
with ThreadPoolExecutor(max_workers=6) as ex:
    for r in ex.map(ids, range(1, 131)):
        cids.update(r)
cids = sorted(cids)
print(f"질환 상세 contentId {len(cids):,}", flush=True)

# ------------------------------------------------------------------
# 2) 동의어 / 관련질환 추출
# ------------------------------------------------------------------
terms = {}


def one(cid):
    h = get(f"https://www.amc.seoul.kr/asan/healthinfo/disease/diseaseDetail.do?contentId={cid}")
    if not h:
        return []
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h))
    out = []
    m = re.search(r"동의어\s*([^-<]{2,200}?)(?:-->|진료과|정의|$)", t)
    if m:
        for x in re.split(r"[,·/]", m.group(1)):
            out.append(("동의어", x))
    m = re.search(r"관련질환\s*([^-<]{2,200}?)(?:진료과|동의어|정의|$)", t)
    if m:
        for x in re.split(r"[,·/]", m.group(1)):
            out.append(("관련질환", x))
    return out


t0 = time.time()
done = 0
with ThreadPoolExecutor(max_workers=8) as ex:
    for rows in ex.map(one, cids):
        for kind, x in rows:
            f = flat(x)
            if 3 <= len(f) <= 22 and re.search(r"[가-힣]", f):
                terms.setdefault(f, "아산_" + kind)
        done += 1
        if done % 200 == 0:
            print(f"  {done:,}/{len(cids):,} · 용어 {len(terms):,} "
                  f"· {(time.time()-t0)/60:.1f}분", flush=True)

# 기존 라운드 루트와 중복 제거
prev = set()
for f in ("_haeul_enc_terms.json", "_haeul_rare_vocab.json", "_haeul_enc2_terms.json"):
    try:
        prev |= set(json.load(open(BASE + f, encoding="utf-8")))
    except Exception:
        pass
fresh = {k: v for k, v in terms.items() if k not in prev}
from collections import Counter
print(f"\n★ 라운드4 신선 루트 **{len(fresh):,}** (수집 {len(terms):,})", flush=True)
print("출처별:", dict(Counter(fresh.values()).most_common()), flush=True)
print("샘플:", sorted(fresh)[:25], flush=True)
json.dump(fresh, open(BASE + "_haeul_syn_terms.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
