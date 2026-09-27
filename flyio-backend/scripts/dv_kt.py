# -*- coding: utf-8 -*-
"""네이버 searchad keywordstool 최소 클라이언트.

자격증명은 환경변수로만 받는다(DV_CID/DV_AK/DV_SK). 파일에 비밀을 남기지 않는다.
'< 10' 은 0 으로 눕힌다 — 10 으로 읽으면 없는 수요를 있다고 착각한다.
"""
import base64, hashlib, hmac, json, os, time, urllib.parse, urllib.request

BASE = "https://api.searchad.naver.com"
CID = os.environ.get("DV_CID", "")
AK = os.environ.get("DV_AK", "")
SK = os.environ.get("DV_SK", "")


def _sig(ts, method, path):
    msg = f"{ts}.{method}.{path}"
    return base64.b64encode(hmac.new(SK.encode(), msg.encode(), hashlib.sha256).digest()).decode()


def _num(v):
    if v is None:
        return 0
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v).strip().replace(",", "")
    if not s or s.startswith("<"):
        return 0          # '< 10' = 사실상 없는 수요
    try:
        return int(s)
    except ValueError:
        return 0


def _req(path, params, tries=5):
    qs = urllib.parse.urlencode(params, doseq=True)
    last = None
    for a in range(tries):
        ts = str(int(time.time() * 1000))
        req = urllib.request.Request(
            f"{BASE}{path}?{qs}",
            headers={"X-Timestamp": ts, "X-API-KEY": AK, "X-Customer": CID,
                     "X-Signature": _sig(ts, "GET", path)})
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            last = e
            time.sleep(min(8, 1.2 * (a + 1)))
    raise last


def keywordstool(hints):
    """힌트 최대 5개 → 연관 키워드 행. 힌트당 최대 1,200행."""
    hs = [h.replace(" ", "") for h in hints if h and h.strip()][:5]
    if not hs:
        return []
    d = _req("/keywordstool", {"hintKeywords": ",".join(hs), "showDetail": "1"})
    out = []
    for r in d.get("keywordList") or []:
        pc, mo = _num(r.get("monthlyPcQcCnt")), _num(r.get("monthlyMobileQcCnt"))
        out.append({"kw": r.get("relKeyword"), "pc": pc, "mo": mo, "total": pc + mo,
                    "comp": r.get("compIdx"),
                    "clk_pc": _num(r.get("monthlyAvePcClkCnt")),
                    "clk_mo": _num(r.get("monthlyAveMobileClkCnt"))})
    return out


def estimate_position_bid(keywords, device="PC"):
    """순위별(1~5위) 추정 입찰가. 한 번에 100개까지."""
    import json as _j
    body = {"device": device, "keywordplus": False,
            "items": [{"key": k, "position": p} for k in keywords for p in (1, 2, 3, 5)]}
    ts = str(int(time.time() * 1000))
    path = "/estimate/average-position-bid/keyword"
    req = urllib.request.Request(
        BASE + path, data=_j.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json; charset=UTF-8",
                 "X-Timestamp": ts, "X-API-KEY": AK, "X-Customer": CID,
                 "X-Signature": _sig(ts, "POST", path)})
    with urllib.request.urlopen(req, timeout=60) as r:
        return _j.loads(r.read().decode()).get("estimate") or []
