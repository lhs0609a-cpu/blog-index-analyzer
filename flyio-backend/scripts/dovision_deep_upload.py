# -*- coding: utf-8 -*-
"""딥리서치 채택분을 두비전 pending 에 그대로 넣는다 (연관확장 없음).

dovision_deep_final.json → /keyword-pool/admin/insert-exact.
배치 40개인 이유: 같은 sqlite 를 크론이 계속 만져서 큰 쓰기는 'database is locked'.

⚠️ 먼저 확인할 것 (이거 없이 올리면 전부 domain_skipped 된다)
  1) dovision_deep_profile.py --apply  — relevance 게이트에 기억법·공부법·인지검사 축 열기
  2) routers/naver_ad.py 의 _DOVISION_TAXONOMY '학습솔루션' 6개 중분류 배포
  3) 계정 캡 100,000 / 현재 등록 80,495 — 남은 자리 19,505. score 순으로 상한을 건다.
"""
import json, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
URL = "https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/admin/insert-exact?user_id=1"
CID = "4403292"
CH = 40
LIMIT = int(os.environ.get("LIMIT", "19000"))
MIN_SCORE = int(os.environ.get("MIN_SCORE", "0"))

rows = json.load(open(os.path.join(HERE, "dovision_deep_final.json"), encoding="utf-8"))
rows = [r for r in rows if r["score"] >= MIN_SCORE][:LIMIT]
items = [{"keyword": r["keyword"], "monthly_total": r["monthly_total"],
          "monthly_pc": r["monthly_pc"], "monthly_mobile": r["monthly_mobile"],
          "comp_idx": r.get("comp_idx") or None} for r in rows]
print(f"업로드 대상 {len(items):,}개 / 월검색합 {sum(i['monthly_total'] for i in items):,}")
if "--apply" not in sys.argv:
    print("dry-run. 실제 반영: python dovision_deep_upload.py --apply")
    sys.exit(0)

added = requeued = attempted = 0
dist = {}
for i in range(0, len(items), CH):
    chunk = items[i:i + CH]
    body = json.dumps({"customer_id": CID, "items": chunk, "min_volume": 10,
                       "source": "b2c_deep_2026-09-16"}).encode("utf-8")
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
            if (i // CH) % 20 == 0:
                print(f"  {i//CH+1:>3}배치 누적 신규 {added:,} / requeue {requeued:,}", flush=True)
            break
        except Exception as e:
            if att == 3:
                print(f"  !! {i} 배치 실패 {type(e).__name__}", flush=True)
            time.sleep(2 * (att + 1))
print(f"\n완료 — 시도 {attempted:,} / 신규 {added:,} / requeue {requeued:,}")
print("기존 상태 분포:", dist)
