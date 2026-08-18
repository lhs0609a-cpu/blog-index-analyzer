"""
프로그래매틱 SEO 페이지 — 측정 worker.

큐에서 키워드를 꺼내 세 가지를 재고 캐시에 넣는다:
  1) SERP 난이도      (services.serp_difficulty)      — 1페이지 경쟁자 체력
  2) 경쟁도/상위10 지표 (keyword_analysis_service)      — C-Rank·D.I.A.·탭 비율
  3) 연관 키워드       (자동완성/검색광고)               — 내부 링크 + 큐 확장

⚠️ 이벤트루프 보호:
SERP 파싱은 1 CPU 머신에서 이벤트루프를 굶긴다. winner_keywords 가 이 방식으로
/health 를 30초까지 밀어 서비스를 멈춘 전례가 있다. 그래서
  - 키워드 사이에 반드시 yield(sleep)를 넣고
  - 한 번에 도는 개수를 batch 로 제한하며
  - 크론이 아니라 명시적 호출(관리자/스케줄러)로만 돈다.
"""
import asyncio
import logging
from typing import Any, Dict, List, Optional

from database import seo_keyword_pages_db as seo_db

logger = logging.getLogger(__name__)

# 키워드 하나를 재는 데 붙이는 상한. 이걸 넘기면 그 키워드는 건너뛴다 —
# 한 키워드가 배치 전체를 잡아먹는 것을 막는다.
#
# ⚠️ 처음엔 90초였는데 배치가 통째로 전멸했다(15개 중 15개 timeout).
# 원인은 두 가지가 겹친 것: ①네이버 검색광고 자격증명이 프로덕션에 없어
# 실패-재시도로 시간을 까먹고 있었고(21s→113s), ②정상일 때도 키워드 합계가
# 50초대라 90초는 편차를 못 견뎠다. 자격증명은 넣었고, 상한도 실측(53초)의
# 약 3배로 올린다. 15개 × 최악 150초 = 38분이라 2시간 주기 안에 든다.
PER_KEYWORD_TIMEOUT_S = 150

# 측정 사이 양보 시간. 이벤트루프가 /health 등 가벼운 요청을 처리할 틈.
YIELD_BETWEEN_S = 2.0

# 연관 키워드로 큐를 확장할 최대 깊이. 무한 확장하면 도메인 밖으로 새어나간다.
MAX_DEPTH = 2


async def _measure_one(keyword: str) -> Optional[Dict[str, Any]]:
    """키워드 하나의 페이지 데이터를 만든다. 실패하면 None."""
    from services.serp_difficulty import measure_serp_difficulty
    from services.keyword_analysis_service import keyword_analysis_service

    data: Dict[str, Any] = {"keyword": keyword}

    # 1) SERP 난이도 — 이게 실패하면 페이지의 핵심이 비므로 전체 실패로 본다.
    serp = await measure_serp_difficulty(keyword, top_n=10)
    if not serp or not serp.get("ok"):
        raise RuntimeError(f"serp_difficulty not ok: {str(serp)[:160]}")

    data["difficulty_score"] = serp.get("difficulty_score")
    data["difficulty_label"] = serp.get("difficulty_label")
    data["competitors_scanned"] = serp.get("competitors_scanned")
    data["alive_ratio"] = serp.get("alive_ratio")
    data["median_vitality"] = serp.get("median_vitality")
    data["competitors"] = serp.get("competitors") or []

    await asyncio.sleep(0)  # yield

    # 2) 경쟁도 — 실패해도 페이지는 성립한다(난이도만으로도 본문이 된다).
    #    _analyze_competition 은 pydantic 모델을 돌려주므로 dict 로 단정하면 안 된다.
    try:
        comp = await keyword_analysis_service._analyze_competition(keyword, None)
        if comp is not None:
            comp_d = comp if isinstance(comp, dict) else comp.model_dump()
            data["search_volume"] = comp_d.get("search_volume")
            top10 = comp_d.get("top10_stats") or {}
            data["top10_avg_score"] = top10.get("avg_total_score")
            data["top10_min_score"] = top10.get("min_score")
            data["top10_max_score"] = top10.get("max_score")
            data["top10_avg_c_rank"] = top10.get("avg_c_rank")
            data["top10_avg_dia"] = top10.get("avg_dia")
            data["top10_avg_posts"] = top10.get("avg_posts")
            data["tab_ratio"] = comp_d.get("tab_ratio") or {}
    except Exception as e:
        logger.warning(f"[seo_builder] competition failed for {keyword}: {e}")

    await asyncio.sleep(0)

    # 3) 카테고리·팁 — 순수 함수(네트워크 없음)라 사실상 실패하지 않는다
    try:
        from services.category_weights import (
            detect_keyword_category,
            get_category_optimization_tips,
        )

        data["category"] = detect_keyword_category(keyword)
        tips_data = get_category_optimization_tips(keyword) or {}
        data["category_label"] = tips_data.get("category") or data["category"]
        data["tips"] = tips_data.get("tips") or []
    except Exception as e:
        logger.warning(f"[seo_builder] category failed for {keyword}: {e}")

    # 4) 연관 키워드 — 내부 링크와 큐 확장 양쪽에 쓴다
    try:
        from routers.blogs import (
            get_related_keywords_from_searchad,
            get_related_keywords_from_autocomplete,
        )

        rel = await get_related_keywords_from_searchad(keyword)
        if not (rel and rel.success and rel.total_count > 0):
            rel = await get_related_keywords_from_autocomplete(keyword)
        if rel and rel.total_count > 0:
            items = []
            for k in rel.keywords[:40]:
                kw = getattr(k, "keyword", None) or (k.get("keyword") if isinstance(k, dict) else None)
                if not kw:
                    continue
                vol = getattr(k, "monthly_total_search", None)
                if vol is None and isinstance(k, dict):
                    vol = k.get("monthly_total_search")
                items.append({"keyword": kw, "monthly_total_search": vol})
            data["related"] = items
    except Exception as e:
        logger.warning(f"[seo_builder] related failed for {keyword}: {e}")

    return data


async def enrich_volumes(limit: int = 200) -> Dict[str, Any]:
    """
    대기 키워드에 월 검색량을 붙인다. 기준 미달은 'skipped' 로 내려 측정 대상에서 뺀다.

    왜 이게 측정보다 먼저인가:
    keywordstool 은 1콜(약 2초)에 5개 힌트를 받아 최대 100개 키워드+검색량을 준다.
    SERP 측정은 키워드당 53초다. 즉 **25배 싼 정보로 먼저 줄을 세우고**,
    비싼 측정은 수요가 확인된 것에만 쓴다. 이걸 안 하면 자동완성이 만들어낸
    '블로그 종류'·'블로그 효과' 같은 수요 0 짜리에 하루치 예산을 다 쓴다.

    ⚠️ 네이버는 검색량이 없는 키워드를 응답에서 아예 빼버린다. 그래서 응답에
    없는 것은 0 으로 기록해야 한다 — 안 그러면 volume_checked_at 이 NULL 로 남아
    매번 같은 키워드를 다시 조회하고 큐가 영원히 줄지 않는다.
    """
    from services.naver_ad_service import NaverAdApiClient

    seo_db.init_seo_pages_db()
    # 기준(MIN_QUEUE_VOLUME)이 올라갔다면 예전 기준으로 통과한 행을 먼저 걸러낸다.
    reclassified = seo_db.reclassify_by_volume()
    todo = seo_db.pending_without_volume(limit=limit)
    if not todo:
        return {
            "checked": 0, "kept": 0, "skipped": 0, "reclassified": reclassified,
            "message": "볼륨 미확인 키워드 없음", "stats": seo_db.stats(),
        }

    client = NaverAdApiClient()
    kept = skipped = checked = discovered = 0
    errors: List[str] = []

    # hintKeywords 는 5개까지. 네이버는 공백을 제거한 형태(relKeyword)로 돌려주므로
    # 매칭도 공백 제거 기준으로 한다.
    for i in range(0, len(todo), 5):
        chunk = todo[i : i + 5]
        try:
            vol_map = await client.get_keywords_volume_batch(chunk)
        except Exception as e:
            errors.append(f"{chunk[:2]}...: {str(e)[:100]}")
            vol_map = {}

        norm = {k.replace(" ", ""): v.get("monthly_total", 0) for k, v in (vol_map or {}).items()}
        batch_result = {kw: int(norm.get(kw.replace(" ", ""), 0)) for kw in chunk}
        r = seo_db.set_queue_volumes(batch_result)
        kept += r["kept"]
        skipped += r["skipped"]
        checked += len(chunk)

        # ★ 응답에 딸려온 나머지 연관 키워드를 그대로 큐에 넣는다.
        # keywordstool 은 힌트 5개당 최대 100개를 **검색량과 함께** 준다.
        # 지금까지 힌트 5개 값만 쓰고 95개를 버리고 있었다. 자동완성이 뽑은
        # 키워드는 실측 결과 거의 전부 월 10회 미만(네이버 '< 10' placeholder)
        # 이었던 반면, 이쪽은 네이버가 실제 검색량을 보증하는 목록이다.
        # 검색량을 이미 알고 들어가므로 재조회 없이 바로 측정 대상이 된다.
        harvest = {
            k: v.get("monthly_total", 0)
            for k, v in (vol_map or {}).items()
            if k.replace(" ", "") not in {c.replace(" ", "") for c in chunk}
        }
        if harvest:
            discovered += seo_db.enqueue_with_volume(harvest, source="keywordstool", depth=1)

        # 네이버 rate limit 여유 + 이벤트루프 양보
        await asyncio.sleep(0.35)

    return {
        "checked": checked,
        "kept": kept,
        "skipped": skipped,
        "discovered": discovered,
        "reclassified": reclassified,
        "errors": errors[:5],
        "stats": seo_db.stats(),
    }


async def build_batch(limit: int = 10, expand: bool = True) -> Dict[str, Any]:
    """
    큐에서 limit 개를 꺼내 측정하고 캐시에 넣는다.

    expand=True 면 연관 키워드를 큐에 추가해 프론티어를 넓힌다.
    깊이 MAX_DEPTH 를 넘으면 확장하지 않는다 — 자동완성은 몇 단계만 지나면
    도메인 밖(쇼핑·연예)으로 새어나간다.
    """
    seo_db.init_seo_pages_db()
    seo_db.requeue_stuck()

    # ⚠️ 선별(enrich)과 측정을 같은 배치에서 연달아 돌리면 서로 느려진다.
    # 둘 다 keywordstool 을 때리기 때문이다 — 측정의 competition 단계가
    # search_keyword_with_tabs → get_related_keywords_from_searchad 를 호출한다.
    # 선별 40콜 직후 측정을 시작하면 네이버 스로틀링에 걸려 키워드당 53초가
    # 300초까지 늘어졌다(실측). 그래서 평소 선별은 워크플로가 별도 단계로
    # 먼저 돌리고 쉬었다가 측정한다. 여기서는 측정 대상이 **아예 0** 일 때만
    # 큐가 마르지 않도록 최소한으로 채운다.
    enriched = None
    if seo_db.volume_ready_count() == 0:
        enriched = await enrich_volumes(limit=100)

    items = seo_db.take_pending(limit=limit)
    if not items:
        return {
            "taken": 0, "ok": 0, "failed": 0, "enqueued": 0,
            "enriched": enriched,
            "message": "측정 대상 없음 (검색량 기준 통과 키워드 부족)",
            "stats": seo_db.stats(),
        }

    ok = failed = enqueued = 0
    errors: List[str] = []

    for item in items:
        kw = item["keyword"]
        depth = int(item.get("depth") or 0)
        try:
            data = await asyncio.wait_for(_measure_one(kw), timeout=PER_KEYWORD_TIMEOUT_S)
            if not data:
                raise RuntimeError("no data")
            seo_db.upsert_page(data)
            seo_db.mark_queue(kw, "done")
            ok += 1

            # 확장은 **수요가 큰 키워드에서만**. 무제한 확장하면 측정 1건당
            # 연관 28개가 들어와 큐가 영원히 안 줄고(실측: 15분에 3개 측정하는
            # 동안 큐 +77), 깊이가 깊어질수록 도메인 밖으로 새어 질이 떨어진다.
            kw_vol = int(item.get("search_volume") or 0)
            if expand and depth < MAX_DEPTH and kw_vol >= seo_db.EXPAND_MIN_VOLUME:
                cand = [r["keyword"] for r in (data.get("related") or [])]
                if cand:
                    enqueued += seo_db.enqueue_keywords(
                        cand, source=f"related:{kw}", depth=depth + 1
                    )
        except asyncio.TimeoutError:
            failed += 1
            errors.append(f"{kw}: timeout>{PER_KEYWORD_TIMEOUT_S}s")
            seo_db.mark_queue(kw, "pending", "timeout")
        except Exception as e:
            failed += 1
            errors.append(f"{kw}: {str(e)[:120]}")
            seo_db.mark_queue(kw, "pending", str(e))

        # 이벤트루프 양보 — 이게 없으면 배치 도는 동안 서비스가 멈춘다
        await asyncio.sleep(YIELD_BETWEEN_S)

    return {
        "taken": len(items),
        "ok": ok,
        "failed": failed,
        "enqueued": enqueued,
        "enriched": enriched,
        "errors": errors[:10],
        "stats": seo_db.stats(),
    }
