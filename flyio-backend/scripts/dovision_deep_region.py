# -*- coding: utf-8 -*-
"""지역 × 학습솔루션 조합 생성 → 실검색량 측정 (있는 것만 남긴다).

조합은 '만들어낸 말'이라 존재 증명이 아니다. keywordstool 로 그 말 자체를 물어
검색량이 돌아오는 것만 채택한다. 안 돌아온 조합은 '수요 없음'으로 버린다.
(연관 목록에 떴다는 사실은 존재 증명이 아니다 — 여기선 질의어 자신의 볼륨만 본다.)
"""
import importlib.util, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dv_kt import keywordstool  # noqa: E402

OUT = os.path.join(HERE, "_dv_deep_region_vol.json")

_spec = importlib.util.spec_from_file_location(
    "seed200k", os.path.join(HERE, "dovision_seed_gen_200k.py"))
_m = importlib.util.module_from_spec(_spec)
_src = open(_spec.origin, encoding="utf-8").read()
_ns = {}
exec(_src[:_src.index("REGIONS = []")] + _src[_src.index("REGIONS = []"):
                                              _src.index("\n\n", _src.index("REGIONS = []"))], _ns)
REGIONS = _ns["REGIONS"]

SERVICES = [
    "학습클리닉", "학습센터", "학습코칭", "학습상담", "공부방법학원", "학습컨설팅",
    "기억력학원", "암기법학원", "속독학원", "집중력학원", "두뇌학원", "두뇌훈련",
    "자기주도학습학원", "학습치료", "인지치료", "난독증센터", "난독증치료",
    "느린학습자", "경계선지능", "adhd검사", "웩슬러검사", "지능검사", "인지능력검사",
    "학습능력검사", "종합심리검사", "심리검사센터", "영재교육원",
]


def main():
    combos = [r + s for r in REGIONS for s in SERVICES]
    vol = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    todo = [c for c in combos if c not in vol]
    print(f"지역 {len(REGIONS)} × 서비스 {len(SERVICES)} = 조합 {len(combos):,} "
          f"(측정할 것 {len(todo):,})", flush=True)
    t0 = time.time()
    for i in range(0, len(todo), 5):
        chunk = todo[i:i + 5]
        try:
            got = {r["kw"]: r["total"] for r in keywordstool(chunk)}
        except Exception:
            got = {}
        for c in chunk:
            vol[c] = got.get(c, 0)
        if (i // 5) % 100 == 0:
            json.dump(vol, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
            live = sum(1 for v in vol.values() if v >= 10)
            print(f"  {i:,}/{len(todo):,} 실수요 {live:,}개 {time.time()-t0:.0f}s", flush=True)
    json.dump(vol, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    live = sorted(((v, k) for k, v in vol.items() if v >= 10), reverse=True)
    print(f"\n조합 {len(vol):,} → 실검색량 10+ {len(live):,}개 / "
          f"월검색합 {sum(v for v, _ in live):,}")
    print("상위 40: " + ", ".join(f"{k}({v:,})" for v, k in live[:40]))


if __name__ == "__main__":
    main()
