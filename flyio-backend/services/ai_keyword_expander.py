"""
AI 키워드 자동 확장 서비스 (관리자 전용)

씨앗 키워드 → 네이버 /keywordstool 연관검색어로 BFS 확장 → 검색량 필터 → DB 저장.
기존 volume_filter_jobs / volume_filter_results 테이블을 재사용해서
필터링 UI 및 광고 등록 플로우에서 그대로 쓸 수 있게 한다.
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Set

from database.naver_ad_db import (
    add_volume_filter_results,
    get_volume_filter_job,
    update_volume_filter_job,
)
from services.naver_ad_service import NaverAdApiClient

logger = logging.getLogger(__name__)

API_DELAY = 0.35  # 네이버 /keywordstool rate limit
DB_FLUSH_BATCH = 200
CONTROL_CHECK_EVERY = 10  # API 호출 10회마다 취소 체크


@dataclass
class AiExpandConfig:
    job_id: int
    user_id: int
    seeds: List[str]
    min_volume: int = 5
    max_total_kept: int = 10000     # 최종 저장할 최대 키워드 수
    max_api_calls: int = 2000       # 네이버 API 총 호출 상한 (비용 제어)
    max_depth: int = 3              # BFS 깊이 (0: 씨앗만, 1: 씨앗의 연관어까지 …)
    top_n_per_level: int = 50       # 각 레벨에서 다음 확장 대상으로 선택할 상위 개수
    # 드리프트 방지
    core_terms: Optional[List[str]] = None  # 이 중 하나라도 포함된 키워드만 채택 (None이면 씨앗에서 자동 추출)
    blacklist: Optional[List[str]] = None   # 이 중 하나라도 포함되면 제외


def _derive_core_terms(seeds: List[str]) -> List[str]:
    """씨앗에서 의미 토큰 추출. 공백 분리 + 2자 이상만, 중복 제거."""
    tokens: Set[str] = set()
    for s in seeds:
        tokens.add(s.strip())
        for w in s.split():
            w = w.strip()
            if len(w) >= 2:
                tokens.add(w)
    return [t for t in tokens if t]


def _matches_any(keyword: str, terms: List[str]) -> bool:
    """keyword에 terms 중 하나라도 포함되면 True (대소문자 무시, 공백 무시)."""
    k = keyword.replace(" ", "").lower()
    for t in terms:
        if t and t.replace(" ", "").lower() in k:
            return True
    return False


def _to_int(v) -> int:
    if v is None:
        return 0
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v).replace(",", "").strip()
    if s in ("< 10", "<10"):
        return 5
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return 0


class AiKeywordExpander:
    def __init__(self, api_client: NaverAdApiClient):
        self.api = api_client

    async def run(self, config: AiExpandConfig) -> dict:
        job_id = config.job_id
        seeds = [s.strip() for s in config.seeds if s and s.strip()]
        if not seeds:
            update_volume_filter_job(
                job_id, status="failed",
                error_message="씨앗 키워드 없음",
                completed_at=datetime.now().isoformat(),
                current_step="씨앗 없음",
            )
            return {"success": False, "error": "no seeds"}

        # 드리프트 방지용 앵커 — 씨앗은 항상 앵커에 포함 (직관 일치)
        user_core = [t.strip() for t in (config.core_terms or []) if t and t.strip()]
        seed_core = _derive_core_terms(seeds)
        # 중복 제거 + 순서 유지
        merged: List[str] = []
        seen_core: Set[str] = set()
        for t in user_core + seed_core:
            key = t.replace(" ", "").lower()
            if key and key not in seen_core:
                seen_core.add(key)
                merged.append(t)
        core_terms = merged
        blacklist = [t.strip() for t in (config.blacklist or []) if t and t.strip()]

        logger.info(
            f"[AiExpand {job_id}] 시작: seeds={len(seeds)}개, "
            f"min_volume={config.min_volume}, "
            f"max_total={config.max_total_kept}, max_api={config.max_api_calls}, "
            f"core_terms={core_terms[:5]}{'...' if len(core_terms) > 5 else ''}, "
            f"blacklist={blacklist}"
        )

        update_volume_filter_job(
            job_id, status="running",
            started_at=datetime.now().isoformat(),
            should_pause=0, should_cancel=0,
            current_step=f"AI 확장 시작 (씨앗 {len(seeds)}개)",
        )

        seen_expanded: Set[str] = set()   # 이미 확장한 키워드 (BFS 중복 방지)
        seen_kept: Set[str] = set()       # 이미 저장한 결과 키워드
        kept_count = 0
        api_calls = 0
        pending_results: List[dict] = []

        # BFS: [(keyword, depth)]
        queue: List[tuple] = [(s, 0) for s in seeds]
        level_buffer: List[dict] = []  # 이번 레벨 결과 (top_n 선별용)
        current_depth = 0

        try:
            while queue and api_calls < config.max_api_calls and kept_count < config.max_total_kept:
                kw, depth = queue.pop(0)
                norm = kw.strip()
                if not norm or norm in seen_expanded:
                    continue
                seen_expanded.add(norm)

                # 레벨 전환 시: 이번 레벨 상위 top_n을 다음 레벨 확장 대상으로
                if depth > current_depth:
                    if level_buffer and current_depth < config.max_depth:
                        level_buffer.sort(key=lambda x: x["monthly_total"], reverse=True)
                        for item in level_buffer[:config.top_n_per_level]:
                            if item["keyword"] not in seen_expanded:
                                queue.append((item["keyword"], current_depth + 1))
                    level_buffer = []
                    current_depth = depth

                # 취소 체크
                if api_calls % CONTROL_CHECK_EVERY == 0:
                    cur = get_volume_filter_job(job_id)
                    if cur and cur.get("should_cancel"):
                        if pending_results:
                            add_volume_filter_results(job_id, pending_results)
                            pending_results = []
                        update_volume_filter_job(
                            job_id, status="cancelled",
                            processed_count=api_calls,
                            passed_count=kept_count,
                            completed_at=datetime.now().isoformat(),
                            current_step=f"취소됨: API {api_calls}회, {kept_count}개 확보",
                        )
                        return {"success": False, "cancelled": True,
                                "api_calls": api_calls, "kept": kept_count}

                # 연관 검색어 조회
                try:
                    resp = await self.api.get_related_keywords(norm, show_detail=True)
                except Exception as e:
                    logger.warning(f"[AiExpand {job_id}] API 실패 '{norm}': {e}")
                    api_calls += 1
                    await asyncio.sleep(API_DELAY)
                    continue

                api_calls += 1
                items = resp.get("keywordList", []) if isinstance(resp, dict) else []

                for it in items:
                    rel = (it.get("relKeyword") or "").strip()
                    if not rel or rel in seen_kept:
                        continue
                    # 드리프트 방지: core_terms 중 하나라도 포함해야 함
                    if not _matches_any(rel, core_terms):
                        continue
                    # 블랙리스트: 포함되면 즉시 컷
                    if blacklist and _matches_any(rel, blacklist):
                        continue
                    pc = _to_int(it.get("monthlyPcQcCnt"))
                    mo = _to_int(it.get("monthlyMobileQcCnt"))
                    total = pc + mo
                    if total < config.min_volume:
                        continue

                    seen_kept.add(rel)
                    record = {
                        "keyword": rel,
                        "monthly_pc": pc,
                        "monthly_mobile": mo,
                        "monthly_total": total,
                        "comp_idx": it.get("compIdx", "") or "",
                    }
                    pending_results.append(record)
                    level_buffer.append(record)
                    kept_count += 1

                    if kept_count >= config.max_total_kept:
                        break

                # DB flush
                if len(pending_results) >= DB_FLUSH_BATCH:
                    add_volume_filter_results(job_id, pending_results)
                    pending_results = []

                # 진행률 업데이트
                pct = min(99, int(api_calls / config.max_api_calls * 100))
                update_volume_filter_job(
                    job_id,
                    processed_count=api_calls,
                    passed_count=kept_count,
                    current_step=(
                        f"AI 확장 중 [{pct}%] depth {current_depth}/{config.max_depth} "
                        f"· API {api_calls}/{config.max_api_calls}회 "
                        f"· {kept_count}개 확보"
                    ),
                )

                await asyncio.sleep(API_DELAY)

            # 마지막 flush
            if pending_results:
                add_volume_filter_results(job_id, pending_results)

            update_volume_filter_job(
                job_id, status="completed",
                processed_count=api_calls,
                passed_count=kept_count,
                completed_at=datetime.now().isoformat(),
                current_step=(
                    f"완료: 씨앗 {len(seeds)}개 → {kept_count}개 키워드 확보 "
                    f"(API {api_calls}회, 검색량 ≥ {config.min_volume})"
                ),
            )
            logger.info(f"[AiExpand {job_id}] 완료: {kept_count}개 (api {api_calls}회)")
            return {"success": True, "kept": kept_count, "api_calls": api_calls}

        except Exception as e:
            logger.exception(f"[AiExpand {job_id}] 치명적 오류")
            if pending_results:
                try:
                    add_volume_filter_results(job_id, pending_results)
                except Exception:
                    pass
            update_volume_filter_job(
                job_id, status="failed",
                error_message=str(e)[:1000],
                completed_at=datetime.now().isoformat(),
                current_step=f"오류 중단: {str(e)[:200]}",
            )
            return {"success": False, "error": str(e)}
