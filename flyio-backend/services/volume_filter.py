"""
키워드 검색량 필터링 서비스
- 네이버 검색광고 /keywordstool API로 월 검색량 조회
- hintKeywords 최대 5개 배치, rate limit 준수
- 임계치(기본 10) 이상 키워드만 수집
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from database.naver_ad_db import (
    add_volume_filter_results,
    update_volume_filter_job,
)
from services.naver_ad_service import NaverAdApiClient

logger = logging.getLogger(__name__)

# 네이버 /keywordstool: hintKeywords 최대 5개
HINT_BATCH_SIZE = 5
# Rate limit: 초당 2~3건 → 0.4초 간격 (안전)
API_DELAY = 0.4
# DB 저장 배치 (통과 키워드 모아서 한 번에 INSERT)
DB_FLUSH_BATCH = 200
# 진행률 업데이트 주기
PROGRESS_UPDATE_EVERY = 50  # 50배치(250키워드)마다


@dataclass
class VolumeFilterConfig:
    job_id: int
    user_id: int
    min_volume: int = 10  # 월 총 검색량(PC + 모바일) 기준


class VolumeFilterService:
    """검색량 필터링 서비스"""

    def __init__(self, api_client: NaverAdApiClient):
        self.api = api_client

    async def run(self, config: VolumeFilterConfig, keywords: List[str]) -> dict:
        """키워드 리스트를 배치로 검색량 조회 → 임계치 이상만 수집"""
        job_id = config.job_id
        total = len(keywords)
        logger.info(f"[Filter {job_id}] 시작: {total}개 키워드, 임계치 월 {config.min_volume}")

        update_volume_filter_job(
            job_id,
            status="running",
            started_at=datetime.now().isoformat(),
            current_step=f"시작 - {total}개 키워드 검색량 조회 예정",
        )

        # 중복 제거 + 공백 정리
        seen = set()
        unique_keywords = []
        for kw in keywords:
            norm = (kw or "").strip()
            if norm and norm not in seen:
                seen.add(norm)
                unique_keywords.append(norm)
        total_unique = len(unique_keywords)

        if total_unique == 0:
            update_volume_filter_job(
                job_id,
                status="completed",
                processed_count=0,
                passed_count=0,
                completed_at=datetime.now().isoformat(),
                current_step="유효 키워드 없음",
            )
            return {"success": True, "total": 0, "passed": 0, "failed_api": 0}

        processed = 0
        passed = 0
        failed_api = 0
        pending_results: List[dict] = []

        try:
            num_batches = (total_unique + HINT_BATCH_SIZE - 1) // HINT_BATCH_SIZE

            for batch_idx in range(num_batches):
                batch = unique_keywords[
                    batch_idx * HINT_BATCH_SIZE : (batch_idx + 1) * HINT_BATCH_SIZE
                ]

                try:
                    volumes = await self.api.get_keywords_volume_batch(batch)
                except Exception as e:
                    logger.warning(f"[Filter {job_id}] batch {batch_idx} API 실패: {e}")
                    volumes = {}
                    failed_api += len(batch)

                # 각 키워드를 응답에서 찾기 (정확 매칭, 공백/대소문자 관대하게)
                for kw in batch:
                    # 정확 매칭
                    hit = volumes.get(kw)
                    if not hit:
                        # 대소문자/공백 보정 매칭
                        norm = kw.replace(" ", "").lower()
                        for rel_kw, data in volumes.items():
                            if rel_kw.replace(" ", "").lower() == norm:
                                hit = data
                                break
                    if hit and hit["monthly_total"] >= config.min_volume:
                        pending_results.append({
                            "keyword": kw,
                            "monthly_pc": hit["monthly_pc"],
                            "monthly_mobile": hit["monthly_mobile"],
                            "monthly_total": hit["monthly_total"],
                            "comp_idx": hit.get("comp_idx", ""),
                        })
                        passed += 1
                    # 검색량 없으면 버림

                processed += len(batch)

                # DB flush
                if len(pending_results) >= DB_FLUSH_BATCH:
                    add_volume_filter_results(job_id, pending_results)
                    pending_results = []

                # 진행률 업데이트
                if batch_idx % PROGRESS_UPDATE_EVERY == 0 or batch_idx == num_batches - 1:
                    pct = int(processed / total_unique * 100)
                    eta_sec = int((total_unique - processed) * API_DELAY / HINT_BATCH_SIZE)
                    update_volume_filter_job(
                        job_id,
                        processed_count=processed,
                        passed_count=passed,
                        failed_api_count=failed_api,
                        current_step=f"{pct}% - {processed}/{total_unique}개 조회 완료, {passed}개 통과 "
                                     f"(남은 시간 약 {eta_sec // 60}분 {eta_sec % 60}초)",
                    )

                # Rate limit
                await asyncio.sleep(API_DELAY)

            # 마지막 flush
            if pending_results:
                add_volume_filter_results(job_id, pending_results)

            update_volume_filter_job(
                job_id,
                status="completed",
                processed_count=processed,
                passed_count=passed,
                failed_api_count=failed_api,
                completed_at=datetime.now().isoformat(),
                current_step=f"완료: {total_unique}개 중 {passed}개가 검색량 "
                             f"{config.min_volume} 이상 (API 실패 {failed_api}개)",
            )
            logger.info(f"[Filter {job_id}] 완료: {passed}/{total_unique} 통과")
            return {
                "success": True,
                "total": total_unique,
                "passed": passed,
                "failed_api": failed_api,
            }
        except Exception as e:
            logger.exception(f"[Filter {job_id}] 치명적 오류")
            # 남은 결과라도 저장
            if pending_results:
                try:
                    add_volume_filter_results(job_id, pending_results)
                except Exception:
                    pass
            update_volume_filter_job(
                job_id,
                status="failed",
                error_message=str(e)[:1000],
                completed_at=datetime.now().isoformat(),
                current_step=f"오류 중단: {str(e)[:200]}",
            )
            return {"success": False, "error": str(e)}
