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
MAX_CAMPAIGNS_PER_ACCOUNT = 200     # 네이버 계정당 파워링크 캠페인 한도
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


_COMPOUND_SUFFIXES: dict = {
    "대출": ["대출", "자금", "론", "대환", "마통", "마이너스통장"],
    "자금": ["자금", "대출", "론", "지원금"],
    "론": ["론", "대출", "자금"],
    "금융": ["금융", "대출", "자금"],
    "병원": ["병원", "의원", "클리닉"],
    "의원": ["의원", "병원", "클리닉"],
    "수술": ["수술", "시술", "성형"],
    "성형": ["성형", "수술", "시술"],
    "시공": ["시공", "공사", "인테리어", "리모델링"],
    "인테리어": ["인테리어", "시공", "리모델링"],
    "리모델링": ["리모델링", "인테리어", "시공"],
    "매매": ["매매", "거래", "매물"],
}

def _derive_core_terms(seeds: List[str]) -> List[str]:
    """씨앗에서 앵커 토큰 추출.
    - 원문 씨앗 포함 (예: "카페대출")
    - 공백 분리 토큰(2자+)만 포함 (공백 쓰면 명시적 분리 의도)
    - 복합어 접미사 감지 → 접미사 + 형제어만 앵커로 추가
      (예: "카페대출" 씨앗 → 앵커 {카페대출, 대출, 자금, 론, 대환, 마통, 마이너스통장})
    - ⚠️ prefix(카페/강화도카페 등)는 앵커로 추가하지 않음.
      "카페" 앵커 두면 "강화도카페/강남역카페" 같은 무관 키워드 전부 통과해버리기 때문.
      도메인 시그널은 오로지 접미사(대출/자금/론…)로 강제.
    """
    tokens: Set[str] = set()
    matched_suffixes: Set[str] = set()
    for s in seeds:
        s = s.strip()
        if not s:
            continue
        tokens.add(s)
        for w in s.split():
            w = w.strip()
            if len(w) >= 2:
                tokens.add(w)
        s_nospace = s.replace(" ", "")
        for suffix in sorted(_COMPOUND_SUFFIXES.keys(), key=len, reverse=True):
            if s_nospace.endswith(suffix) and len(s_nospace) > len(suffix):
                matched_suffixes.add(suffix)
                break
    for suffix in matched_suffixes:
        for sib in _COMPOUND_SUFFIXES[suffix]:
            tokens.add(sib)
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
            # 계정 한도 체크 — 기존 캠페인 + 이번 실행에서 만든 거
            if state["campaigns_used"] >= MAX_CAMPAIGNS_PER_ACCOUNT:
                state["last_error"] = (
                    f"계정당 캠페인 {MAX_CAMPAIGNS_PER_ACCOUNT}개 한도 도달. "
                    "기존 캠페인을 정리하거나 다른 계정 사용하세요."
                )
                logger.error(f"[AiExpand {config.job_id}] {state['last_error']}")
                return False
            # 시도 번호는 attempted 카운터로 별도 관리, 성공 시에만 campaigns_used 증가
            state["campaign_attempts"] = state.get("campaign_attempts", 0) + 1
            base_cname = f"{config.campaign_prefix}_{state['campaign_attempts']:03d}"
            cname = base_cname

            # 이름 중복(code 3506) 시 timestamp suffix로 자동 재시도 (최대 3회)
            import time as _time
            run_suffix = str(int(_time.time()))[-6:]
            cid: Optional[str] = None
            last_err: Optional[Exception] = None
            for attempt in range(3):
                try:
                    camp = await self.api.create_campaign(
                        name=cname,
                        daily_budget=config.daily_budget,
                        campaign_tp=config.campaign_tp,
                    )
                    new_cid = camp.get("nccCampaignId")
                    if not new_cid:
                        raise ValueError(f"캠페인 ID 없음: {camp}")
                    cid = new_cid
                    logger.info(f"[AiExpand {config.job_id}] 캠페인 생성 ✓: {cname} ({cid})")
                    break
                except Exception as e:
                    last_err = e
                    if "already in use" in str(e) or "3506" in str(e):
                        cname = f"{base_cname}_{run_suffix}_{attempt}"
                        logger.warning(
                            f"[AiExpand {config.job_id}] 캠페인 이름 중복 → '{cname}'으로 재시도"
                        )
                        await asyncio.sleep(REGISTER_API_DELAY)
                        continue
                    else:
                        break

            if cid:
                state["current_campaign_id"] = cid
                state["ad_groups_in_current_campaign"] = 0
                state["campaigns_used"] += 1  # 성공 확정 후 증가
                await asyncio.sleep(REGISTER_API_DELAY)
            else:
                err = str(last_err)[:500] if last_err else "unknown"
                state["last_error"] = f"캠페인 생성 실패: {err}"
                logger.error(f"[AiExpand {config.job_id}] 캠페인 생성 실패 '{base_cname}': {err}")
                state["register_failed"] += 1
                return False

        # 새 광고그룹 생성
        state["ad_group_attempts"] = state.get("ad_group_attempts", 0) + 1
        gname = f"{config.campaign_prefix}_grp_{state['ad_group_attempts']:04d}"
        try:
            ag = await self.api.create_ad_group(
                campaign_id=state["current_campaign_id"],
                name=gname,
                bid_amt=config.bid,
                business_channel_id=state.get("business_channel_id"),
            )
            gid = ag.get("nccAdgroupId")
            if not gid:
                raise ValueError(f"광고그룹 ID 없음: {ag}")
            state["current_ad_group_id"] = gid
            state["keywords_in_current_group"] = 0
            state["ad_groups_in_current_campaign"] += 1
            state["ad_groups_used"] += 1  # 성공 확정 후 증가
            logger.info(f"[AiExpand {config.job_id}] 광고그룹 생성 ✓: {gname} ({gid})")
            await asyncio.sleep(REGISTER_API_DELAY)
            return True
        except Exception as e:
            err = str(e)[:500]
            state["last_error"] = f"광고그룹 생성 실패: {err}"
            logger.error(f"[AiExpand {config.job_id}] 광고그룹 생성 실패 '{gname}': {err}")
            state["register_failed"] += 1
            return False

    async def _stream_register(self, state: dict, config: AiExpandConfig) -> None:
        """stream_buffer의 키워드를 현재 광고그룹에 즉시 등록."""
        buf = state["stream_buffer"]
        while buf:
            if not await self._ensure_capacity(state, config):
                state["register_failed"] += len(buf)
                buf.clear()
                return

            room = config.keywords_per_ad_group - state["keywords_in_current_group"]
            take = min(len(buf), room, MAX_KEYWORDS_PER_POST)
            raw_batch = buf[:take]

            # 키워드 사전 검증 — 네이버 제약: 길이 1~35, 공백 단독 불가
            valid_batch: List[str] = []
            for kw in raw_batch:
                k = (kw or "").strip()
                if not k or len(k) > 35 or len(k.replace(" ", "")) < 1:
                    state["register_failed"] += 1
                    state["skipped_invalid"] = state.get("skipped_invalid", 0) + 1
                    continue
                valid_batch.append(k)

            del buf[:take]

            if not valid_batch:
                continue

            payload = [
                {"nccAdgroupId": state["current_ad_group_id"],
                 "keyword": kw, "bidAmt": config.bid, "useGroupBidAmt": False}
                for kw in valid_batch
            ]
            try:
                resp = await self.api.create_keywords(payload)
                added = len(resp) if isinstance(resp, list) else 0
                state["registered"] += added
                state["register_failed"] += len(valid_batch) - added
                state["keywords_in_current_group"] += added  # 실제 등록된 것만 카운트
                if added > 0 and "last_error" in state:
                    state.pop("last_error", None)  # 성공하면 이전 에러 지움
            except Exception as e:
                err_msg = str(e)[:500]
                state["last_error"] = err_msg
                state["consecutive_failures"] = state.get("consecutive_failures", 0) + 1
                logger.error(f"[AiExpand {config.job_id}] 키워드 등록 실패: {err_msg}")
                state["register_failed"] += len(valid_batch)
                # ⚠️ keywords_in_current_group 증가 안 시킴 — 아무것도 안 들어갔으니까.
                # 연속 실패 5회면 그룹 교체 (같은 그룹 계속 때려도 성공 못 함).
                if state["consecutive_failures"] >= 5:
                    state["keywords_in_current_group"] = config.keywords_per_ad_group
                    state["consecutive_failures"] = 0
            else:
                state["consecutive_failures"] = 0

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
            "business_channel_id": None,
        }
        stream_enabled = bool(config.stream_register and config.campaign_prefix)

        # 스트림 등록 전제: 비즈채널(사이트) 등록돼 있어야 광고그룹 생성 가능.
        # 없으면 모든 키워드 등록이 400 Bad Request → 사전 가드.
        if stream_enabled:
            try:
                channels = await self.api.list_business_channels()
                logger.info(f"[AiExpand {job_id}] 비즈채널 raw 응답 ({len(channels) if channels else 0}개): {channels}")

                # 1차: 표준 WEB_SITE + ELIGIBLE
                web_site = [
                    c for c in channels
                    if c.get("channelTp") == "WEB_SITE" and c.get("status") in ("ELIGIBLE", None)
                ]
                # 2차: status 무시 WEB_SITE
                if not web_site:
                    web_site = [c for c in channels if c.get("channelTp") == "WEB_SITE"]
                # 3차: channelTp 변형값
                if not web_site:
                    web_site = [
                        c for c in channels
                        if str(c.get("channelTp", "")).upper() in ("WEB_SITE", "SITE", "WEBSITE", "WEB")
                    ]
                # 4차: URL 필드 보유
                if not web_site:
                    web_site = [
                        c for c in channels
                        if any(str(c.get(k, "")).startswith("http") for k in ("siteUrl", "url", "channelKey"))
                    ]
                # 5차: 첫 번째 사용 가능 채널
                if not web_site and channels:
                    web_site = [channels[0]]
                    logger.warning(f"[AiExpand {job_id}] 표준 필터 실패, 첫 채널 사용: {channels[0]}")

                if not web_site:
                    raw_preview = str(channels)[:500] if channels else "(empty list)"
                    update_volume_filter_job(
                        job_id, status="failed",
                        error_message=(
                            "네이버 광고 계정에 비즈채널(사이트 URL)이 등록돼 있지 않습니다. "
                            "searchad.naver.com에 로그인해서 도구 > 비즈채널 관리 > 웹사이트 추가한 뒤 재실행하세요. "
                            f"[API 응답: {raw_preview}]"
                        ),
                        completed_at=datetime.now().isoformat(),
                        current_step="비즈채널 미등록",
                    )
                    return {"success": False, "error": "no business channel"}

                channel = web_site[0]
                stream_state["business_channel_id"] = (
                    channel.get("nccBusinessChannelId")
                    or channel.get("businessChannelId")
                    or channel.get("nccChannelId")
                    or channel.get("id")
                )
                logger.info(
                    f"[AiExpand {job_id}] 비즈채널: {channel.get('name') or channel.get('url') or channel.get('siteUrl')} "
                    f"id={stream_state['business_channel_id']} channelTp={channel.get('channelTp')} keys={list(channel.keys())}"
                )

                if not stream_state["business_channel_id"]:
                    update_volume_filter_job(
                        job_id, status="failed",
                        error_message=(
                            f"비즈채널 ID 추출 실패. 응답 필드: {list(channel.keys())}. "
                            f"raw: {str(channel)[:300]}"
                        ),
                        completed_at=datetime.now().isoformat(),
                        current_step="비즈채널 ID 추출 실패",
                    )
                    return {"success": False, "error": "no business channel id"}
            except Exception as e:
                update_volume_filter_job(
                    job_id, status="failed",
                    error_message=f"비즈채널 조회 실패 [{type(e).__name__}]: {str(e)[:800]}",
                    completed_at=datetime.now().isoformat(),
                    current_step="비즈채널 조회 실패",
                )
                return {"success": False, "error": f"channel lookup: {e}"}

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
                camp_att = stream_state.get("campaign_attempts", 0)
                grp_att = stream_state.get("ad_group_attempts", 0)
                camp_ok = stream_state["campaigns_used"]
                grp_ok = stream_state["ad_groups_used"]
                stream_note = (
                    f" · 등록 {stream_state['registered']}개 "
                    f"(캠페인 {camp_ok}/{camp_att}, 그룹 {grp_ok}/{grp_att})"
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

            camp_att = stream_state.get("campaign_attempts", 0)
            grp_att = stream_state.get("ad_group_attempts", 0)
            camp_ok = stream_state["campaigns_used"]
            grp_ok = stream_state["ad_groups_used"]
            final_stream_note = (
                f", 네이버 등록 {stream_state['registered']}개 "
                f"(캠페인 {camp_ok}/{camp_att} 성공, 그룹 {grp_ok}/{grp_att} 성공"
                f"{', 키워드실패 ' + str(stream_state['register_failed']) if stream_state['register_failed'] else ''}"
                f"{', 형식오류 ' + str(stream_state.get('skipped_invalid', 0)) if stream_state.get('skipped_invalid') else ''})"
                if stream_enabled else ""
            )
            # 등록 에러 있으면 사용자에게 보이게
            err_note = ""
            if stream_enabled and stream_state.get("last_error"):
                err_note = f" · 네이버 에러: {stream_state['last_error'][:200]}"
            update_volume_filter_job(
                job_id, status="completed",
                processed_count=api_calls,
                passed_count=kept_count,
                completed_at=datetime.now().isoformat(),
                current_step=(
                    f"완료: 씨앗 {len(seeds)}개 → {kept_count}개 키워드 확보 "
                    f"(API {api_calls}회, 검색량 ≥ {config.min_volume}){final_stream_note}{err_note}"
                ),
                error_message=stream_state.get("last_error") if stream_enabled else None,
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
