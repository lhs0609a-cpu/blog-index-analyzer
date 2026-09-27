# -*- coding: utf-8 -*-
"""두비전 등록 키워드 전량을 '창업 관심(간절함)' 순으로 줄 세우고 PDF 로 낸다.

입력:
  - 네이버 master-report 덤프(계정 전체 키워드 실측) — 우리 DB 가 아니라 네이버가 준 정답지
  - dovision_intent_bands.BANDS — 간절함 점수표
  - 로컬 리서치 원장들 — 월검색량 붙이기용

출력:
  - dovision_keyword_rank.csv  (전량)
  - dovision_keyword_rank.pdf  (점수>0 인 것 전량, 등급·캠페인별)
"""
import base64, csv, hashlib, hmac, json, os, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dovision_intent_bands import BANDS, POSITION_MAP  # noqa: E402

MASTER = os.environ["MASTER"]
OUT_CSV = os.path.join(HERE, "dovision_keyword_rank.csv")
OUT_PDF = os.path.join(HERE, "dovision_keyword_rank.pdf")
FONT = r"C:\Windows\Fonts\malgun.ttf"
FONT_BD = r"C:\Windows\Fonts\malgunbd.ttf"

CID = os.environ["DV_CID"]; AK = os.environ["DV_AK"]; SK = os.environ["DV_SK"]


def _hdr(m, u):
    ts = str(int(time.time() * 1000))
    sig = base64.b64encode(hmac.new(SK.encode(), f"{ts}.{m}.{u}".encode(),
                                    hashlib.sha256).digest()).decode()
    return {"X-Timestamp": ts, "X-API-KEY": AK, "X-Customer": CID, "X-Signature": sig,
            "Content-Type": "application/json; charset=UTF-8"}


def _get(uri, q=None):
    url = "https://api.searchad.naver.com" + uri + ("?" + urllib.parse.urlencode(q) if q else "")
    for att in range(4):
        try:
            return json.load(urllib.request.urlopen(
                urllib.request.Request(url, headers=_hdr("GET", uri)), timeout=60))
        except Exception:
            time.sleep(2 * (att + 1))
    return []


# ── 점수 ──────────────────────────────────────────────────────────
_bands = [(tuple(t.lower() for t in b["tokens"]), b["score"], b["label"]) for b in BANDS]
_pos = sorted(([int(a), int(b)] for a, b in POSITION_MAP), key=lambda x: -x[0])


def score(kw):
    t = kw.replace(" ", "").lower()
    s = 0
    hit = []
    for toks, sc, label in _bands:
        if any(x in t for x in toks):
            s += sc
            hit.append(label)
    return s, hit


def target_pos(s):
    for lo, p in _pos:
        if s >= lo:
            return p
    return None


def tier(s):
    if s >= 80: return "S · 즉시 상담 가능"
    if s >= 50: return "A · 실행 직전"
    if s >= 38: return "B · 업종 고르는 중"
    if s >= 25: return "C · 정보 수집"
    if s >= 12: return "D · 후보 풀"
    if s > 0:   return "E · 주변부"
    return "F · 창업 의도 없음(B2C 등)"


def main():
    # 1) 캠페인·광고그룹 이름
    camps = _get("/ncc/campaigns")
    cname = {c["nccCampaignId"]: c["name"] for c in camps}
    gname, gcamp = {}, {}
    for c in camps:
        for a in _get("/ncc/adgroups", {"nccCampaignId": c["nccCampaignId"]}) or []:
            gname[a["nccAdgroupId"]] = a.get("name") or ""
            gcamp[a["nccAdgroupId"]] = cname.get(c["nccCampaignId"], "")
    print(f"캠페인 {len(camps)} / 광고그룹 {len(gname):,}", flush=True)

    # 2) 월검색량 (로컬 리서치 원장에서)
    vol = {}
    for f, get in (("_dovision_b2b_raw.json", lambda v: v["total"]),
                   ("_dovision_ac_raw.json", lambda v: v),
                   ("_dovision_axis3_raw.json", lambda v: v["total"]),
                   ("_dovision_fill_pool.json", lambda v: v)):
        try:
            for k, v in json.load(open(os.path.join(HERE, f), encoding="utf-8")).items():
                n = get(v)
                if isinstance(n, int) and n > vol.get(k, 0):
                    vol[k] = n
        except Exception:
            pass
    print(f"월검색량 보유 {len(vol):,}", flush=True)

    # 3) master 덤프 파싱
    rows = []
    seen = set()
    with open(MASTER, encoding="utf-8") as f:
        for line in f:
            p = line.rstrip("\r\n").split("\t")
            if len(p) < 5:
                continue
            gid, kw, bid = p[1], p[3].strip(), p[4]
            if not kw or kw in seen:
                continue
            seen.add(kw)
            s, hit = score(kw)
            rows.append({
                "keyword": kw, "score": s, "tier": tier(s),
                "target_pos": target_pos(s) or "",
                "bid": int(bid) if str(bid).isdigit() else 0,
                "monthly": vol.get(kw, ""),
                "campaign": gcamp.get(gid, ""), "adgroup": gname.get(gid, ""),
                "matched": "/".join(hit),
            })
    rows.sort(key=lambda r: (-r["score"], -(r["monthly"] or 0), r["keyword"]))
    print(f"키워드 {len(rows):,}개 정렬 완료", flush=True)

    with open(OUT_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["순위", "간절함점수", "등급", "키워드", "월검색량",
                                          "현재입찰가", "목표순위", "캠페인", "광고그룹", "매칭축"])
        w.writeheader()
        for i, r in enumerate(rows, 1):
            w.writerow({"순위": i, "간절함점수": r["score"], "등급": r["tier"],
                        "키워드": r["keyword"], "월검색량": r["monthly"],
                        "현재입찰가": r["bid"], "목표순위": r["target_pos"],
                        "캠페인": r["campaign"], "광고그룹": r["adgroup"],
                        "매칭축": r["matched"]})
    print("CSV:", OUT_CSV)
    json.dump(rows, open(os.path.join(HERE, "_dovision_rank.json"), "w", encoding="utf-8"),
              ensure_ascii=False)

    import collections
    agg = collections.Counter(r["tier"] for r in rows)
    print("\n등급 분포")
    for t, n in sorted(agg.items()):
        print(f"  {t:<24} {n:>7,}")


if __name__ == "__main__":
    main()
