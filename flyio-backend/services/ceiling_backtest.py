"""
노출천장 판정기 백테스트 하네스
================================

목적: "우리 판정이 실제로 정확한가?"를 **미래를 기다리지 않고 지금 대량 표본으로** 검증한다.

핵심 통찰 — 이건 크로스섹션 검증이지 미래예측이 아니다:
  "이 블로그가 이 키워드로 1페이지에 갈 수 있나?"는 **현재 SERP 사실**이다. 그래서
  키워드를 대량 스크래핑하면 (blog_id, keyword, volume, 실제순위) 정답이 즉시 쌓이고,
  블로그별로 그 관측을 train/test 로 갈라 천장을 학습→held-out 채점할 수 있다.

효율 — 키워드 중심(블로그 중심의 ~30배 저비용):
  키워드 1회 스크래핑 = 상위30위 = 라벨 최대 30개. 블로그 하나씩 도는 대신 키워드를 돌면
  같은 스크래핑 예산으로 30배 많은 (블로그,키워드) 관측을 얻는다.

파이프라인:
  1) harvest: 검색광고 연관어로 키워드 우주 수확(무료·무제한) + 볼륨대 층화
  2) scrape:  각 키워드 실제 블로그탭 스크래핑(ground truth) → 관측 원장 증분 저장
  3) score:   블로그별 관측을 train/test 분할 → train 으로 천장 → test 로 judge_keyword
              확률예측 vs 실제 1페이지 여부 → Brier / skill / CORP 보정곡선

편향 통제:
  - leakage 방지: 천장 학습에 쓴 키워드로 채점하지 않는다(블로그별 결정적 train/test 분할).
  - 선택편향 명시: 블로그는 'top30 에 든' 키워드로만 관측되므로 base_rate 가 부풀 수 있다.
    skill(=1-brier/ref_brier)은 base_rate 대비 상대지표라 이를 부분적으로 흡수한다.
    볼륨대 층화로 난이도 분포를 넓혀 일반화를 높인다. (한계는 리포트에 함께 반환)

전부 재시작 내성 + resume (fly 재배포/타임아웃에도 부분결과 유지) — clicked-census-bg 패턴.
"""

import asyncio
import hashlib
import json
import logging
import os
import time
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

from services.exposure_ceiling import (
    _fetch_volumes,
    blog_tab_serp,
    ceiling_from_observations,
    judge_keyword,
    VOLUME_FLOOR,
    RANK_CUTOFF_PAGE1,
    RANK_CUTOFF_INDEXED,
)

logger = logging.getLogger(__name__)

# ── 파라미터 ─────────────────────────────────────────────
VOLUME_BANDS: List[Tuple[int, int]] = [
    (10, 100), (100, 1000), (1000, 10000), (10000, 10 ** 12),
]
MIN_OBS_PER_BLOG = 6       # 이 미만 관측 블로그는 train/test 분할 불가 → 제외
SCRAPE_CONCURRENCY = 2     # 스크래핑 동시성(봇탐지·비용) — census 와 동일 보수치
SAVE_EVERY = 10            # 몇 키워드마다 원장 파일 증분 저장
_DATA_DIR = os.environ.get("DATA_DIR", "/data")

# 인메모리 진행상태(재시작 시 파일에서 복구)
BACKTEST_STATUS: Dict[str, Dict] = {}
_RUN_KEY = "default"       # 단일 러너(계정무관 검증)


def _bt_path() -> str:
    return os.path.join(_DATA_DIR, "_ceiling_backtest.json")


def _bt_load() -> Optional[dict]:
    try:
        with open(_bt_path(), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _bt_save(doc: dict):
    try:
        os.makedirs(_DATA_DIR, exist_ok=True)
        tmp = _bt_path() + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False)
        os.replace(tmp, _bt_path())  # 원자적 교체(부분쓰기 중 재시작 내성)
    except Exception as e:
        logger.warning(f"[backtest] save failed: {e}")


def _band_of(vol: int) -> int:
    for i, (lo, hi) in enumerate(VOLUME_BANDS):
        if lo <= vol < hi:
            return i
    return -1


async def harvest_keywords(seeds: List[str], target_n: int,
                           volume_floor: int = VOLUME_FLOOR) -> List[Dict]:
    """검색광고 연관어로 키워드 우주를 수확하고 볼륨대로 층화 샘플링.

    _fetch_volumes 는 hintKeywords 응답에 딸린 relKeyword+볼륨을 무료로 반환하므로,
    시드 몇 개로 수천 후보를 뽑을 수 있다(추가 순위조회 없음).
    """
    vols = await _fetch_volumes(seeds)
    uni = [(k, v) for k, v in vols.items() if v >= volume_floor]
    # 볼륨대별 버킷
    buckets: Dict[int, List[Tuple[str, int]]] = defaultdict(list)
    for k, v in uni:
        b = _band_of(v)
        if b >= 0:
            buckets[b].append((k, v))
    for b in buckets:
        buckets[b].sort(key=lambda x: x[1], reverse=True)
    # 층화: 밴드별 균등 배분(라운드로빈)
    per_band = max(1, target_n // max(1, len(buckets)))
    picked: List[Dict] = []
    for b, items in buckets.items():
        for k, v in items[:per_band]:
            picked.append({"keyword": k, "volume": v, "band": b})
    # 남는 슬롯은 볼륨순으로 채움
    if len(picked) < target_n:
        seen = {p["keyword"] for p in picked}
        for k, v in sorted(uni, key=lambda x: x[1], reverse=True):
            if k in seen:
                continue
            picked.append({"keyword": k, "volume": v, "band": _band_of(v)})
            seen.add(k)
            if len(picked) >= target_n:
                break
    return picked[:target_n]


def _split_side(blog_id: str, keyword: str) -> int:
    """블로그별 결정적 train(0)/test(1) 분할. 재현가능(random 미사용)."""
    h = hashlib.md5(f"{blog_id}|{keyword}".encode()).hexdigest()
    return int(h, 16) & 1


def score_ledger(ledger: List[Dict]) -> Dict:
    """관측 원장 → 블로그별 train/test → judge_keyword 채점 → Brier/skill/보정곡선.

    ledger: [{keyword, volume, blog_id, rank}]  (rank 는 top30 관측만; 1-based)
    """
    from database.rank_tracker_db import RankTrackerDB  # 채점 로직 재사용

    # 블로그별 관측 모으기 (같은 블로그·키워드 중복은 최소 순위로)
    by_blog: Dict[str, Dict[str, Dict]] = defaultdict(dict)
    for r in ledger:
        bid, kw = r.get("blog_id"), r.get("keyword")
        if not bid or not kw:
            continue
        prev = by_blog[bid].get(kw)
        if prev is None or (r.get("rank") or 999) < (prev.get("rank") or 999):
            by_blog[bid][kw] = {"keyword": kw, "volume": r.get("volume", 0), "rank": r.get("rank")}

    pairs: List[Tuple[float, int]] = []          # (predicted_prob, actual_page1)
    verdict_tally: Dict[str, Dict[str, int]] = defaultdict(lambda: {"hit": 0, "miss": 0})
    blogs_scored = 0
    test_pairs_total = 0
    dropped_no_ceiling = 0

    for bid, obs in by_blog.items():
        if len(obs) < MIN_OBS_PER_BLOG:
            continue
        train = [o for kw, o in obs.items() if _split_side(bid, kw) == 0]
        test = [o for kw, o in obs.items() if _split_side(bid, kw) == 1]
        if len(train) < 2 or len(test) < 1:
            continue
        # train 관측으로 천장 학습 (blog_tab 관측이므로 rank 그대로 사용)
        ceiling = ceiling_from_observations(train)
        if ceiling.get("ceiling_volume") is None:
            dropped_no_ceiling += 1
            continue
        blogs_scored += 1
        for o in test:
            verdict = judge_keyword(ceiling, o["volume"], serp=None)
            p = verdict.get("probability")
            actual = 1 if (o["rank"] is not None and o["rank"] <= RANK_CUTOFF_PAGE1) else 0
            if p is not None:
                pairs.append((p, actual))
                test_pairs_total += 1
            v = verdict.get("verdict")
            if v in ("likely", "contested", "unlikely"):
                # 이진 판정 정확도(하위호환): likely=1 예측, unlikely/contested=0 예측으로 단순화
                pred_pos = (v == "likely")
                verdict_tally[v]["hit" if (pred_pos == bool(actual)) else "miss"] += 1

    scored = RankTrackerDB._score_probabilities(pairs)
    return {
        "blogs_observed": len(by_blog),
        "blogs_scored": blogs_scored,
        "dropped_min_obs": sum(1 for o in by_blog.values() if len(o) < MIN_OBS_PER_BLOG),
        "dropped_no_ceiling": dropped_no_ceiling,
        "test_pairs": test_pairs_total,
        **scored,
        "per_verdict": {k: v for k, v in verdict_tally.items()},
        "limitations": (
            "블로그는 'top30 진입' 키워드로만 관측돼 base_rate 가 실제보다 높을 수 있음. "
            "skill(무정보 기준선 대비 개선)로 상대 평가 권장. SERP 난이도 보정은 미적용(천장 only)."
        ),
    }


async def run_backtest(seeds: List[str], target_keywords: int, force: bool = False):
    """백그라운드 러너: harvest → scrape(증분저장·resume) → score."""
    doc = None if force else _bt_load()
    resuming = bool(doc and doc.get("plan") and not force)

    if resuming:
        plan = doc["plan"]
        ledger = doc.get("ledger", [])
        done_keys = {r["_kw"] for r in ledger if r.get("_kw")} if ledger else set()
        # 원장 rank 관측엔 _kw 태그가 없으므로 처리완료 키워드는 별도 집합에서 관리
        done_keys = set(doc.get("scraped_keywords", []))
    else:
        st = {"state": "running", "phase": "harvest", "target": target_keywords,
              "seeds": seeds, "scraped": 0, "planned": 0, "ledger_size": 0,
              "started_at": time.strftime("%Y-%m-%d %H:%M:%S"), "error": None}
        BACKTEST_STATUS[_RUN_KEY] = st
        plan = await harvest_keywords(seeds, target_keywords)
        ledger = []
        done_keys = set()
        doc = {"plan": plan, "ledger": ledger, "scraped_keywords": [],
               "seeds": seeds, "target": target_keywords, "state": "running",
               "phase": "scrape", "planned": len(plan), "score": None,
               "started_at": st["started_at"]}
        _bt_save(doc)

    st = BACKTEST_STATUS.setdefault(_RUN_KEY, {})
    st.update({"state": "running", "phase": "scrape", "planned": len(plan),
               "scraped": len(done_keys), "ledger_size": len(ledger)})

    todo = [p for p in plan if p["keyword"] not in done_keys]
    sem = asyncio.Semaphore(SCRAPE_CONCURRENCY)
    lock = asyncio.Lock()

    async def _scrape_one(p: Dict):
        async with sem:
            rows = await blog_tab_serp(p["keyword"], limit=RANK_CUTOFF_INDEXED)
        async with lock:
            if rows:  # None=스크래핑 실패(폴백) → 관측 버림(오염 방지)
                for r in rows:
                    ledger.append({"keyword": p["keyword"], "volume": p["volume"],
                                   "blog_id": r["blog_id"], "rank": r["rank"]})
            done_keys.add(p["keyword"])
            st["scraped"] = len(done_keys)
            st["ledger_size"] = len(ledger)
            if len(done_keys) % SAVE_EVERY == 0:
                doc.update({"ledger": ledger, "scraped_keywords": sorted(done_keys),
                            "phase": "scrape", "state": "running"})
                _bt_save(doc)

    try:
        # 배치로 처리(전량 gather 는 메모리·레이트 부담)
        BATCH = 40
        for i in range(0, len(todo), BATCH):
            await asyncio.gather(*[_scrape_one(p) for p in todo[i:i + BATCH]])
            doc.update({"ledger": ledger, "scraped_keywords": sorted(done_keys)})
            _bt_save(doc)

        st["phase"] = "score"
        score = score_ledger(ledger)
        doc.update({"ledger": ledger, "scraped_keywords": sorted(done_keys),
                    "state": "done", "phase": "done", "score": score})
        _bt_save(doc)
        st.update({"state": "done", "phase": "done", "score": score})
        logger.info(f"[backtest] DONE scraped={len(done_keys)} ledger={len(ledger)} "
                    f"brier={score.get('brier')} skill={score.get('skill')} "
                    f"base_rate={score.get('base_rate')} pairs={score.get('test_pairs')}")
    except Exception as e:
        logger.error(f"[backtest] failed: {e}", exc_info=True)
        st.update({"state": "error", "error": str(e)[:300]})
        doc.update({"state": "error", "error": str(e)[:300],
                    "ledger": ledger, "scraped_keywords": sorted(done_keys)})
        _bt_save(doc)


def backtest_status() -> Dict:
    """인메모리 우선, 없으면 파일에서 복구."""
    mem = BACKTEST_STATUS.get(_RUN_KEY)
    doc = _bt_load()
    if doc is not None:
        summary = {k: doc.get(k) for k in
                   ("state", "phase", "planned", "target", "seeds", "score", "started_at", "error")}
        summary["scraped"] = len(doc.get("scraped_keywords") or [])
        summary["ledger_size"] = len(doc.get("ledger") or [])
        if mem and mem.get("state") == "running":
            summary["state"] = "running"
            summary["phase"] = mem.get("phase")
            summary["scraped"] = mem.get("scraped", summary["scraped"])
            summary["ledger_size"] = mem.get("ledger_size", summary["ledger_size"])
        return summary
    return mem or {"state": "none"}


def backtest_rescore() -> Dict:
    """이미 수집된 원장으로 채점만 다시(파라미터/판정식 바꿔 재평가할 때)."""
    doc = _bt_load()
    if not doc or not doc.get("ledger"):
        return {"error": "수집된 원장이 없습니다. 먼저 백테스트를 실행하세요."}
    score = score_ledger(doc["ledger"])
    doc["score"] = score
    _bt_save(doc)
    return score
