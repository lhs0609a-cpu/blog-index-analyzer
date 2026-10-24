# -*- coding: utf-8 -*-
"""두비전 B2C — 네이버 자동완성 BFS (학부모가 '치기 시작한 문장').

연관키워드와 자동완성은 다른 채널이다. 연관키워드는 '같이 검색되는 것',
자동완성은 '사람이 실제로 치기 시작한 문장'이다. 학부모 고민은 문장으로 들어온다 —
'공부해도성적이안올라요' 같은 말은 keywordstool 연관에 잘 안 뜬다.

2단계: (1) collect — 자동완성만으로 후보 수집(외부 API 부하 없음)
       (2) measure — keywordstool 로 실검색량 측정, 0 은 버린다.
"""
import json, os, sys, time, urllib.parse, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

CAND = os.path.join(HERE, "_dv_fc2_ac_cand.json")
RAW = os.path.join(HERE, "_dv_fc2_ac_vol.json")
ROUNDS = int(os.environ.get("ROUNDS", "3"))
MAX_AC = int(os.environ.get("MAX_AC", "2500"))

SEEDS = json.load(open(os.path.join(HERE, "_dv_fc2_seeds.json"), encoding="utf-8"))



def ac(q):
    """네이버 자동완성. 실패는 [] (없음 아님)."""
    u = ("https://ac.search.naver.com/nx/ac?q=" + urllib.parse.quote(q) +
         "&con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0"
         "&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100")
    try:
        req = urllib.request.Request(u, headers={
            "User-Agent": "Mozilla/5.0", "Referer": "https://search.naver.com/"})
        d = json.load(urllib.request.urlopen(req, timeout=15))
    except Exception:
        return []
    out = []
    for grp in d.get("items") or []:
        for it in grp:
            if it and it[0]:
                out.append(it[0].strip())
    return out


def collect():
    from dovision_fc_classify import classify
    seen_q, found = set(), set()
    frontier, calls, t0 = list(SEEDS), 0, time.time()
    for rnd in range(1, ROUNDS + 1):
        nxt = []
        for q in frontier:
            if calls >= MAX_AC:
                break
            qn = q.replace(" ", "")
            if qn in seen_q:
                continue
            seen_q.add(qn)
            for s in ac(q):
                sn = s.replace(" ", "")
                if sn and sn not in found:
                    found.add(sn)
                    # 온도메인만 다시 질의한다 — 아니면 자동완성이 딴 동네로 새 나간다
                    if classify(sn)[0] is not None:
                        nxt.append(s)
            calls += 1
            time.sleep(0.2)
        print(f"[r{rnd}] 질의 {calls} → 후보 {len(found):,} (다음 프론티어 {len(nxt):,}) "
              f"{time.time()-t0:.0f}s", flush=True)
        json.dump(sorted(found), open(CAND, "w", encoding="utf-8"), ensure_ascii=False)
        frontier = nxt
        if calls >= MAX_AC or not frontier:
            break
    json.dump(sorted(found), open(CAND, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"수집 완료 {len(found):,} → {CAND}")


def measure():
    from dv_kt import keywordstool
    cand = json.load(open(CAND, encoding="utf-8"))
    vol = json.load(open(RAW, encoding="utf-8")) if os.path.exists(RAW) else {}
    todo = [c for c in cand if c not in vol]
    print(f"볼륨 측정 {len(todo):,}개 (기존 {len(vol):,})", flush=True)
    for i in range(0, len(todo), 5):
        chunk = todo[i:i + 5]
        try:
            got = {r["kw"]: r["total"] for r in keywordstool(chunk)}
        except Exception:
            got = {}
        for c in chunk:
            vol[c] = got.get(c, 0)
        if (i // 5) % 50 == 0:
            json.dump(vol, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
            print(f"  {i}/{len(todo)}", flush=True)
    json.dump(vol, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
    live = sorted(((v, k) for k, v in vol.items() if v >= 10), reverse=True)
    print(f"\n자동완성 후보 {len(vol):,} → 실검색량 10+ {len(live):,}개")
    print("상위 40: " + ", ".join(f"{k}({v:,})" for v, k in live[:40]))


if __name__ == "__main__":
    (measure if "--measure" in sys.argv else collect)()
