"""
대량 키워드 등록 오케스트레이터
- 10만 개 규모 키워드를 캠페인/광고그룹에 자동 분할 등록
- 네이버 제한 준수: 광고그룹당 500 키워드, 캠페인당 1,000 광고그룹
- 진행률 DB 기록 + 실패 복구
"""
import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from database.naver_ad_db import (
    add_bulk_upload_failure,
    update_bulk_upload_job,
)
from database.registered_keywords_db import get_registered_keywords_db
from services.naver_ad_service import NaverAdApiClient, KeywordSuggestion

logger = logging.getLogger(__name__)

# 네이버 광고 플랫폼 제한
# (출처: connectree.net 운영 가이드, 인터애드 가이드)
MAX_KEYWORDS_PER_AD_GROUP = 1000       # 광고그룹당 키워드 하드 리밋
DEFAULT_KEYWORDS_PER_AD_GROUP = 1000   # 10만 한도 효율 위해 1000 default
MAX_AD_GROUPS_PER_CAMPAIGN = 1000      # 캠페인당 광고그룹 한도
MAX_KEYWORDS_PER_ACCOUNT = 100_000     # 계정당 키워드 총합 하드 리밋
KEYWORD_BATCH_SIZE = 100               # API 한 번에 보낼 키워드 수
API_RATE_LIMIT_DELAY = 0.5             # 호출 간 최소 대기(초)


@dataclass
class BulkJobConfig:
    job_id: int
    user_id: int
    campaign_prefix: str
    keywords_per_group: int = DEFAULT_KEYWORDS_PER_AD_GROUP
    bid: int = 100
    daily_budget: int = 10000
    campaign_tp: str = "WEB_SITE"


class BulkUploadOrchestrator:
    """대량 키워드 등록 오케스트레이터"""

    def __init__(self, api_client: NaverAdApiClient):
        self.api = api_client

    async def _auto_attach_ad_creative(
        self,
        user_id: int,
        customer_id: int,
        ad_group_id: str,
    ) -> None:
        """광고그룹 생성 직후 ad_templates에서 라운드로빈으로 소재 1개 자동 등록.

        템플릿 없으면 silent skip. 등록 실패도 silent (예외는 호출자에서).
        확장소재(전화번호·부가설명)도 활성 항목 모두 자동 등록.
        """
        from database.ad_templates_db import get_ad_templates_db

        tpl_db = get_ad_templates_db()
        tpl = tpl_db.claim_round_robin(user_id, customer_id)
        if not tpl:
            return

        try:
            await self.api.create_ad(
                ad_group_id=ad_group_id,
                headline_pc=tpl["headline_pc"],
                description_pc=tpl["description_pc"],
                display_url=tpl["display_url"],
                final_url_pc=tpl["final_url_pc"],
                headline_mobile=tpl.get("headline_mobile"),
                description_mobile=tpl.get("description_mobile"),
                final_url_mobile=tpl.get("final_url_mobile"),
            )
        except Exception as e:
            logger.warning(
                f"[orchestrator] 소재 등록 실패 ad_group={ad_group_id} tpl={tpl.get('id')}: {e}"
            )

        # 확장소재 — 활성 모든 종류 등록 (소재 1개 등록 후)
        for ext in tpl_db.list_extensions(user_id, customer_id, active_only=True):
            try:
                await self.api.create_ad_extension(
                    owner_id=ad_group_id,
                    kind=ext.get("kind") or "",
                    content=ext.get("payload") or {},
                    owner_type="ADGROUP",
                )
                await asyncio.sleep(0.2)
            except Exception as e:
                logger.warning(
                    f"[orchestrator] 확장소재 실패 ext={ext.get('id')} kind={ext.get('kind')}: {e}"
                )

    async def run(self, config: BulkJobConfig, keywords: List[str]) -> Dict[str, Any]:
        """메인 실행 - 키워드 리스트를 받아 캠페인/광고그룹/키워드 자동 생성"""
        job_id = config.job_id
        original_total = len(keywords)
        logger.info(f"[Job {job_id}] 대량 등록 시작: {original_total}개 키워드")

        # ===== Phase 1: 중복 차집합 — 같은 계정에 이미 등록된 키워드 제거 =====
        try:
            customer_id_int = int(getattr(self.api, "customer_id", 0) or 0)
        except (TypeError, ValueError):
            customer_id_int = 0

        if customer_id_int > 0:
            reg_db = get_registered_keywords_db()
            new_keywords = reg_db.filter_new(customer_id_int, keywords)
            skipped_dup = original_total - len(new_keywords)
            if skipped_dup > 0:
                logger.info(
                    f"[Job {job_id}] 중복 제거: {skipped_dup}개 이미 등록됨 → "
                    f"새로 등록할 키워드 {len(new_keywords)}개"
                )

            # 계정당 10만개 하드 가드
            stats = reg_db.stats(customer_id_int) or {}
            existing_active = int(stats.get("active") or 0)
            remaining = MAX_KEYWORDS_PER_ACCOUNT - existing_active
            if remaining <= 0:
                update_bulk_upload_job(
                    job_id, status="failed",
                    error_message=(
                        f"계정 키워드 한도 도달 ({existing_active:,}/{MAX_KEYWORDS_PER_ACCOUNT:,}). "
                        "기존 키워드 일부 삭제 또는 다른 계정 사용 필요."
                    ),
                    completed_at=datetime.now().isoformat(),
                )
                return {"success": False, "error": "account keyword cap"}
            if len(new_keywords) > remaining:
                logger.warning(
                    f"[Job {job_id}] 잔여 한도 {remaining}개로 truncate "
                    f"(요청 {len(new_keywords)}개)"
                )
                new_keywords = new_keywords[:remaining]

            keywords = new_keywords
        else:
            logger.warning(f"[Job {job_id}] customer_id 없음 → 중복 차집합/한도 가드 생략")

        total = len(keywords)
        if total == 0:
            update_bulk_upload_job(
                job_id, status="completed",
                started_at=datetime.now().isoformat(),
                completed_at=datetime.now().isoformat(),
                total_keywords=0,
                processed_count=0,
                current_step=f"등록할 새 키워드 없음 (모두 이미 등록됨, 원본 {original_total}개)",
            )
            return {
                "success": True,
                "skipped_duplicate": original_total,
                "registered": 0,
                "message": "모든 키워드가 이미 등록되어 있습니다.",
            }

        update_bulk_upload_job(
            job_id,
            status="running",
            started_at=datetime.now().isoformat(),
            total_keywords=total,
            current_step=(
                f"시작 - {total}개 키워드 준비 중 "
                f"(중복 {original_total - total}개 자동 제외)"
                if original_total != total else f"시작 - {total}개 키워드 준비 중"
            ),
        )

        try:
            # 0. 비즈채널 조회 — 광고그룹 생성 필수
            business_channel_id: Optional[str] = None
            try:
                channels = await self.api.list_business_channels()
                logger.info(f"[Job {job_id}] 비즈채널 raw 응답 ({len(channels) if channels else 0}개): {channels}")

                # 1차: WEB_SITE channelTp (네이버 표준)
                web_site = [c for c in channels if c.get("channelTp") == "WEB_SITE"]

                # 2차 fallback: channelTp 변형값 (SITE, WEBSITE 등)
                if not web_site:
                    web_site = [
                        c for c in channels
                        if str(c.get("channelTp", "")).upper() in ("WEB_SITE", "SITE", "WEBSITE", "WEB")
                    ]

                # 3차 fallback: URL 필드가 있는 모든 채널
                if not web_site:
                    web_site = [
                        c for c in channels
                        if any(str(c.get(k, "")).startswith("http") for k in ("siteUrl", "url", "channelKey"))
                    ]

                # 4차 최후: 첫 번째 사용 가능한 채널 (있으면)
                if not web_site and channels:
                    web_site = [channels[0]]
                    logger.warning(f"[Job {job_id}] 표준 필터 실패, 첫 채널 사용: {channels[0]}")

                if not web_site:
                    # raw 응답을 error_message에 포함해 사용자가 디버그 가능
                    raw_preview = str(channels)[:500] if channels else "(empty list)"
                    update_bulk_upload_job(
                        job_id, status="failed",
                        error_message=(
                            "비즈채널(사이트 URL) 미등록. searchad.naver.com → "
                            "도구 > 비즈채널 관리 > 웹사이트 추가 후 재실행. "
                            f"[API 응답: {raw_preview}]"
                        ),
                        completed_at=datetime.now().isoformat(),
                    )
                    return {"success": False, "error": "no business channel"}

                channel = web_site[0]
                business_channel_id = (
                    channel.get("nccBusinessChannelId")
                    or channel.get("businessChannelId")
                    or channel.get("nccChannelId")
                    or channel.get("id")
                )
                logger.info(
                    f"[Job {job_id}] 비즈채널 확보: id={business_channel_id} "
                    f"channelTp={channel.get('channelTp')} keys={list(channel.keys())}"
                )

                if not business_channel_id:
                    update_bulk_upload_job(
                        job_id, status="failed",
                        error_message=(
                            f"비즈채널 ID 추출 실패. 응답 필드: {list(channel.keys())}. "
                            f"raw: {str(channel)[:300]}"
                        ),
                        completed_at=datetime.now().isoformat(),
                    )
                    return {"success": False, "error": "no business channel id"}
            except Exception as e:
                update_bulk_upload_job(
                    job_id, status="failed",
                    error_message=f"비즈채널 조회 실패 [{type(e).__name__}]: {str(e)[:800]}",
                    completed_at=datetime.now().isoformat(),
                )
                return {"success": False, "error": f"channel lookup: {e}"}

            # 1. 광고그룹 단위로 청크 분할
            per_group = max(1, min(config.keywords_per_group, MAX_KEYWORDS_PER_AD_GROUP))
            ad_group_chunks = [
                keywords[i:i + per_group]
                for i in range(0, total, per_group)
            ]
            num_ad_groups = len(ad_group_chunks)
            logger.info(f"[Job {job_id}] 광고그룹 {num_ad_groups}개 필요 (그룹당 최대 {per_group}개)")

            # 2. 캠페인 개수 계산
            num_campaigns = (num_ad_groups + MAX_AD_GROUPS_PER_CAMPAIGN - 1) // MAX_AD_GROUPS_PER_CAMPAIGN

            update_bulk_upload_job(
                job_id,
                current_step=f"캠페인 {num_campaigns}개 / 광고그룹 {num_ad_groups}개 생성 예정",
            )

            # 3. 캠페인 생성 — 이름 중복 시 timestamp suffix로 자동 재시도
            import time as _time
            run_suffix = str(int(_time.time()))[-6:]  # 6자리 epoch suffix (실행마다 다름)
            created_campaigns: List[str] = []
            for c_idx in range(num_campaigns):
                base_name = f"{config.campaign_prefix}_{c_idx + 1:03d}"
                campaign_name = base_name
                campaign_id: Optional[str] = None
                last_err: Optional[Exception] = None

                # 최대 3회: 첫 시도 + 충돌 시 suffix 2회
                for attempt in range(3):
                    try:
                        campaign = await self.api.create_campaign(
                            name=campaign_name,
                            daily_budget=config.daily_budget,
                            campaign_tp=config.campaign_tp,
                        )
                        cid = campaign.get("nccCampaignId")
                        if not cid:
                            raise ValueError(f"캠페인 ID 없음: {campaign}")
                        campaign_id = cid
                        logger.info(f"[Job {job_id}] 캠페인 생성: {campaign_name} = {cid}")
                        break
                    except Exception as e:
                        last_err = e
                        # 이름 중복 (code 3506) 시 suffix 추가 후 재시도
                        if "already in use" in str(e) or "3506" in str(e):
                            campaign_name = f"{base_name}_{run_suffix}_{attempt}"
                            logger.warning(
                                f"[Job {job_id}] 캠페인 이름 중복 → '{campaign_name}'으로 재시도"
                            )
                            await asyncio.sleep(API_RATE_LIMIT_DELAY)
                            continue
                        else:
                            break  # 다른 에러는 즉시 중단

                if campaign_id:
                    created_campaigns.append(campaign_id)
                else:
                    err_str = str(last_err) if last_err else "unknown"
                    logger.error(f"[Job {job_id}] 캠페인 생성 최종 실패 '{base_name}': {err_str}")
                    update_bulk_upload_job(
                        job_id,
                        status="failed",
                        error_message=f"캠페인 생성 실패: {err_str[:500]}",
                        completed_at=datetime.now().isoformat(),
                    )
                    return {"success": False, "error": err_str}

                await asyncio.sleep(API_RATE_LIMIT_DELAY)

            update_bulk_upload_job(
                job_id,
                campaigns_created=len(created_campaigns),
                campaign_ids=json.dumps(created_campaigns),
                current_step=f"캠페인 {len(created_campaigns)}개 생성 완료. 광고그룹 생성 시작",
            )

            # 4. 광고그룹 생성 + 키워드 등록 루프
            created_ad_groups: List[str] = []
            processed = 0
            succeeded = 0
            failed = 0

            for g_idx, chunk in enumerate(ad_group_chunks):
                c_idx = g_idx // MAX_AD_GROUPS_PER_CAMPAIGN
                campaign_id = created_campaigns[c_idx]
                ad_group_name = f"{config.campaign_prefix}_grp_{g_idx + 1:04d}"

                # 광고그룹 생성
                try:
                    ag = await self.api.create_ad_group(
                        campaign_id=campaign_id,
                        name=ad_group_name,
                        bid_amt=config.bid,
                        business_channel_id=business_channel_id,
                    )
                    ad_group_id = ag.get("nccAdgroupId")
                    if not ad_group_id:
                        raise ValueError(f"광고그룹 ID 없음: {ag}")
                    created_ad_groups.append(ad_group_id)
                    logger.info(f"[Job {job_id}] 광고그룹 생성 {g_idx+1}/{num_ad_groups}: {ad_group_name}")
                except Exception as e:
                    err_type = type(e).__name__
                    err_str = str(e)
                    logger.error(
                        f"[Job {job_id}] 광고그룹 생성 실패 '{ad_group_name}' "
                        f"[{err_type}]: {err_str[:1500]}"
                    )
                    # 해당 청크 전체를 실패 처리 — type 포함 + 본문 길이 확장
                    failure_reason = f"광고그룹 생성 실패 [{err_type}]: {err_str[:600]}"
                    for kw in chunk:
                        add_bulk_upload_failure(job_id, kw, config.bid, "", failure_reason)
                        failed += 1
                        processed += 1
                    update_bulk_upload_job(
                        job_id,
                        processed_count=processed,
                        failed_count=failed,
                        current_step=f"광고그룹 생성 실패: {ad_group_name} - 스킵",
                    )
                    await asyncio.sleep(API_RATE_LIMIT_DELAY)
                    continue

                await asyncio.sleep(API_RATE_LIMIT_DELAY)

                # P4: 광고그룹 생성 직후 라운드로빈으로 소재 1개 자동 등록
                # 등록 실패해도 키워드는 진행 (소재는 나중에 보정 가능)
                if customer_id_int > 0:
                    try:
                        await self._auto_attach_ad_creative(
                            user_id=config.user_id,
                            customer_id=customer_id_int,
                            ad_group_id=ad_group_id,
                        )
                    except Exception as ad_err:
                        logger.warning(
                            f"[Job {job_id}] 소재 자동 매칭 실패 (그룹 {ad_group_id}): {ad_err}"
                        )

                # 이 광고그룹에 키워드 배치 등록 (100개씩)
                ag_succeeded = 0
                ag_failed = 0
                for batch_start in range(0, len(chunk), KEYWORD_BATCH_SIZE):
                    batch = chunk[batch_start:batch_start + KEYWORD_BATCH_SIZE]
                    payload = [
                        {
                            "nccAdgroupId": ad_group_id,
                            "keyword": kw,
                            "bidAmt": config.bid,
                            "useGroupBidAmt": False,
                        }
                        for kw in batch
                    ]
                    try:
                        # 네이버 API는 nccAdgroupId를 URL query에 요구 — ad_group_id 명시 전달
                        resp = await self.api.create_keywords(payload, ad_group_id=ad_group_id)
                        added_n = len(resp) if isinstance(resp, list) else 0
                        ag_succeeded += added_n

                        # Phase 1: 등록 성공 키워드를 dedup DB에 기록 (다음 시도 차집합)
                        if customer_id_int > 0 and added_n > 0:
                            try:
                                resp_list = resp if isinstance(resp, list) else []
                                rows_to_save = []
                                for i, item in enumerate(resp_list):
                                    if isinstance(item, dict):
                                        kw_text = item.get("keyword") or (batch[i] if i < len(batch) else "")
                                        rows_to_save.append({
                                            "keyword": kw_text,
                                            "ad_group_id": ad_group_id,
                                            "campaign_id": campaign_id,
                                            "bid_amt": config.bid,
                                            "ncc_keyword_id": item.get("nccKeywordId"),
                                        })
                                reg_db = get_registered_keywords_db()
                                reg_db.insert_batch(config.user_id, customer_id_int, rows_to_save)
                            except Exception as save_err:
                                logger.warning(f"[Job {job_id}] dedup DB 저장 실패: {save_err}")

                        # 응답이 일부만 성공일 수 있음 - 차이는 실패로 기록
                        shortfall = len(batch) - added_n
                        if shortfall > 0:
                            for kw in batch[added_n:]:
                                add_bulk_upload_failure(
                                    job_id, kw, config.bid, ad_group_id,
                                    "API 응답에 포함되지 않음"
                                )
                                ag_failed += 1
                    except Exception as e:
                        logger.error(f"[Job {job_id}] 키워드 배치 실패 (그룹 {ad_group_id}): {e}")
                        for kw in batch:
                            add_bulk_upload_failure(
                                job_id, kw, config.bid, ad_group_id,
                                f"API 오류: {str(e)[:200]}"
                            )
                            ag_failed += 1

                    await asyncio.sleep(API_RATE_LIMIT_DELAY)

                # 그룹 결과 누적
                succeeded += ag_succeeded
                failed += ag_failed
                processed += len(chunk)

                # 진행률 업데이트
                pct = int(processed / total * 100) if total else 100
                update_bulk_upload_job(
                    job_id,
                    processed_count=processed,
                    succeeded_count=succeeded,
                    failed_count=failed,
                    ad_groups_created=len(created_ad_groups),
                    current_step=f"{pct}% - 광고그룹 {g_idx+1}/{num_ad_groups}에 "
                                 f"{ag_succeeded}/{len(chunk)} 등록 완료",
                )

            # 5. 완료
            update_bulk_upload_job(
                job_id,
                status="completed" if failed == 0 else "completed_with_errors",
                ad_group_ids=json.dumps(created_ad_groups),
                completed_at=datetime.now().isoformat(),
                current_step=f"완료: 총 {total}개 중 {succeeded} 성공, {failed} 실패",
            )
            logger.info(f"[Job {job_id}] 완료: 성공 {succeeded} / 실패 {failed}")
            return {
                "success": True,
                "total": total,
                "succeeded": succeeded,
                "failed": failed,
                "campaigns": len(created_campaigns),
                "ad_groups": len(created_ad_groups),
            }

        except Exception as e:
            logger.exception(f"[Job {job_id}] 치명적 오류")
            update_bulk_upload_job(
                job_id,
                status="failed",
                error_message=str(e)[:1000],
                completed_at=datetime.now().isoformat(),
                current_step=f"오류로 중단: {str(e)[:200]}",
            )
            return {"success": False, "error": str(e)}
