# -*- coding: utf-8 -*-
"""검수 완료된 B2B 키워드를 프로덕션 pending 에 그대로 넣는다(연관확장 없음).

dovision_b2b_final.json → /keyword-pool/admin/insert-exact.
배치를 40개로 잘게 끊는 이유: 같은 sqlite 를 크론이 계속 만져서 큰 쓰기는 'database is locked'.
register 크론(30초 간격)이 이후 도메인게이트 → 테마 라우팅 → 네이버 등록을 수행한다.
"""
import json, os, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
URL = "https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/admin/insert-exact?user_id=1"
CID = "4403292"
CH = 40

rows = json.load(open(os.path.join(HERE, "dovision_b2b_final.json"), encoding="utf-8"))
items = [{"keyword": r["keyword"], "monthly_total": r["monthly_total"],
          "monthly_pc": r["monthly_pc"], "monthly_mobile": r["monthly_mobile"],
          "comp_idx": r.get("comp_idx") or None} for r in rows]
print(f"업로드 대상 {len(items):,}개 / 월검색합 {sum(i['monthly_total'] for i in items):,}")

added = requeued = attempted = 0
dist = {}
for i in range(0, len(items), CH):
    chunk = items[i:i + CH]
    body = json.dumps({"customer_id": CID, "items": chunk, "min_volume": 10,
                       "source": "b2b_research_2026-09"}).encode("utf-8")
    for att in range(4):
        try:
            req = urllib.request.Request(URL, data=body, method="POST",
                                         headers={"Content-Type": "application/json; charset=utf-8"})
            r = json.load(urllib.request.urlopen(req, timeout=120))
            added += r.get("added") or 0
            requeued += r.get("requeued") or 0
            attempted += r.get("attempted") or 0
            for k, v in (r.get("status_before") or {}).items():
                dist[k] = dist.get(k, 0) + v
            print(f"  {i//CH+1:>2}배치 {len(chunk):>3}개 → 신규 {r.get('added')} "
                  f"/ requeue {r.get('requeued')} / 기존 {r.get('status_before')}", flush=True)
            break
        except Exception as e:
            print(f"  {i//CH+1:>2}배치 시도{att+1} 실패: {e}", flush=True)
            time.sleep(4 * (att + 1))
    time.sleep(1.5)

print(f"\n완료 — 신규 {added} / requeue {requeued} / 처리 {attempted}")
print("업로드 직전 풀 상태 분포:", dist)
