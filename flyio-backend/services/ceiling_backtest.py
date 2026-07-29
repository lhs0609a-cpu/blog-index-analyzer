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
SCRAPE_CONCURRENCY = int(os.environ.get("BACKTEST_CONCURRENCY", "3"))  # 봇탐지·비용 보수치
SAVE_EVERY = 10            # 몇 키워드마다 원장 파일 증분 저장
_DATA_DIR = os.environ.get("DATA_DIR", "/data")

# 키워드 1건 스크래핑 상한. 이게 없으면 한 건이 영구 대기해도 batch gather 가 끝나지 않아
# **전체 run 이 통째로 멈춘다**(2026-07-27 실측: 7/24 run 이 scraped=10 에서 3일 정지).
SCRAPE_TIMEOUT = float(os.environ.get("BACKTEST_SCRAPE_TIMEOUT", "150"))

# 관측 창(順위 상한)과 스크롤 예산.
# 부재 음성(_expand_with_absence)이 음성 라벨을 공짜로 주므로 **top30 을 긁을 이유가 없다** —
# 필요한 건 "1페이지(≤10) 진입 여부"뿐. limit=30 은 playwright 30스크롤+더보기+HTTP 페이지네이션
# 을 유발해 포화된 CPU 에서 키워드당 7분+(420s 타임아웃 실측)이 됐다. 창을 10으로 좁히고
# 스크롤을 6으로 줄이면 같은 라벨 정의를 유지하면서 비용만 떨어진다.
SERP_LIMIT = int(os.environ.get("BACKTEST_SERP_LIMIT", str(RANK_CUTOFF_PAGE1)))
SERP_MAX_SCROLLS = int(os.environ.get("BACKTEST_MAX_SCROLLS", "6"))

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
        # 하트비트: state=="running" 인데 updated_at 이 오래됐으면 **죽은 run**(프로세스 재시작
        # 으로 BackgroundTask 만 사라진 상태). status/resume 이 이걸로 생존여부를 판별한다.
        doc["updated_at"] = time.time()
        doc["updated_at_str"] = time.strftime("%Y-%m-%d %H:%M:%S")
        os.makedirs(_DATA_DIR, exist_ok=True)
        tmp = _bt_path() + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False)
        os.replace(tmp, _bt_path())  # 원자적 교체(부분쓰기 중 재시작 내성)
    except Exception as e:
        logger.warning(f"[backtest] save failed: {e}")


def _stop_path() -> str:
    return os.path.join(_DATA_DIR, "_ceiling_backtest_stop")


def request_stop() -> Dict:
    """중지 요청(디스크 플래그). 러너는 키워드마다 확인하고 즉시 빠져나온다.

    러너는 worker 프로세스에 있고 API 는 app 프로세스라 태스크를 직접 cancel 할 수 없다 —
    실행 트리거와 같은 이유로 중지도 공유 볼륨을 경유한다. 수시간짜리 run 을 세울 수단이
    없으면 잘못 건 run 이 며칠간 CPU 를 먹는다(실측).
    """
    try:
        os.makedirs(_DATA_DIR, exist_ok=True)
        with open(_stop_path(), "w", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S"))
        return {"stop_requested": True}
    except Exception as e:
        return {"stop_requested": False, "error": str(e)[:200]}


def _stop_requested() -> bool:
    return os.path.exists(_stop_path())


def _clear_stop():
    try:
        os.remove(_stop_path())
    except Exception:
        pass


def _hb_path() -> str:
    return os.path.join(_DATA_DIR, "_ceiling_backtest_hb.json")


def _hb_write(scraped: int, ledger_size: int):
    """키워드 1건 처리마다 찍는 경량 하트비트(원장 저장과 독립)."""
    try:
        with open(_hb_path(), "w", encoding="utf-8") as f:
            json.dump({"ts": time.time(), "scraped": scraped,
                       "ledger_size": ledger_size,
                       "at": time.strftime("%Y-%m-%d %H:%M:%S")}, f)
    except Exception:
        pass  # 하트비트 실패는 run 을 막지 않는다


def _hb_read() -> Optional[Dict]:
    try:
        with open(_hb_path(), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


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


MAX_PAIRS = int(os.environ.get("BACKTEST_MAX_PAIRS", "3000000"))  # 부재라벨 폭발 방어


def _expand_with_absence(by_blog: Dict[str, Dict[str, Dict]],
                         kw_volume: Dict[str, int]) -> Tuple[int, int]:
    """관측 블로그별로 '전수 수집한 키워드에 없었음' = 음성 라벨을 채운다.

    **이게 없으면 채점이 공허하다**: 스크래퍼가 실제로 돌려주는 건 상위~10행이라 관측이 전부
    1페이지(양성) → base_rate≈1.0 → Brier/skill 이 무정보 상수예측과 구별되지 않는다.
    키워드를 상위 N 까지 전수 수집했다면 그 목록에 없는 블로그는 **그 키워드로 1페이지가 아님**이
    사실로 확정되므로, 음성은 추가 스크래핑 0원으로 얻어진다.

    ⚠️ 한계(리포트에 명시): 부재는 '측정했더니 밀렸다'가 아니라 '상위에 없었다'다. 니치 시드로
    같은 도메인 키워드만 모았을 때 정당하고, 무관 주제를 섞으면 '한의원이 피자 키워드에 없음'
    같은 공짜 음성이 skill 을 부풀린다. 반환값으로 (양성, 음성) 수를 세어 조성을 드러낸다.
    """
    all_kws = list(kw_volume.keys())
    pos = sum(1 for obs in by_blog.values() for o in obs.values() if o.get("rank") is not None)
    if len(by_blog) * len(all_kws) > MAX_PAIRS:
        # 방어: 블로그×키워드가 너무 크면 양성 2건 이상 블로그로 제한(정보량 큰 쪽만)
        keep = {b for b, obs in by_blog.items()
                if sum(1 for o in obs.values() if o.get("rank") is not None) >= 2}
        for b in list(by_blog):
            if b not in keep:
                del by_blog[b]
    neg = 0
    for bid, obs in by_blog.items():
        for kw in all_kws:
            if kw not in obs:
                obs[kw] = {"keyword": kw, "volume": kw_volume[kw], "rank": None}
                neg += 1
    return pos, neg


def score_ledger(ledger: List[Dict], min_obs: Optional[int] = None,
                 absence: bool = True, min_pos: int = 2) -> Dict:
    """관측 원장 → 블로그별 train/test → judge_keyword 채점 → Brier/skill/보정곡선.

    ledger: [{keyword, volume, blog_id, rank}]  (rank 는 top30 관측만; 1-based)
    min_obs: 채점 최소 관측수(기본 MIN_OBS_PER_BLOG). 낮추면 표본↑·블로그별 천장 신뢰도↓ —
             rescore 로 여러 값을 비교해 tradeoff 를 눈으로 보라(스크래핑 재실행 없음).
    """
    min_obs = MIN_OBS_PER_BLOG if min_obs is None else max(3, int(min_obs))
    from database.rank_tracker_db import RankTrackerDB  # 채점 로직 재사용

    # 블로그별 관측 모으기 (같은 블로그·키워드 중복은 최소 순위로)
    by_blog: Dict[str, Dict[str, Dict]] = defaultdict(dict)
    kw_volume: Dict[str, int] = {}
    for r in ledger:
        bid, kw = r.get("blog_id"), r.get("keyword")
        if not bid or not kw:
            continue
        kw_volume.setdefault(kw, r.get("volume", 0))
        prev = by_blog[bid].get(kw)
        if prev is None or (r.get("rank") or 999) < (prev.get("rank") or 999):
            by_blog[bid][kw] = {"keyword": kw, "volume": r.get("volume", 0), "rank": r.get("rank")}

    # 실관측(=상위 진입) 양성 수로 대상 블로그를 고른다. 부재 음성을 켜면 모든 블로그가 전
    # 키워드 관측을 갖게 돼 min_obs 가 필터로서 무의미해지므로, 이쪽이 진짜 게이트다.
    positives_by_blog = {b: sum(1 for o in obs.values() if o.get("rank") is not None)
                         for b, obs in by_blog.items()}
    dropped_min_pos = 0
    if absence and min_pos > 1:
        for b, npos in list(positives_by_blog.items()):
            if npos < min_pos:
                del by_blog[b]
                dropped_min_pos += 1

    n_pos = n_neg = 0
    if absence:
        n_pos, n_neg = _expand_with_absence(by_blog, kw_volume)

    pairs: List[Tuple[float, int]] = []          # (predicted_prob, actual_page1)
    verdict_tally: Dict[str, Dict[str, int]] = defaultdict(lambda: {"hit": 0, "miss": 0})
    blogs_scored = 0
    test_pairs_total = 0
    dropped_no_ceiling = 0

    for bid, obs in by_blog.items():
        if len(obs) < min_obs:
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

    # 관측수 분포 — "채점까지 얼마나 더 긁어야 하나"를 답하는 진단.
    # 전원 1회 관측이면 키워드를 더 늘려도 소용없고 **시드를 좁혀** 같은 블로그를 재등장시켜야 한다.
    hist: Dict[str, int] = defaultdict(int)
    for o in by_blog.values():
        n_obs = len(o)
        hist[str(n_obs) if n_obs < 6 else "6+"] += 1

    scored = RankTrackerDB._score_probabilities(pairs)
    return {
        "min_obs_used": min_obs,
        "min_pos_used": min_pos if absence else None,
        "dropped_min_pos": dropped_min_pos,
        "absence_negatives": absence,
        "labels": {"positive": n_pos, "negative_from_absence": n_neg,
                   "keywords_scraped": len(kw_volume)} if absence else None,
        "blogs_observed": len(by_blog),
        "blogs_scored": blogs_scored,
        "obs_per_blog_hist": dict(sorted(hist.items())),
        "obs_per_blog_max": max((len(o) for o in by_blog.values()), default=0),
        "dropped_min_obs": sum(1 for o in by_blog.values() if len(o) < min_obs),
        "dropped_no_ceiling": dropped_no_ceiling,
        "test_pairs": test_pairs_total,
        **scored,
        "per_verdict": {k: v for k, v in verdict_tally.items()},
        "limitations": (
            ("음성 라벨은 '수집한 키워드 상위에 없었음'(부재)에서 파생 — '측정했더니 밀렸다'가 "
             "아니므로 니치 시드일 때만 정당(무관 주제 혼입 시 공짜 음성이 skill 을 부풀림). "
             if absence else
             "부재 음성 미사용 — 스크래퍼가 상위~10행만 돌려주면 관측이 전부 양성이라 "
             "base_rate≈1.0 이 되고 Brier/skill 이 무정보 예측과 구별되지 않음. ")
            + "skill(무정보 기준선 대비 개선)로 상대 평가 권장. SERP 난이도 보정은 미적용(천장 only)."
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
        if _stop_requested():
            return
        async with sem:
            try:
                rows = await asyncio.wait_for(
                    blog_tab_serp(p["keyword"], limit=SERP_LIMIT,
                                  max_scrolls=SERP_MAX_SCROLLS),
                    timeout=SCRAPE_TIMEOUT,
                )
            except asyncio.TimeoutError:
                # 타임아웃은 '미노출'이 아니라 '측정불가' → 관측 버리고 키워드는 완료 처리
                # (재시도하면 같은 곳에서 또 막혀 run 이 전진하지 못한다).
                logger.warning(f"[backtest] timeout {p['keyword']!r} ({SCRAPE_TIMEOUT}s)")
                rows = None
        async with lock:
            if rows:  # None=스크래핑 실패(폴백) → 관측 버림(오염 방지)
                for r in rows:
                    ledger.append({"keyword": p["keyword"], "volume": p["volume"],
                                   "blog_id": r["blog_id"], "rank": r["rank"]})
            done_keys.add(p["keyword"])
            st["scraped"] = len(done_keys)
            st["ledger_size"] = len(ledger)
            # 키워드마다 하트비트(작은 파일). 원장 저장은 SAVE_EVERY 마다이므로, 이게 없으면
            # 정상 진행중인 run 이 최대 수십분간 "stalled" 로 보여 오진하게 된다(실측).
            _hb_write(len(done_keys), len(ledger))
            if len(done_keys) % SAVE_EVERY == 0:
                doc.update({"ledger": ledger, "scraped_keywords": sorted(done_keys),
                            "phase": "scrape", "state": "running"})
                _bt_save(doc)

    try:
        # 배치로 처리(전량 gather 는 메모리·레이트 부담)
        BATCH = 40
        stopped = False
        for i in range(0, len(todo), BATCH):
            if _stop_requested():
                stopped = True
                break
            await asyncio.gather(*[_scrape_one(p) for p in todo[i:i + BATCH]])
            doc.update({"ledger": ledger, "scraped_keywords": sorted(done_keys)})
            _bt_save(doc)

        if stopped:
            # 중지는 정상 종료다 — state 를 running 으로 남기면 워치독이 되살린다.
            doc.update({"ledger": ledger, "scraped_keywords": sorted(done_keys),
                        "state": "stopped", "phase": "stopped"})
            _bt_save(doc)
            st.update({"state": "stopped", "phase": "stopped"})
            _clear_stop()
            logger.warning(f"[backtest] 중지됨 scraped={len(done_keys)} ledger={len(ledger)}")
            return

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
    waiting = pending_request()  # 아직 worker 가 집어가지 않은 요청
    if doc is not None:
        summary = {k: doc.get(k) for k in
                   ("state", "phase", "planned", "target", "seeds", "score", "started_at",
                    "error", "updated_at_str")}
        summary["scraped"] = len(doc.get("scraped_keywords") or [])
        summary["ledger_size"] = len(doc.get("ledger") or [])
        # 죽은 run 을 "running" 으로 보여주면 며칠을 헛기다린다(7/24 사례) → 명시적으로 구분.
        if doc.get("state") == "running":
            stale = time.time() - _last_progress_ts(doc)
            hb = _hb_read()
            if hb:
                summary["heartbeat"] = {"at": hb.get("at"), "scraped": hb.get("scraped"),
                                        "ledger_size": hb.get("ledger_size")}
                # 키워드 단위 진행은 하트비트가 더 최신 — 저장 전 진행분을 보여준다.
                summary["scraped"] = max(summary["scraped"], hb.get("scraped") or 0)
                summary["ledger_size"] = max(summary["ledger_size"], hb.get("ledger_size") or 0)
            summary["stale_seconds"] = int(stale)
            if stale >= STALE_AFTER:
                summary["state"] = "stalled"
                summary["hint"] = ("하트비트 정지 — 다음 부팅에서 자동 resume. "
                                   "즉시 재개하려면 POST /debug/ceiling-backtest (force 없이)")
        if mem and mem.get("state") == "running":
            summary["state"] = "running"
            summary["phase"] = mem.get("phase")
            summary["scraped"] = mem.get("scraped", summary["scraped"])
            summary["ledger_size"] = mem.get("ledger_size", summary["ledger_size"])
        if waiting:
            # 이전 run 의 done/stalled 문서 위에 새 요청이 대기중일 수 있다 — 반드시 구분해서 보여준다.
            summary["pending_request"] = {
                "target": waiting.get("target"), "force": waiting.get("force"),
                "seeds": len(waiting.get("seeds") or []),
                "requested_at": waiting.get("requested_at_str"),
                "note": "worker 워치독이 60초 내 집어감(app 은 스크래핑 안 함)",
            }
        return summary
    if waiting:
        return {"state": "requested", "pending_request": {
            "target": waiting.get("target"), "seeds": len(waiting.get("seeds") or []),
            "requested_at": waiting.get("requested_at_str")}}
    return mem or {"state": "none"}


def backtest_rescore(min_obs: Optional[int] = None, dry: bool = False,
                     absence: bool = True, min_pos: int = 2) -> Dict:
    """이미 수집된 원장으로 채점만 다시(파라미터/판정식 바꿔 재평가할 때).

    ⚠️ run 진행 중에는 **절대 저장하지 않는다**: rescore 는 원장 전체를 읽어 문서를 통째로
    다시 쓰므로, 그 사이 러너가 추가한 키워드를 덮어써 날린다(lost update). app 프로세스에서
    호출되는 진단이라 러너와 다른 프로세스 = 락도 없다. 진행중이면 자동 dry 로 강등한다.
    """
    doc = _bt_load()
    if not doc or not doc.get("ledger"):
        return {"error": "수집된 원장이 없습니다. 먼저 백테스트를 실행하세요."}
    live = (doc.get("state") == "running"
            and (time.time() - float(doc.get("updated_at") or 0)) < STALE_AFTER)
    score = score_ledger(doc["ledger"], min_obs=min_obs, absence=absence, min_pos=min_pos)
    score["scored_at_scraped"] = len(doc.get("scraped_keywords") or [])
    if dry or live:
        score["saved"] = False
        score["note"] = ("진행중 run 이라 저장 생략(원장 덮어쓰기 방지) — 중간 진단값"
                         if live else "dry 요청 — 저장 생략")
        return score
    doc["score"] = score
    score["saved"] = True
    _bt_save(doc)
    return score


# ── 장시간 run 인프라 ────────────────────────────────────
# 수천 키워드 run 은 몇 시간~수십 시간이라 fly 재배포/OOM/머신재시작을 반드시 만난다.
# 그때 BackgroundTask 만 사라지고 파일은 state="running" 으로 굳어 **영구 정지**했다
# (2026-07-27 실측: 7/24 run 이 3일간 scraped=10/2000). 부팅 시 스스로 이어받게 한다.

STALE_AFTER = float(os.environ.get("BACKTEST_STALE_AFTER", "900"))  # 초


def _last_progress_ts(doc: Dict) -> float:
    """마지막 전진 시각 = max(원장 저장, 키워드 하트비트).

    원장 저장은 SAVE_EVERY(10키워드)마다라서 그것만 보면 느린 run 을 죽은 run 으로 오판한다.
    """
    hb = _hb_read() or {}
    return max(float(doc.get("updated_at") or 0), float(hb.get("ts") or 0))
WATCHDOG_EVERY = float(os.environ.get("BACKTEST_WATCHDOG_EVERY", "60"))  # 초

# 이 프로세스가 띄운 run 태스크. 워치독이 살아있는 run 위에 중복 run 을 얹지 않게 하는 가드.
_RUN_TASK: Optional["asyncio.Task"] = None


def _run_alive() -> bool:
    return _RUN_TASK is not None and not _RUN_TASK.done()


def start_backtest_task(seeds: List[str], target: int, force: bool = False) -> bool:
    """run_backtest 를 이 프로세스의 asyncio 태스크로 즉시 시작(중복이면 False).

    **BackgroundTasks 를 쓰지 않는 이유**: 워커 오프로드 경로에서 app 이 8s 후 연결을 끊으면
    Starlette 는 응답을 못 보낸 요청의 background task 를 건너뛴다 → "202 만 받고 무실행"
    (2026-07-27 실측). create_task 는 요청 수명과 무관하게 즉시 돌아 이 함정을 회피한다.
    """
    global _RUN_TASK
    if _run_alive():
        return False
    _RUN_TASK = asyncio.create_task(run_backtest(seeds, target, force))
    return True


def _req_path() -> str:
    return os.path.join(_DATA_DIR, "_ceiling_backtest_request.json")


def request_backtest(seeds: List[str], target: int, force: bool) -> Dict:
    """실행요청을 **디스크에 남긴다**(스크래핑은 worker 가 집어가 실행).

    왜 HTTP 로 worker 를 직접 못 부르나 (2026-07-27 실측): app→worker 오프로드 프록시는
    8s ReadTimeout 후 httpx 클라이언트를 닫는데, 그러면 worker 의 요청이 끊겨 **핸들러가
    아예 실행되지 않는다**(202 만 받고 무실행). 그래서 제어는 공유 볼륨(/data)으로 넘긴다:
    app 은 작은 요청파일만 쓰고(즉시·안전), worker 워치독이 claim 해서 실행한다.
    """
    doc = {"seeds": seeds, "target": target, "force": bool(force),
           "requested_at": time.time(),
           "requested_at_str": time.strftime("%Y-%m-%d %H:%M:%S"),
           "claimed_at": None}
    try:
        os.makedirs(_DATA_DIR, exist_ok=True)
        tmp = _req_path() + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False)
        os.replace(tmp, _req_path())
    except Exception as e:
        logger.warning(f"[backtest] 요청파일 기록 실패: {e}")
        return {"queued": False, "error": str(e)[:200]}
    return {"queued": True, "seeds": len(seeds), "target": target, "force": bool(force)}


def _claim_request() -> Optional[Dict]:
    """미처리 요청을 원자적으로 claim(중복 실행 방지). 없으면 None."""
    try:
        with open(_req_path(), "r", encoding="utf-8") as f:
            doc = json.load(f)
    except Exception:
        return None
    if doc.get("claimed_at"):
        return None
    doc["claimed_at"] = time.time()
    try:
        tmp = _req_path() + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False)
        os.replace(tmp, _req_path())
    except Exception as e:
        logger.warning(f"[backtest] claim 기록 실패: {e}")
        return None
    return doc


def pending_request() -> Optional[Dict]:
    """아직 실행되지 않은 요청(있으면 status 에 노출)."""
    try:
        with open(_req_path(), "r", encoding="utf-8") as f:
            doc = json.load(f)
    except Exception:
        return None
    return None if doc.get("claimed_at") else doc


def resume_if_interrupted(ignore_stale: bool = False) -> Optional[Dict]:
    """중단된 run 이 있으면 이어서 시작(없으면 None).

    판정: 디스크 state=="running" + (하트비트 STALE_AFTER 초 이상 정지 or ignore_stale).
    plan 이 없으면 harvest 부터 새로 시작한다.

    ignore_stale=True 는 **부팅 시점 전용**: 러너는 이 프로세스(worker)뿐이고 방금 떴으니
    "running" 문서는 정의상 죽은 run 이다. 하트비트를 기다리면 재배포마다 15분을 버린다.
    """
    if _run_alive():
        return None  # 이 프로세스가 이미 돌리는 중
    doc = _bt_load()
    if not doc or doc.get("state") != "running":
        return None
    age = time.time() - _last_progress_ts(doc)
    if not ignore_stale and age < STALE_AFTER:
        return None  # 하트비트가 최신 = 살아있는 run → 중복 실행 금지
    seeds = doc.get("seeds") or []
    target = int(doc.get("target") or 0)
    if not seeds or not target:
        return None
    has_plan = bool(doc.get("plan"))
    logger.warning(f"[backtest] 중단된 run 이어받기: scraped={len(doc.get('scraped_keywords') or [])}"
                   f"/{doc.get('planned')} stale={int(age)}s plan={'있음' if has_plan else '없음'}")
    if not start_backtest_task(seeds, target, force=not has_plan):
        return None
    return {"resumed": True, "seeds": len(seeds), "target": target,
            "stale_seconds": int(age), "had_plan": has_plan}


async def backtest_watchdog_loop():
    """워커 상주 루프: (1) 새 실행요청 claim, (2) 중단된 run 이어받기.

    이게 worker 쪽 유일한 실행 트리거다(HTTP 는 app 에서 끊기므로 신뢰 불가).
    요청파일은 작아서 60s 주기로 읽어도 공짜. 무거운 원장 재개 판정은 5주기(=5분)에 한 번만.
    """
    tick = 0
    while True:
        try:
            await asyncio.sleep(WATCHDOG_EVERY)
            tick += 1
            if _run_alive():
                continue
            req = _claim_request()
            if req:
                seeds, target = req.get("seeds") or [], int(req.get("target") or 0)
                if seeds and target and start_backtest_task(seeds, target, bool(req.get("force"))):
                    logger.warning(f"[backtest] 요청 claim→실행: target={target} "
                                   f"seeds={len(seeds)} force={req.get('force')}")
                continue
            if tick % 5 == 0:
                resumed = resume_if_interrupted()
                if resumed:
                    logger.warning(f"[backtest] 워치독 재개: {resumed}")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"[backtest] 워치독 오류(계속): {e}")
