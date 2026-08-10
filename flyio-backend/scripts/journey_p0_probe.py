"""
검색 여정 맵 — P0 검증 프로브 (오프라인 스크립트)
=================================================

목적: 여정 사전이 실제 네이버 키워드에 대해 말이 되는 그림을 그리는지 **눈으로 확인**한다.
      신규 API 없음. 배포 없음. DB 쓰기 없음. 여기서 그림이 안 나오면 P1 로 가지 않는다.

판정 기준 (docs/SEARCH_JOURNEY_MAP_SPEC.md §9)
    ① 검색량 피라미드가 나오는가 (1단계가 넓고 아래로 갈수록 좁아지는가)
    ② 각 단계의 대표 키워드가 사람 눈에 그 단계로 읽히는가
    ③ 미분류 비율 ≤ 30%

사용법
------
    # 라이브 (로컬 .env 의 네이버 광고 API 직결, 콜당 1,200행)
    python scripts/journey_p0_probe.py --industry 미용피부과 --seeds 12

    # 오프라인 (키워드 덤프 파일로 재현 — Fly 볼륨의 pool 을 덤프해 온 경우)
    python scripts/journey_p0_probe.py --industry 두통한의원 --from-file dump.csv

    # 결과 JSON 저장
    python scripts/journey_p0_probe.py --industry 미용피부과 --out _journey_skin.json

주의
----
- 검색량 "< 10" 은 네이버 플레이스홀더다. 그대로 합산하면 꼬리가 몸통을 이긴다.
  이 스크립트는 sub10 으로 분리 집계하고 볼륨은 2로 감가한다 (SPEC §3.3).
- keywordstool 은 hintKeywords 공백 포함 시 11001 로 거부한다.
"""

import argparse
import asyncio
import base64
import csv
import hashlib
import hmac
import json
import os
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data.journey_lexicon import (  # noqa: E402
    INDUSTRY, LEXICON_VERSION, STAGE_DESC, STAGE_NAMES,
    audit_lexicon, classify_stage, is_on_domain, make_adhoc_spec,
)

# 무사전 모드에서 쓰는 즉석 사전. 전역으로 두는 이유는 collect/build 양쪽이 봐야 해서다.
_SPEC: Optional[Dict] = None

BASE_URL = "https://api.searchad.naver.com"
SUB10_VALUE = 2          # "< 10" 을 볼륨 합산에 넣을 때의 감가값
# 네이버 keywordstool 은 초당 호출에 매우 인색하다. P0 실측에서 동시 3 + 0.35s 는
# 시드 10개 중 5개가 429 로 통째 유실됐다. 직렬 + 넉넉한 간격 + 429 재시도로 간다.
CONCURRENCY = 1
PAUSE_S = 1.2
RETRY_429 = 3
RETRY_BACKOFF_S = 5.0


# ---------------------------------------------------------------------------
# .env 직결 keywordstool 클라이언트 (앱 import 체인을 타지 않는 최소 구현)
# ---------------------------------------------------------------------------
def _load_env() -> Dict[str, str]:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    out: Dict[str, str] = {}
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("NAVER_AD_CUSTOMER_ID", "NAVER_AD_API_KEY", "NAVER_AD_SECRET_KEY"):
        if os.environ.get(k):
            out[k] = os.environ[k]
    missing = [k for k in ("NAVER_AD_CUSTOMER_ID", "NAVER_AD_API_KEY", "NAVER_AD_SECRET_KEY")
               if not out.get(k)]
    if missing:
        raise SystemExit(f"[FATAL] .env 에 {', '.join(missing)} 가 없습니다. "
                         f"--from-file 로 오프라인 실행하거나 자격증명을 채우세요.")
    return out


def _headers(env: Dict[str, str], method: str, uri: str) -> Dict[str, str]:
    ts = str(int(time.time() * 1000))
    msg = f"{ts}.{method}.{uri}"          # 서명은 path 만. query string 제외.
    sig = base64.b64encode(
        hmac.new(env["NAVER_AD_SECRET_KEY"].encode(), msg.encode(), hashlib.sha256).digest()
    ).decode()
    return {
        "X-Timestamp": ts,
        "X-API-KEY": env["NAVER_AD_API_KEY"],
        "X-Customer": env["NAVER_AD_CUSTOMER_ID"],
        "X-Signature": sig,
    }


def _parse_vol(raw) -> Tuple[int, bool]:
    """네이버 검색량 파싱. Returns (volume, is_sub10).
    '< 10' / '<10' 은 플레이스홀더 — 실수요 아님."""
    if raw is None:
        return 0, False
    if isinstance(raw, (int, float)):
        n = int(raw)
        return (SUB10_VALUE, True) if n <= 10 else (n, False)
    s = str(raw).strip()
    if s.startswith("<"):
        return SUB10_VALUE, True
    try:
        n = int(s.replace(",", ""))
    except ValueError:
        return 0, False
    return (SUB10_VALUE, True) if n <= 10 else (n, False)


async def fetch_related(client: httpx.AsyncClient, env: Dict[str, str],
                        seed: str) -> List[Dict]:
    uri = "/keywordstool"
    params = {"hintKeywords": seed.replace(" ", ""), "showDetail": "1"}
    for attempt in range(RETRY_429 + 1):
        try:
            r = await client.get(BASE_URL + uri, params=params,
                                 headers=_headers(env, "GET", uri), timeout=20.0)
            if r.status_code == 429:
                if attempt < RETRY_429:
                    wait = RETRY_BACKOFF_S * (attempt + 1)
                    print(f"    · {seed}: 429 — {wait:.0f}s 대기 후 재시도")
                    await asyncio.sleep(wait)
                    continue
                print(f"    ! {seed}: 429 재시도 소진 — 시드 유실")
                return []
            if r.status_code != 200:
                print(f"    ! {seed}: HTTP {r.status_code} {r.text[:120]}")
                return []
            return r.json().get("keywordList", []) or []
        except Exception as e:
            print(f"    ! {seed}: {type(e).__name__} {e}")
            return []
    return []


async def collect_live(industry: str, seed_limit: int) -> Dict[str, Dict]:
    env = _load_env()
    spec = _SPEC or INDUSTRY[industry]
    seeds = (spec.get("condition", []) + spec.get("treatment", []))[:seed_limit]
    print(f"[1/4] keywordstool 수집 — 시드 {len(seeds)}개")

    corpus: Dict[str, Dict] = {}
    sem = asyncio.Semaphore(CONCURRENCY)

    async with httpx.AsyncClient(limits=httpx.Limits(max_connections=CONCURRENCY)) as client:
        async def one(seed: str):
            async with sem:
                rows = await fetch_related(client, env, seed)
                await asyncio.sleep(PAUSE_S)
            for row in rows:
                kw = (row.get("relKeyword") or "").strip()
                if not kw:
                    continue
                pc, pc_s = _parse_vol(row.get("monthlyPcQcCnt"))
                mo, mo_s = _parse_vol(row.get("monthlyMobileQcCnt"))
                corpus[kw] = {
                    "keyword": kw,
                    "volume": pc + mo,
                    "is_sub10": pc_s and mo_s,
                    "comp_idx": row.get("compIdx"),
                    "seed": seed,
                }
            print(f"    {seed}: +{len(rows)}행 (누적 {len(corpus)})")

        await asyncio.gather(*(one(s) for s in seeds))

    # 원본 캐시 — 사전을 고쳐가며 재실행할 때 API 를 다시 때리지 않기 위함.
    cache = Path(__file__).resolve().parent.parent / f"_journey_raw_{industry}.csv"
    with open(cache, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["keyword", "volume", "comp_idx"])
        for it in corpus.values():
            w.writerow([it["keyword"], "<10" if it["is_sub10"] else it["volume"],
                        it.get("comp_idx") or ""])
    print(f"    원본 캐시 저장: {cache.name}  (재실행은 --from-file 로)")
    return corpus


def collect_file(path: str) -> Dict[str, Dict]:
    """오프라인 입력. `keyword` 또는 `keyword,volume` 형식(헤더 유무 무관)."""
    print(f"[1/4] 파일 로드 — {path}")
    corpus: Dict[str, Dict] = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.reader(f):
            if not row:
                continue
            kw = row[0].strip()
            if not kw or kw.lower() in ("keyword", "키워드"):
                continue
            vol, sub10 = _parse_vol(row[1]) if len(row) > 1 else (0, False)
            corpus[kw] = {"keyword": kw, "volume": vol, "is_sub10": sub10,
                          "comp_idx": (row[2].strip() or None) if len(row) > 2 else None,
                          "seed": "file"}
    return corpus


# ---------------------------------------------------------------------------
# 집계
# ---------------------------------------------------------------------------
def build_map(corpus: Dict[str, Dict], industry: str) -> Dict:
    print(f"[2/4] 온도메인 게이트 — 원본 {len(corpus)}개")
    on_domain, dropped = [], defaultdict(int)
    for item in corpus.values():
        ok, reason = is_on_domain(item["keyword"], industry, _SPEC)
        if ok:
            item["anchor"] = reason
            on_domain.append(item)
        else:
            dropped[reason.split(":")[0]] += 1
    print(f"    통과 {len(on_domain)} / 제외 {sum(dropped.values())} "
          f"(trap {dropped.get('trap', 0)}, anchor없음 {dropped.get('no_anchor', 0)})")

    print("[3/4] 단계 배정")
    stages: Dict[int, List[Dict]] = defaultdict(list)
    for item in on_domain:
        res = classify_stage(item["keyword"], industry, _SPEC)
        item.update(stage=res["stage"], confidence=res["confidence"],
                    matched=res["matched"], basis=res["basis"])
        stages[res["stage"]].append(item)

    total_vol = sum(i["volume"] for i in on_domain if not i["is_sub10"])
    summary = []
    for s in (1, 2, 3, 4, 5):
        items = stages.get(s, [])
        real = [i for i in items if not i["is_sub10"]]
        vol = sum(i["volume"] for i in real)
        summary.append({
            "stage": s,
            "name": STAGE_NAMES[s],
            "desc": STAGE_DESC[s],
            "keyword_count": len(items),
            "sub10_count": len(items) - len(real),
            "volume": vol,
            "volume_share": round(vol / total_vol * 100, 1) if total_vol else 0.0,
            "top": [i["keyword"] for i in sorted(real, key=lambda x: -x["volume"])[:8]],
        })

    unclassified = stages.get(0, [])
    unclassified_rate = len(unclassified) / len(on_domain) * 100 if on_domain else 0.0

    # 정직한 품질 지표: 의도어를 실제로 맞춘 비율.
    # 미분류율만 보면 안 된다 — 단독 대상어 fallback(bare_*)이 전부 삼켜서 0% 가 나온다.
    bare = [i for i in on_domain if i["basis"].startswith("bare_")]
    bare_rate = len(bare) / len(on_domain) * 100 if on_domain else 0.0

    return {
        "industry": industry,
        "lexicon_version": LEXICON_VERSION,
        "corpus_size": len(corpus),
        "on_domain": len(on_domain),
        "dropped": dict(dropped),
        "total_volume": total_vol,
        "stages": summary,
        "unclassified_count": len(unclassified),
        "unclassified_rate": round(unclassified_rate, 1),
        "unclassified_sample": [i["keyword"] for i in
                                sorted(unclassified, key=lambda x: -x["volume"])[:25]],
        "bare_count": len(bare),
        "bare_rate": round(bare_rate, 1),
        "bare_sample": [i["keyword"] for i in sorted(bare, key=lambda x: -x["volume"])[:25]],
        "demand_shape": (_SPEC or INDUSTRY[industry]).get("demand_shape", "problem_led"),
        "warnings": check_pyramid(summary, unclassified_rate, bare_rate,
                                  (_SPEC or INDUSTRY[industry]).get("demand_shape", "problem_led")),
        "_items": on_domain,
    }


def check_pyramid(summary: List[Dict], unclassified_rate: float,
                  bare_rate: float, demand_shape: str = "problem_led") -> List[str]:
    """사전의 자가 검산. 위반해도 자동 보정하지 않는다 — 숨기면 틀린 사전이 살아남는다.

    기대 형태는 업종이 선언한다(`demand_shape`).
      problem_led  : 아파서 검색이 시작 → 1 ≥ 2 ≥ 3 ≥ 4
      solution_led : 시술명에서 검색이 시작 → 2 ≥ 1, 2 ≥ 3 ≥ 4  (미용·선택시술)
    선언과 실측이 어긋날 때만 경고한다. 무엇이 정상인지를 코드가 아니라 사전이 정한다.
    """
    warns: List[str] = []
    shares = {s["stage"]: s["volume_share"] for s in summary}

    # demand_shape 는 사람이 선언하면 틀린다.
    # (실측: 필라테스를 solution_led 로 선언했으나 1단계 55.3% > 2단계 39.4% 로 반증됐다)
    # 실측으로 판정하고, 선언과 다르면 선언을 고치라고 알린다.
    observed = "problem_led" if shares.get(1, 0) >= shares.get(2, 0) else "solution_led"
    if demand_shape and observed != demand_shape:
        warns.append(
            f"수요형태 선언 불일치: 사전은 '{demand_shape}' 인데 실측은 '{observed}' "
            f"(1단계 {shares.get(1, 0)}% vs 2단계 {shares.get(2, 0)}%) — 사전의 선언을 고칠 것")

    # 판정은 실측 형태를 기준으로 한다. 나머지 단조 감소만 본다.
    expected = ((1, 2), (2, 3), (3, 4)) if observed == "problem_led" else ((2, 1), (2, 3), (3, 4))
    for a, b in expected:
        if shares.get(a, 0) < shares.get(b, 0):
            warns.append(
                f"피라미드 위반({demand_shape}): {a}단계({STAGE_NAMES[a]}) {shares[a]}% "
                f"< {b}단계({STAGE_NAMES[b]}) {shares[b]}% — 사전 오배정 또는 shape 선언 오류")
    for s in summary:
        if s["keyword_count"] == 0:
            warns.append(
                f"{s['stage']}단계({s['name']}) 키워드 0개 — 의도어 결손이거나 "
                f"실제 수요 없음. SERP 검증으로 가려야 함")
    if unclassified_rate > 30:
        warns.append(f"미분류 {unclassified_rate:.1f}% > 30% — 판정 기준 ③ 불합격")
    if bare_rate > 40:
        warns.append(
            f"단독 대상어 fallback {bare_rate:.1f}% > 40% — 의도어 사전이 얇다. "
            f"이 키워드들은 단계가 '추정'일 뿐 근거가 없다")
    return warns


def render(m: Dict) -> None:
    spec = _SPEC or INDUSTRY[m["industry"]]
    bar_unit = max((s["volume_share"] for s in m["stages"]), default=1) or 1

    print()
    print("=" * 78)
    print(f" 검색 여정 맵 — {spec['label']}   (사전 {m['lexicon_version']})")
    print("=" * 78)
    print(f" 수집 {m['corpus_size']:,} → 온도메인 {m['on_domain']:,} "
          f"(제외 {sum(m['dropped'].values()):,})   실검색량 합 {m['total_volume']:,}")
    print("-" * 78)

    for s in m["stages"]:
        bar = "█" * max(1, int(s["volume_share"] / bar_unit * 24)) if s["volume_share"] else ""
        print(f" {s['stage']}. {s['name']:<4} {s['volume_share']:>5.1f}%  "
              f"키워드 {s['keyword_count']:>6,}개 (저볼륨 {s['sub10_count']:,})  {bar}")
        print(f"    {s['desc']}")
        if s["top"]:
            print(f"    대표: {', '.join(s['top'][:6])}")
        print()

    print("-" * 78)
    print(f" 미분류 {m['unclassified_count']:,}개 ({m['unclassified_rate']}%)")
    if m["unclassified_sample"]:
        print(f"    표본: {', '.join(m['unclassified_sample'][:12])}")
    print(f" 단독 대상어 추정 {m['bare_count']:,}개 ({m['bare_rate']}%) "
          f"— 의도어 근거 없이 배정된 몫")
    if m["bare_sample"]:
        print(f"    표본: {', '.join(m['bare_sample'][:12])}")

    print()
    if m["warnings"]:
        print(" ⚠ 경고")
        for w in m["warnings"]:
            print(f"    - {w}")
    else:
        print(" ✓ 피라미드 정상 · 결손 단계 없음 · 미분류 30% 이하")

    # 병목 진단 — 실제 화면에 나갈 한 문장의 원형
    real = [s for s in m["stages"] if s["keyword_count"] > 0]
    if real:
        weak = min(real, key=lambda s: s["keyword_count"] / max(s["volume_share"], 0.1))
        print(f"\n ▶ 병목 후보: {weak['stage']}단계 {weak['name']} — "
              f"검색량 {weak['volume_share']}% 인데 키워드는 {weak['keyword_count']:,}개뿐")
    print("=" * 78)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--industry", default="미용피부과",
                    help="사전에 있는 업종명. 없으면 --business 로 무사전 모드")
    ap.add_argument("--business", default="",
                    help="무사전 모드 — 업장이 파는 것(쉼표구분). 사전이 없는 업종을 이걸로 돌린다")
    ap.add_argument("--seeds", type=int, default=12, help="라이브 수집 시드 개수")
    ap.add_argument("--from-file", dest="from_file", help="오프라인 입력 CSV")
    ap.add_argument("--out", help="결과 JSON 저장 경로")
    args = ap.parse_args()

    global _SPEC
    if args.business:
        seeds = [x.strip() for x in args.business.split(",") if x.strip()]
        _SPEC = make_adhoc_spec(seeds)
        print(f"[0/4] 무사전 모드 — 업장 시드 {len(seeds)}개: {', '.join(seeds)}")
        print("      손으로 만든 사전보다 반드시 나쁘다. 얼마나 나쁜지를 재는 게 목적이다.")
        problems = []
    elif args.industry not in INDUSTRY:
        raise SystemExit(f"[FATAL] 사전에 없는 업종 '{args.industry}'. --business 로 무사전 모드를 쓰세요.")
    else:
        problems = audit_lexicon(args.industry)
    if problems:
        print("[0/4] 사전 위생 점검 — 문제 발견")
        for p in problems:
            print(f"    - {p}")
    else:
        print("[0/4] 사전 위생 점검 통과")

    corpus = (collect_file(args.from_file) if args.from_file
              else asyncio.run(collect_live(args.industry, args.seeds)))
    if not corpus:
        raise SystemExit("[FATAL] 수집된 키워드가 0개입니다.")

    m = build_map(corpus, args.industry)
    print("[4/4] 렌더")
    render(m)

    if args.out:
        payload = {k: v for k, v in m.items() if k != "_items"}
        payload["items"] = m["_items"]
        Path(args.out).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n저장: {args.out}")


if __name__ == "__main__":
    main()
