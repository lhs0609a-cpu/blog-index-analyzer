# -*- coding: utf-8 -*-
"""국가관리대상 희귀질환 전수 스크랩 (2026-07-30).

`helpline.kdca.go.kr` 희귀질환 헬프라인 = 질병관리청이 지정한 희귀질환 **1,389개**의
공식 목록. 지금까지 이 계정에 투입한 어휘는 전부 자동완성/keywordstool/LLM 산출물이라
**공식 질환 택소노미는 한 번도 들어간 적이 없다.** 자모 접두사가 "포화"를 뒤집었던 것과
같은 종류의 레버 — 어휘 소스 교체.

10/페이지 × 139페이지. `<dt>한글명<p>영문명</p></dt>` + KCD코드 + 항목분류.
산출: `_haeul_rare_list.json` [{ko, en, kcd, cls}]
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
URL = ("https://helpline.kdca.go.kr/cdchelp/ph/rdiz/selectRdizInfList.do"
       "?menu=A0100&pageIndex={}")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def strip(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)).strip()


def page(idx):
    for attempt in range(4):
        try:
            req = urllib.request.Request(URL.format(idx), headers=UA)
            h = urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "replace")
            break
        except Exception as e:
            if attempt == 3:
                print(f"  p{idx} 실패: {e}", flush=True)
                return []
            time.sleep(1.5 * (attempt + 1))
    out = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", h, re.S):
        dt = re.search(r"<dt>(.*?)</dt>", row, re.S)
        if not dt:
            continue
        inner = dt.group(1)
        en = re.search(r"<p>(.*?)</p>", inner, re.S)
        ko = strip(re.sub(r"<p>.*?</p>", "", inner, flags=re.S))
        kcd = re.search(r"KCD코드\s*:?\s*</span>\s*([^<]*)", row)
        cls = re.search(r"항목분류\s*:?\s*</span>\s*([^<]*)", row)
        if ko:
            out.append({
                "ko": ko,
                "en": strip(en.group(1)) if en else "",
                "kcd": (kcd.group(1).strip() if kcd else ""),
                "cls": (cls.group(1).strip() if cls else ""),
            })
    return out


with ThreadPoolExecutor(max_workers=6) as ex:
    pages = list(ex.map(page, range(1, 140)))

rows, seen = [], set()
for p in pages:
    for r in p:
        if r["ko"] not in seen:
            seen.add(r["ko"])
            rows.append(r)

print(f"희귀질환 {len(rows):,}개 수집 (기대 1,389)", flush=True)
json.dump(rows, open(BASE + "_haeul_rare_list.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

# KCD 대분류(첫 글자)별 분포 — G(신경계)·H(눈/귀)·I(순환계)가 두통 연관 후보
from collections import Counter
c = Counter((r["kcd"][:1] or "?") for r in rows)
print("KCD 대분류:", dict(sorted(c.items(), key=lambda x: -x[1])), flush=True)
print("샘플:", [r["ko"] for r in rows[:5]], flush=True)
