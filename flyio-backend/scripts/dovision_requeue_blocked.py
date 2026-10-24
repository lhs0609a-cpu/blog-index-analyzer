# -*- coding: utf-8 -*-
"""게이트에 막혀 죽어 있던 '검수 통과 목록'만 되살린다.

주의: park 해 둔 잡키워드(평생교육원·여성기업확인서·운전직)는 절대 건드리지 않는다.
여기서 되살리는 것은 1·2·3차 딥리서치에서 사람이 검수해 채택한 목록뿐이다.
relevance_keywords 를 넓혔으므로 이제 등록 게이트를 통과한다.
"""
import json, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.environ.get("KT_DIR", ""))
from dovision_axis3_bfs import grade  # noqa: E402

U = ("https://blog-index-analyzer.fly.dev/api/naver-ad/"
     "keyword-pool/admin/insert-exact?user_id=1")
CH = 100
# 되살리면 안 되는 것 — 부분문자열 오탐과 자재 구매 의도
BLOCK = ("운전직", "안전직", "전직지원", "유학원박람회", "돌봄교실책상", "돌봄교실인테리어",
         "늘봄교실인테리어", "돌봄교실리모델링", "돌봄교실만들기", "퍼스널컬러출강",
         "아로마테라피출강", "원어민출강")


def load():
    d = {}
    for r in json.load(open(os.path.join(HERE, "dovision_b2b_final.json"), encoding="utf-8")):
        d[r["keyword"]] = (r["monthly_total"], r["monthly_pc"], r["monthly_mobile"])
    for k, v in json.load(open(os.path.join(HERE, "dovision_gap_found.json"), encoding="utf-8")).items():
        d.setdefault(k, (v["total"], v.get("pc") or 0, v.get("mo") or 0))
    ax = json.load(open(os.path.join(HERE, "_dovision_axis3_raw.json"), encoding="utf-8"))
    for k, v in ax.items():
        if v["total"] >= 10 and grade(k) in ("S", "A"):
            d.setdefault(k, (v["total"], v["pc"], v["mo"]))
    return {k: v for k, v in d.items() if not any(b in k for b in BLOCK)}


def main():
    d = load()
    items = [{"keyword": k, "monthly_total": v[0], "monthly_pc": v[1], "monthly_mobile": v[2]}
             for k, v in d.items()]
    print(f"되살릴 후보 {len(items):,}개")
    added = requeued = 0
    for i in range(0, len(items), CH):
        body = json.dumps({"customer_id": "4403292", "items": items[i:i + CH],
                           "min_volume": 10, "requeue": True,
                           "source": "revive_2026-09"}).encode("utf-8")
        for att in range(5):
            try:
                req = urllib.request.Request(U, data=body, method="POST",
                                             headers={"Content-Type": "application/json; charset=utf-8"})
                r = json.load(urllib.request.urlopen(req, timeout=180))
                added += r.get("added") or 0
                requeued += r.get("requeued") or 0
                print(f"  {i//CH+1}배치 신규 {r.get('added')} / 되살림 {r.get('requeued')} "
                      f"| 기존 {r.get('status_before')}", flush=True)
                break
            except Exception as e:
                print(f"  {i//CH+1}배치 시도{att+1} 실패 {type(e).__name__}", flush=True)
                time.sleep(5 * (att + 1))
        time.sleep(1.2)
    print(f"\n완료 — 신규 {added} / 되살림 {requeued}")


if __name__ == "__main__":
    main()
