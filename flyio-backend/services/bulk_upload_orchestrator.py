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
from services.naver_ad_service import NaverAdApiClient, KeywordSuggestion

logger = logging.getLogger(__name__)

# 네이버 광고 플랫폼 제한
MAX_KEYWORDS_PER_AD_GROUP = 1000       # 하드 리밋 (권장은 500)
DEFAULT_KEYWORDS_PER_AD_GROUP = 500    # 실무 권장
MAX_AD_GROUPS_PER_CAMPAIGN = 1000      # 캠페인당 광고그룹 한도
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

    async def run(self, config: BulkJobConfig, keywords: List[str]) -> Dict[str, Any]:
        """메인 실행 - 키워드 리스트를 받아 캠페인/광고그룹/키워드 자동 생성"""
        job_id = config.job_id
        total = len(keywords)
        logger.info(f"[Job {job_id}] 대량 등록 시작: {total}개 키워드")

        update_bulk_upload_job(
            job_id,
            status="running",
            started_at=datetime.now().isoformat(),
            current_step=f"시작 - {total}개 키워드 준비 중",
        )

        try:
            # 0. 비즈채널 조회 — 광고그룹 생성 필수
            business_channel_id: Optional[str] = None
            try:
                channels = await self.api.list_business_channels()
                web_site = [c for c in channels if c.get("channelTp") == "WEB_SITE"]
                if not web_site:
                    update_bulk_upload_job(
                        job_id, status="failed",
                        error_message=(
                            "비즈채널(사이트 URL) 미등록. searchad.naver.com → "
                            "도구 > 비즈채널 관리 > 웹사이트 추가 후 재실행."
                        ),
                        completed_at=datetime.now().isoformat(),
                    )
                    return {"success": False, "error": "no business channel"}
                business_channel_id = web_site[0].get("nccBusinessChannelId")
                logger.info(f"[Job {job_id}] 비즈채널 확보: {business_channel_id}")
            except Exception as e:
                update_bulk_upload_job(
                    job_id, status="failed",
                    error_message=f"비즈채널 조회 실패: {str(e)[:500]}",
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

            # 3. 캠페인 생성
            created_campaigns: List[str] = []
            for c_idx in range(num_campaigns):
                campaign_name = f"{config.campaign_prefix}_{c_idx + 1:03d}"
                try:
                    campaign = await self.api.create_campaign(
                        name=campaign_name,
                        daily_budget=config.daily_budget,
                        campaign_tp=config.campaign_tp,
                    )
                    campaign_id = campaign.get("nccCampaignId")
                    if not campaign_id:
                        raise ValueError(f"캠페인 ID 없음: {campaign}")
                    created_campaigns.append(campaign_id)
                    logger.info(f"[Job {job_id}] 캠페인 생성: {campaign_name} = {campaign_id}")
                except Exception as e:
                    logger.error(f"[Job {job_id}] 캠페인 생성 실패 '{campaign_name}': {e}")
                    update_bulk_upload_job(
                        job_id,
                        status="failed",
                        error_message=f"캠페인 생성 실패: {str(e)[:500]}",
                        completed_at=datetime.now().isoformat(),
                    )
                    return {"success": False, "error": str(e)}

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
                        resp = await self.api.create_keywords(payload)
                        added_n = len(resp) if isinstance(resp, list) else 0
                        ag_succeeded += added_n
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
