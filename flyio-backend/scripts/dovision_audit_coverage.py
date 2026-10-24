# -*- coding: utf-8 -*-
"""딥리서치로 찾은 것이 실제로 계정에 들어갔는지 감사.

requeue=false 로 호출한다 — 상태만 읽고 park 해 둔 것을 되살리지 않는다.
(insert-exact 는 기본 requeue=true 라 그냥 부르면 일부러 뺀 것이 다시 살아난다.)
"""
import collections, json, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.environ.get("KT_DIR", ""))
from dovision_axis3_bfs import grade  # noqa: E402

U = ("https://blog-index-analyzer.fly.dev/api/naver-ad/"
     "keyword-pool/admin/insert-exact?user_id=1")
CH = 150


def sets():
    out = {}
    b2b = json.load(open(os.path.join(HERE, "dovision_b2b_final.json"), encoding="utf-8"))
    out["1차 B2B 딥리서치"] = {r["keyword"]: r["monthly_total"] for r in b2b}
    gap = json.load(open(os.path.join(HERE, "dovision_gap_found.json"), encoding="utf-8"))
    out["2차 구멍(자동완성·경쟁브랜드·학원경영·위탁)"] = {k: v["total"] for k, v in gap.items()}
    ax = json.load(open(os.path.join(HERE, "_dovision_axis3_raw.json"), encoding="utf-8"))
    out["3차 축(학원매물·제2의직업·박람회)"] = {
        k: v["total"] for k, v in ax.items()
        if v["total"] >= 10 and grade(k) in ("S", "A")
        and "운전직" not in k and "전직지원" not in k}
    return out


def audit(items):
    dist = collections.Counter()
    for i in range(0, len(items), CH):
        body = json.dumps({"customer_id": "4403292", "items": items[i:i + CH],
                           "min_volume": 10, "requeue": False,
                           "source": "audit"}).encode("utf-8")
        for att in range(5):
            try:
                req = urllib.request.Request(U, data=body, method="POST",
                                             headers={"Content-Type": "application/json; charset=utf-8"})
                r = json.load(urllib.request.urlopen(req, timeout=180))
                dist.update(r.get("status_before") or {})
                break
            except Exception as e:
                print(f"    배치{i//CH+1} 시도{att+1} 실패: {type(e).__name__}", flush=True)
                time.sleep(5 * (att + 1))
        time.sleep(0.8)
    return dist


def main():
    grand = collections.Counter()
    total = 0
    for label, d in sets().items():
        items = [{"keyword": k, "monthly_total": v} for k, v in d.items()]
        dist = audit(items)
        n = sum(dist.values())
        grand.update(dist)
        total += len(items)
        print(f"\n■ {label} — {len(items)}개")
        for k, v in dist.most_common():
            print(f"    {k:<18} {v:>5}  ({v*100//max(n,1)}%)")
        print(f"    → 네이버 라이브 {dist.get('registered',0)} / 등록대기 {dist.get('pending',0)} "
              f"/ 게이트컷 {dist.get('domain_skipped',0)}", flush=True)
    print(f"\n=== 전체 {total}개 ===")
    for k, v in grand.most_common():
        print(f"  {k:<18} {v:>5}")


if __name__ == "__main__":
    main()
