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
# 실시간 캠페인 등록 관련
MAX_AD_GROUPS_PER_CAMPAIGN = 1000   # 네이버 제한
MAX_KEYWORDS_PER_AD_GROUP = 1000    # 네이버 제한
MAX_KEYWORDS_PER_POST = 100         # /ncc/keywords 한 번 호출 최대
REGISTER_API_DELAY = 0.5            # 광고 등록 API rate limit


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
    # 실시간 캠페인 등록 (수집과 동시에 네이버에 등록)
    stream_register: bool = False
    campaign_prefix: str = ""
    bid: int = 100
    daily_budget: int = 10000
    campaign_tp: str = "WEB_SITE"
    keywords_per_ad_group: int = 1000   # 광고그룹당 키워드 수 (네이버 최대 1000)
    stream_batch_size: int = 10         # 몇 개 찰 때마다 등록할지 (작을수록 실시간성 up, 속도 down)


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

    async def _ensure_capacity(self, state: dict, config: AiExpandConfig) -> bool:
        """현재 광고그룹에 여유가 없으면 새 그룹 (필요시 새 캠페인) 생성.
        성공하면 True, 실패하면 False.
        """
        # 현재 그룹에 아직 여유 있음
        if (state["current_ad_group_id"]
                and state["keywords_in_current_group"] < config.keywords_per_ad_group):
            return True

        # 새 캠페인이 필요한가?
        need_new_campaign = (
            not state["current_campaign_id"]
            or state["ad_groups_in_current_campaign"] >= MAX_AD_GROUPS_PER_CAMPAIGN
        )
        if need_new_campaign:
            state["campaigns_used"] += 1
            cname = f"{config.campaign_prefix}_{state['campaigns_used']:03d}"
            try:
                camp = await self.api.create_campaign(
                    name=cname,
                    daily_budget=config.daily_budget,
                    campaign_tp=config.campaign_tp,
                )
                state["current_campaign_id"] = camp.get("nccCampaignId")
                state["ad_groups_in_current_campaign"] = 0
                if not state["current_campaign_id"]:
                    raise ValueError(f"캠페인 ID 없음: {camp}")
                logger.info(f"[AiExpand {config.job_id}] 캠페인 생성: {cname}")
                await asyncio.sleep(REGISTER_API_DELAY)
            except Exception as e:
                logger.error(f"[AiExpand {config.job_id}] 캠페인 생성 실패 '{cname}': {e}")
                state["register_failed"] += 1
                return False

        # 새 광고그룹 생성
        state["ad_groups_used"] += 1
        gname = f"{config.campaign_prefix}_grp_{state['ad_groups_used']:04d}"
        try:
            ag = await self.api.create_ad_group(
                campaign_id=state["current_campaign_id"],
                name=gname,
                bid_amt=config.bid,
            )
            state["current_ad_group_id"] = ag.get("nccAdgroupId")
            state["keywords_in_current_group"] = 0
            state["ad_groups_in_current_campaign"] += 1
            if not state["current_ad_group_id"]:
                raise ValueError(f"광고그룹 ID 없음: {ag}")
            logger.info(f"[AiExpand {config.job_id}] 광고그룹 생성: {gname}")
            await asyncio.sleep(REGISTER_API_DELAY)
            return True
        except Exception as e:
            logger.error(f"[AiExpand {config.job_id}] 광고그룹 생성 실패 '{gname}': {e}")
            state["register_failed"] += 1
            return False

    async def _stream_register(self, state: dict, config: AiExpandConfig) -> None:
        """stream_buffer의 키워드를 현재 광고그룹에 즉시 등록."""
        buf = state["stream_buffer"]
        while buf:
            if not await self._ensure_capacity(state, config):
                # 캠페인/그룹 생성 실패 — 이번 배치는 포기
                state["register_failed"] += len(buf)
                buf.clear()
                return

            # 이 그룹에 넣을 수 있는 최대 개수
            room = config.keywords_per_ad_group - state["keywords_in_current_group"]
            take = min(len(buf), room, MAX_KEYWORDS_PER_POST)
            batch = buf[:take]
            payload = [
                {"nccAdgroupId": state["current_ad_group_id"],
                 "keyword": kw, "bidAmt": config.bid, "useGroupBidAmt": False}
                for kw in batch
            ]
            try:
                resp = await self.api.create_keywords(payload)
                added = len(resp) if isinstance(resp, list) else 0
                state["registered"] += added
                state["register_failed"] += len(batch) - added
                state["keywords_in_current_group"] += len(batch)
            except Exception as e:
                logger.error(f"[AiExpand {config.job_id}] 키워드 등록 실패: {e}")
                state["register_failed"] += len(batch)
                state["keywords_in_current_group"] += len(batch)  # 시도한 건 센다

            del buf[:take]
            await asyncio.sleep(REGISTER_API_DELAY)

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

        # 실시간 등록용 상태
        stream_state = {
            "stream_buffer": [],                 # 등록 대기 키워드
            "current_campaign_id": None,
            "current_ad_group_id": None,
            "keywords_in_current_group": 0,
            "ad_groups_in_current_campaign": 0,
            "campaigns_used": 0,
            "ad_groups_used": 0,
            "registered": 0,
            "register_failed": 0,
        }
        stream_enabled = bool(config.stream_register and config.campaign_prefix)

        # BFS: [(keyword, depth)]
        queue: List[tuple] = [(s, 0) for s in seeds]
        level_buffer: List[dict] = []  # 이번 레벨 결과 (top_n 선별용)
        current_depth = 0

        def _promote_level_to_queue() -> None:
            """현재 level_buffer 상위 N개를 다음 depth로 queue에 밀어넣음."""
            nonlocal current_depth, level_buffer
            if level_buffer and current_depth < config.max_depth:
                level_buffer.sort(key=lambda x: x["monthly_total"], reverse=True)
                for item in level_buffer[:config.top_n_per_level]:
                    if item["keyword"] not in seen_expanded:
                        queue.append((item["keyword"], current_depth + 1))
            level_buffer = []
            current_depth += 1

        try:
            while (queue or level_buffer) and api_calls < config.max_api_calls and kept_count < config.max_total_kept:
                # 큐가 비어있지만 이번 레벨 결과가 남아있으면 다음 depth로 승격
                if not queue:
                    if current_depth >= config.max_depth:
                        break  # 최대 depth 도달 + 큐 빔 → 종료
                    _promote_level_to_queue()
                    if not queue:
                        break  # 승격해도 큐가 비면 더 확장할 게 없음
                    logger.info(
                        f"[AiExpand {job_id}] depth {current_depth}로 승격, queue {len(queue)}개"
                    )

                kw, depth = queue.pop(0)
                norm = kw.strip()
                if not norm or norm in seen_expanded:
                    continue
                seen_expanded.add(norm)

                # 취소 체크
                if api_calls % CONTROL_CHECK_EVERY == 0:
                    cur = get_volume_filter_job(job_id)
                    if cur and cur.get("should_cancel"):
                        if pending_results:
                            add_volume_filter_results(job_id, pending_results)
                            pending_results = []
                        if stream_enabled and stream_state["stream_buffer"]:
                            await self._stream_register(stream_state, config)
                        update_volume_filter_job(
                            job_id, status="cancelled",
                            processed_count=api_calls,
                            passed_count=kept_count,
                            completed_at=datetime.now().isoformat(),
                            current_step=(
                                f"취소됨: API {api_calls}회, {kept_count}개 확보"
                                + (f", 등록 {stream_state['registered']}개" if stream_enabled else "")
                            ),
                        )
                        return {"success": False, "cancelled": True,
                                "api_calls": api_calls, "kept": kept_count,
                                "registered": stream_state["registered"]}

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
                    if stream_enabled:
                        stream_state["stream_buffer"].append(rel)
                    kept_count += 1

                    if kept_count >= config.max_total_kept:
                        break

                # DB flush
                if len(pending_results) >= DB_FLUSH_BATCH:
                    add_volume_filter_results(job_id, pending_results)
                    pending_results = []

                # 실시간 등록: 배치 크기 채우면 즉시 네이버에 등록
                if stream_enabled and len(stream_state["stream_buffer"]) >= config.stream_batch_size:
                    await self._stream_register(stream_state, config)

                # 진행률 업데이트
                pct = min(99, int(api_calls / config.max_api_calls * 100))
                stream_note = (
                    f" · 등록 {stream_state['registered']}개"
                    f" (캠페인 {stream_state['campaigns_used']}, 그룹 {stream_state['ad_groups_used']})"
                    if stream_enabled else ""
                )
                update_volume_filter_job(
                    job_id,
                    processed_count=api_calls,
                    passed_count=kept_count,
                    current_step=(
                        f"AI 확장 중 [{pct}%] depth {current_depth}/{config.max_depth} "
                        f"· API {api_calls}/{config.max_api_calls}회 "
                        f"· {kept_count}개 확보{stream_note}"
                    ),
                )

                await asyncio.sleep(API_DELAY)

            # 마지막 flush
            if pending_results:
                add_volume_filter_results(job_id, pending_results)
            if stream_enabled and stream_state["stream_buffer"]:
                await self._stream_register(stream_state, config)

            final_stream_note = (
                f", 네이버 등록 {stream_state['registered']}개 "
                f"(캠페인 {stream_state['campaigns_used']}, 그룹 {stream_state['ad_groups_used']}"
                f"{', 실패 ' + str(stream_state['register_failed']) if stream_state['register_failed'] else ''})"
                if stream_enabled else ""
            )
            update_volume_filter_job(
                job_id, status="completed",
                processed_count=api_calls,
                passed_count=kept_count,
                completed_at=datetime.now().isoformat(),
                current_step=(
                    f"완료: 씨앗 {len(seeds)}개 → {kept_count}개 키워드 확보 "
                    f"(API {api_calls}회, 검색량 ≥ {config.min_volume}){final_stream_note}"
                ),
            )
            logger.info(f"[AiExpand {job_id}] 완료: {kept_count}개 (api {api_calls}회, 등록 {stream_state['registered']}개)")
            return {
                "success": True, "kept": kept_count, "api_calls": api_calls,
                "registered": stream_state["registered"],
                "register_failed": stream_state["register_failed"],
                "campaigns_used": stream_state["campaigns_used"],
                "ad_groups_used": stream_state["ad_groups_used"],
            }

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
