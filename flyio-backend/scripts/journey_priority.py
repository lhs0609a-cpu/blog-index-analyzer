"""
잡아야 할 키워드 — 우선순위 산출
================================

여정 맵은 **중간재**다. 원장님이 원하는 최종재는 "이 27개 쓰세요" 한 장이다.
이 스크립트가 그 한 장을 만든다.

입력: journey_p0_probe.py 가 뽑은 JSON
출력: 두 개의 목록. 하나로 합치지 않는다 — 목적이 다르기 때문이다.

    [유입용]  사람을 데려오는 키워드 — 볼륨이 크고 뚫리는 것
    [전환용]  돈이 되는 키워드    — 구매에 가깝고(3·4·5단계) 뚫리는 것

왜 두 개인가
------------
하나의 종합점수로 합치면 볼륨이 큰 1단계가 항상 이긴다. 그러면
"모공 원인 글 쓰세요" 만 나오고, 정작 예약을 만드는 `포텐자가격`·`분당여드름피부과`는
목록 밖으로 밀린다. 원장님이 물어보는 건 사실 두 가지고, 답도 두 개여야 한다.

점수
----
    유입점수 = log10(월검색량) × 뚫림계수 × 신뢰계수
    전환점수 = log10(월검색량) × 뚫림계수 × 신뢰계수 × 전환근접가중

    뚫림계수      : 광고 경쟁도(comp_idx) 기반 근사. 낮음 1.0 / 중간 0.7 / 높음 0.45
    신뢰계수      : 의도어로 확정 1.0 / 단독 대상어 추정 0.7  (bare_* 는 근거가 약하다)
    전환근접가중  : 1단계 0.2 · 2단계 0.5 · 3단계 1.6 · 4단계 1.8 · 5단계 2.0

정직한 한계 (이걸 안 적으면 화면이 거짓말을 한다)
-------------------------------------------------
- `comp_idx` 는 **광고 입찰 경쟁도**지 블로그 SEO 난이도가 아니다. 어디까지나 근사다.
  진짜 뚫림 판정은 services/serp_difficulty.py + services/exposure_ceiling.py 를 붙여야 한다.
  → --blog-id 를 주면 그 층을 붙일 자리를 만들어 뒀다(P1 에서 배선).
- 지금 우리가 이미 1페이지를 먹고 있는 키워드를 빼지 못한다. rank_checker 연결 전까지는
  "이미 하고 있는 것"이 목록에 섞인다.

사용법
------
    python scripts/journey_priority.py --map ../_journey_skin_p0.json --top 25
    python scripts/journey_priority.py --map ../_journey_headache_p0.json --stage 3,4,5
"""

import argparse
import csv
import json
import math
import sys
from pathlib import Path
from typing import Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from services.keyword_relevance import explain as relevance_explain  # noqa: E402

STAGE_NAMES = {1: "인지", 2: "탐색", 3: "비교", 4: "검증", 5: "행동", 0: "미분류"}

# 전환 근접 가중 — 구매에 가까울수록 크다.
CONVERSION_WEIGHT = {1: 0.2, 2: 0.5, 3: 1.6, 4: 1.8, 5: 2.0, 0: 0.3}

# 광고 경쟁도 → 뚫림 근사. 네이버는 낮음/중간/높음 3단계로만 준다.
COMP_FACTOR = {"낮음": 1.0, "중간": 0.7, "높음": 0.45}
COMP_FACTOR_DEFAULT = 0.7

CONFIDENCE_FACTOR_BARE = 0.7   # 의도어 없이 단독 대상어로 추정한 몫은 깎는다


# 의도 축 — 낱개 키워드 1,369개를 주면 원장님은 못 쓴다.
# "이 축을 잡으세요"가 되려면 같은 의도의 키워드를 한 덩어리로 묶어야 한다.
INTENT_AXIS = {
    "가격·비용": ["비용", "가격", "얼마", "금액", "요금", "견적", "등록비", "회원권"],
    "보험·환급": ["보험", "실비", "급여", "비급여", "환급", "청구"],
    "후기·리뷰": ["후기", "리뷰", "실후기", "체험", "경험담"],
    "부작용·리스크": ["부작용", "실패", "재발", "위험성", "통증", "붓기", "안전", "마취"],
    "잘하는곳·추천": ["잘하는", "유명한", "명의", "순위", "베스트", "추천", "믿을만"],
    "방법·해결": ["방법", "해결", "없애는", "줄이는", "고치", "낫는법", "완치", "교정", "요법"],
    "원인·증상": ["원인", "증상", "왜생기", "왜나", "초기", "전조", "진단", "구분"],
    "종류·비교": ["종류", "차이", "비교", "vs", "어떤게", "차이점"],
    "효과·기간": ["효과", "지속기간", "다운타임", "회복", "기간", "횟수", "주기", "몇번", "몇개월"],
    "제품·시술명": ["연고", "시술", "수술", "주사", "이식", "성형", "재배치", "제거"],
    "예약·방문": ["예약", "상담", "문의", "전화", "당일", "야간", "주말", "원데이", "무료체험"],
    "지역": ["__REGION__"],
    "관리·케어": ["관리", "예방", "개선", "완화", "치료", "체질"],
}
_AXIS_OF: Dict[str, str] = {}
for _axis, _toks in INTENT_AXIS.items():
    for _t in _toks:
        _AXIS_OF[_t] = _axis


def axis_of(item: Dict) -> str:
    if item.get("basis") == "region":
        return "지역"
    if str(item.get("basis", "")).startswith("bare_"):
        return "대상어 단독(의도 불명)"
    return _AXIS_OF.get(str(item.get("matched") or ""), "기타 의도어")


def score(item: Dict, business_seeds: List[str] = ()) -> Dict:
    vol = max(int(item.get("volume") or 0), 1)
    stage = int(item.get("stage") or 0)

    comp = COMP_FACTOR.get((item.get("comp_idx") or "").strip(), COMP_FACTOR_DEFAULT)
    conf = CONFIDENCE_FACTOR_BARE if str(item.get("basis", "")).startswith("bare_") else 1.0
    # log10 은 볼륨을 너무 눌러버린다 — 150 과 6,040 이 2.2 대 3.8 로 붙어서
    # 전환가중을 곱하면 볼륨 150짜리가 6,040짜리를 이겼다(실측). sqrt 로 완화.
    base = math.sqrt(vol) * comp * conf

    item = dict(item)
    item["comp_factor"] = comp

    # 우리 회사와의 연관도. 업장이 "뭘 파는지" 적은 말과 대조한다.
    # 도메인 연관도이지 구매 의도가 아니다 — 두 축을 곱해야 "우리 것이면서 살 사람"이 남는다.
    if business_seeds:
        rel, why = relevance_explain(item["keyword"], business_seeds)
        item["relevance"] = rel
        item["relevance_why"] = ",".join(why)
        rel_factor = rel / 100.0
    else:
        item["relevance"] = None
        item["relevance_why"] = ""
        rel_factor = 1.0

    item["inflow_score"] = round(base * rel_factor, 3)
    item["convert_score"] = round(base * rel_factor * CONVERSION_WEIGHT.get(stage, 0.3), 3)
    item["axis"] = axis_of(item)
    return item


def axis_summary(items: List[Dict], min_volume: int) -> List[Dict]:
    """의도 축별 집계. '어떤 덩어리를 중점적으로 잡을까'에 답하는 표."""
    agg: Dict[str, Dict] = {}
    for i in items:
        if i.get("is_sub10") or int(i.get("volume") or 0) < min_volume:
            continue
        a = agg.setdefault(i["axis"], {
            "axis": i["axis"], "count": 0, "volume": 0,
            "convert_sum": 0.0, "stages": {}, "samples": []})
        a["count"] += 1
        a["volume"] += int(i["volume"])
        a["convert_sum"] += i["convert_score"]
        st = int(i.get("stage") or 0)
        a["stages"][st] = a["stages"].get(st, 0) + 1
        a["samples"].append(i)

    out = []
    for a in agg.values():
        a["samples"] = sorted(a["samples"], key=lambda x: -x["volume"])[:3]
        a["main_stage"] = max(a["stages"].items(), key=lambda kv: kv[1])[0] if a["stages"] else 0
        a["avg_convert"] = a["convert_sum"] / max(a["count"], 1)
        out.append(a)
    return sorted(out, key=lambda x: -x["convert_sum"])


def axis_table(rows: List[Dict], total_vol: int) -> None:
    print()
    print("=" * 96)
    print(" ④ 의도 축 — 낱개가 아니라 '이 덩어리를 잡으세요'")
    print(" 같은 의도의 키워드를 묶은 것. 콘텐츠 기획은 축 단위로 해야 한다.")
    print("=" * 96)
    print(f" {'#':>3}  {'의도 축':<22} {'키워드':>6} {'월검색량계':>11} {'비중':>6}  {'대표'}")
    print("-" * 96)
    for n, r in enumerate(rows, 1):
        share = r["volume"] / total_vol * 100 if total_vol else 0
        name = r["axis"]
        pad = 22 - sum(2 if ord(c) > 0x2E80 else 1 for c in name)
        sample = ", ".join(s["keyword"] for s in r["samples"])
        print(f" {n:>3}. {name}{' ' * max(pad, 1)}{r['count']:>6,} {r['volume']:>11,} "
              f"{share:>5.1f}%  {sample[:44]}")


def region_filter(items: List[Dict], my_regions: List[str]) -> (List[Dict], int):
    """남의 동네 키워드를 버린다.

    이게 이 스크립트에서 가장 중요한 필터다. `대구여드름흉터` 월 3,690 은
    대구 병원에게만 의미가 있고, 분당 병원에겐 **0의 가치**다. 업종만으로는
    "우리가 잡아야 할 키워드"가 나오지 않는다 — 지역이 반드시 있어야 한다.
    (리스닝마인드는 전국 데이터라 이 필터를 줄 수 없다. 우리는 광고 계정에서 지역을 안다.)
    """
    if not my_regions:
        return items, 0
    mine = [r.strip() for r in my_regions if r.strip()]
    kept, dropped = [], 0
    for i in items:
        if int(i.get("stage") or 0) == 5 and i.get("basis") == "region":
            if not any(m in i["keyword"] for m in mine):
                dropped += 1
                continue
        kept.append(i)
    return kept, dropped


def pick(items: List[Dict], key: str, top: int,
         stages: List[int], min_volume: int) -> List[Dict]:
    pool = [i for i in items
            if not i.get("is_sub10")
            and int(i.get("volume") or 0) >= min_volume
            and int(i.get("stage") or 0) in stages]
    return sorted(pool, key=lambda x: -x[key])[:top]


def table(title: str, rows: List[Dict], key: str, note: str) -> None:
    print()
    print("=" * 86)
    print(f" {title}")
    print(f" {note}")
    print("=" * 86)
    print(f" {'#':>3}  {'키워드':<26} {'월검색량':>9}  {'단계':<6} {'경쟁':<5} {'근거':<10} {'점수':>6}")
    print("-" * 86)
    for n, r in enumerate(rows, 1):
        stage = STAGE_NAMES.get(int(r.get("stage") or 0), "?")
        comp = (r.get("comp_idx") or "-")
        basis = "추정" if str(r.get("basis", "")).startswith("bare_") else str(r.get("matched") or r.get("basis"))
        kw = r["keyword"]
        pad = 26 - sum(2 if ord(c) > 0x2E80 else 1 for c in kw)
        print(f" {n:>3}. {kw}{' ' * max(pad, 1)}{r['volume']:>9,}  "
              f"{stage:<6} {comp:<5} {basis[:10]:<10} {r[key]:>6.2f}")
    if not rows:
        print("  (해당 조건의 키워드 없음)")


def bucket(item: Dict, cut_hi: float, cut_mid: float) -> str:
    """중점도 3분류. 화면에는 이 라벨이 나가고 점수는 숨긴다."""
    s = item["convert_score"]
    if s >= cut_hi:
        return "최우선"
    if s >= cut_mid:
        return "우선"
    return "후순위"


def export_all(items: List[Dict], path: str) -> None:
    """전량 내보내기. top-N 은 화면용이고, 실제 납품물은 이 파일이다."""
    ranked = [i for i in items if not i.get("is_sub10")]
    ranked.sort(key=lambda x: -x["convert_score"])
    n = len(ranked)
    cut_hi = ranked[int(n * 0.10)]["convert_score"] if n else 0
    cut_mid = ranked[int(n * 0.35)]["convert_score"] if n else 0

    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["중점도", "키워드", "월검색량", "여정단계", "의도축",
                    "의도근거", "우리연관도", "연관근거", "광고경쟁도",
                    "유입점수", "전환점수", "근거강도"])
        for i in ranked:
            w.writerow([
                bucket(i, cut_hi, cut_mid), i["keyword"], i["volume"],
                f"{i.get('stage')}.{STAGE_NAMES.get(int(i.get('stage') or 0), '?')}",
                i["axis"], i.get("matched") or i.get("basis"),
                i.get("relevance") if i.get("relevance") is not None else "",
                i.get("relevance_why", ""),
                i.get("comp_idx") or "", i["inflow_score"], i["convert_score"],
                "추정" if str(i.get("basis", "")).startswith("bare_") else "확정",
            ])
        # 저볼륨(<10)은 섞지 않고 뒤에 따로 붙인다 — 합산하면 꼬리가 몸통을 이긴다
        for i in items:
            if i.get("is_sub10"):
                w.writerow(["저볼륨", i["keyword"], "<10",
                            f"{i.get('stage')}.{STAGE_NAMES.get(int(i.get('stage') or 0), '?')}",
                            i["axis"], i.get("matched") or i.get("basis"),
                            i.get("relevance") if i.get("relevance") is not None else "",
                            i.get("relevance_why", ""),
                            i.get("comp_idx") or "", "", "",
                            "추정" if str(i.get("basis", "")).startswith("bare_") else "확정"])

    hi = sum(1 for i in ranked if bucket(i, cut_hi, cut_mid) == "최우선")
    mid = sum(1 for i in ranked if bucket(i, cut_hi, cut_mid) == "우선")
    print()
    print(f" 전량 내보내기: {path}")
    print(f"   총 {len(items):,}개  ·  최우선 {hi:,} / 우선 {mid:,} / "
          f"후순위 {len(ranked) - hi - mid:,} / 저볼륨 {len(items) - len(ranked):,}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", required=True, help="journey_p0_probe.py 의 --out JSON")
    ap.add_argument("--top", type=int, default=20)
    ap.add_argument("--min-volume", type=int, default=50)
    ap.add_argument("--stage", default="1,2,3,4,5", help="전환용 목록에 포함할 단계")
    ap.add_argument("--region", default="",
                    help="우리 업장 지역(쉼표구분). 예: 분당,성남,판교 — 타지역 5단계 키워드 제거")
    ap.add_argument("--business", default="",
                    help="우리가 파는 것(쉼표구분). 예: 포텐자,모공,여드름흉터,리프팅 — 연관도 계산 기준")
    ap.add_argument("--expand-seeds", action="store_true",
                    help="업종 사전 anchor 중 입력과 겹치는 머리어를 시드로 승격(복합어만 적었을 때의 구멍 보정)")
    ap.add_argument("--min-relevance", type=int, default=0,
                    help="이 연관도 미만 제외. 하드 게이트로 쓰지 말 것(느슨함) — 0 권장")
    ap.add_argument("--export", help="전량 CSV 내보내기 경로 (화면 top-N 이 아니라 진짜 납품물)")
    ap.add_argument("--blog-id", help="(P1 예정) 내 블로그 — 뚫림·현재순위 층 연결 지점")
    args = ap.parse_args()

    data = json.loads(Path(args.map).read_text(encoding="utf-8"))
    biz = [s.strip() for s in (args.business or "").split(",") if s.strip()]

    # 업장이 파는 걸 복합어로만 적으면 점수가 안 나온다.
    # `모공축소` 만 넣으면 `모공각화증` 은 2글자 원자 `모공` 으로 5점밖에 못 받는다.
    # 업종 사전의 anchor 중 입력과 겹치는 머리어를 시드로 승격해 이 구멍을 메운다.
    if biz and args.expand_seeds:
        from data.journey_lexicon import INDUSTRY
        spec = INDUSTRY.get(data["industry"], {})
        anchors = spec.get("condition", []) + spec.get("treatment", []) + spec.get("brand", [])
        added = [a for a in anchors
                 if a not in biz and any(a in s or s in a for s in biz)]
        if added:
            print(f"시드 확장(+{len(added)}): {', '.join(added[:12])}"
                  + (" ..." if len(added) > 12 else ""))
            biz = biz + added
    items = [score(i, biz) for i in data.get("items", [])]
    if args.min_relevance > 0 and biz:
        before = len(items)
        items = [i for i in items if (i.get("relevance") or 0) >= args.min_relevance]
        print(f"연관도 {args.min_relevance}점 미만 {before - len(items):,}개 제외")
    stages = [int(s) for s in args.stage.split(",") if s.strip()]

    my_regions = [r for r in args.region.split(",") if r.strip()]
    items, dropped = region_filter(items, my_regions)

    shape = data.get("demand_shape", "problem_led")
    print(f"업종: {data['industry']}  ·  수요형태: {shape}  ·  "
          f"온도메인 {data['on_domain']:,}개  ·  단독추정 {data.get('bare_rate')}%")
    if my_regions:
        print(f"우리 지역: {', '.join(my_regions)}  ·  남의 동네 키워드 {dropped:,}개 제거")
    else:
        print("⚠ --region 미지정 — 전국 지역 키워드가 섞인다. 업장에 줄 목록이라면 반드시 지정할 것")

    table("① 유입용 — 사람을 데려오는 키워드",
          pick(items, "inflow_score", args.top, [1, 2, 3, 4, 5], args.min_volume),
          "inflow_score",
          "볼륨 × 뚫림. 블로그 방문을 늘리는 축. 당장 예약으로 이어지진 않는다.")

    table("② 전환용 — 예약을 만드는 키워드",
          pick(items, "convert_score", args.top, stages, args.min_volume),
          "convert_score",
          "구매 근접(비교·검증·행동) × 뚫림. 볼륨은 작아도 문의가 나오는 축.")

    # ③ 지역 키워드는 볼륨 랭킹에 맡기면 안 된다.
    # `분당여드름피부과` 930 은 `포텐자후기` 6,040 보다 볼륨이 6배 작지만,
    # 검색한 사람이 우리 동네에서 병원을 찾고 있다는 뜻이라 예약 전환률이 다른 축이다.
    # 볼륨 순위에 섞으면 영원히 밀린다 → 따로 뽑아 전량 보여준다.
    if my_regions:
        local = sorted(
            [i for i in items
             if int(i.get("stage") or 0) == 5
             and any(m in i["keyword"] for m in my_regions)
             and not i.get("is_sub10")],
            key=lambda x: -int(x.get("volume") or 0))
        table("③ 우리 지역 — 볼륨과 무관하게 전부 잡아야 하는 축",
              local[:args.top], "convert_score",
              "검색한 사람이 이미 우리 동네에서 찾고 있다. 볼륨 순위에 섞으면 영원히 밀린다.")

    scored_pool = [i for i in items
                   if not i.get("is_sub10") and int(i.get("volume") or 0) >= args.min_volume]
    axis_table(axis_summary(items, args.min_volume),
               sum(int(i["volume"]) for i in scored_pool))

    if args.export:
        export_all(items, args.export)

    print()
    print("-" * 86)
    print(" ※ '경쟁'은 네이버 **광고 입찰** 경쟁도다. 블로그 SEO 난이도가 아니다 — 근사치.")
    print("   진짜 뚫림 판정은 serp_difficulty + exposure_ceiling 을 붙여야 한다(P1).")
    print(" ※ '근거=추정'은 의도어 없이 단독 대상어로 배정된 것. 단계가 확정이 아니다.")
    if args.blog_id:
        print(f" ※ --blog-id {args.blog_id} — 뚫림/현재순위 층은 P1에서 배선. 지금은 미반영.")


if __name__ == "__main__":
    main()
