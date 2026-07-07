# -*- coding: utf-8 -*-
"""두비전 확장 발굴 드라이버 — 전략 1(경쟁브랜드) / 3(연령×과목) / 4(학부모의도).
각 시드셋을 15개 배치로 seed-explode(min_volume=20)에 순차 디스패치. 배치간 28s 대기(breaker 완화).
전략 2(자기재귀 reseed)는 발굴 안정 후 별도 스텝에서 top-volume 추출해 실행.
"""
import json, os, time, urllib.request

BASE_URL = "https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/seed-explode-register?user_id=1"
CID = "4403292"
HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(HERE, "dovision_expand_seeds.json"), encoding="utf-8"))

def dispatch(seeds, tag):
    CH = 15
    batches = [seeds[i:i+CH] for i in range(0, len(seeds), CH)]
    print(f"[{tag}] {len(seeds)} 시드 → {len(batches)} 배치", flush=True)
    for bi, chunk in enumerate(batches, 1):
        payload = {"seeds": chunk, "min_volume": 20, "min_score": 0,
                   "max_per_seed": 300, "customer_id": CID}
        req = urllib.request.Request(BASE_URL, data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
        try:
            urllib.request.urlopen(req, timeout=30)
            print(f"  [{tag}] batch {bi}/{len(batches)}: {chunk[0]}…{chunk[-1]}", flush=True)
        except Exception as e:
            print(f"  [{tag}] batch {bi} 실패: {e}", flush=True)
        time.sleep(28)

# 전략 1 — 경쟁 브랜드
dispatch(cfg["strategy1_competitor_brands"]["seeds"], "경쟁브랜드")

# 전략 3 — 연령·학년 × 과목 조합
s3 = cfg["strategy3_age_grade_x_subject"]
combos = [a + s for a in s3["ages"] for s in s3["subjects"]]
dispatch(combos, "연령x과목")

# 전략 4 — 학부모 의도 롱테일
dispatch(cfg["strategy4_parent_intent_longtail"]["seeds"], "학부모의도")

print("확장 발굴(1·3·4) 디스패치 완료", flush=True)
