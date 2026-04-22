"""
키워드 검색량 필터링 서비스
- 네이버 검색광고 /keywordstool API로 월 검색량 조회
- hintKeywords 최대 5개 배치, rate limit 준수
- 임계치(기본 10) 이상 키워드만 수집
- 캐너리 테스트: 첫 N개 결과로 통과율 판단 후 자동 계속 or 중단
- 취소/일시정지/재개 지원
"""
import asyncio
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from database.naver_ad_db import (
    add_volume_filter_results,
    get_volume_filter_job,
    update_volume_filter_job,
)
from services.naver_ad_service import NaverAdApiClient

logger = logging.getLogger(__name__)

# 네이버 /keywordstool: hintKeywords 최대 5개
HINT_BATCH_SIZE = 5
# Rate limit: 초당 2~3건 → 0.4초 간격 (안전)
API_DELAY = 0.4
# DB 저장 배치
DB_FLUSH_BATCH = 200
# 제어 플래그 체크 + 진행률 업데이트 주기 (배치 단위)
CONTROL_CHECK_EVERY = 20  # 20배치(100키워드)마다 취소/일시정지 체크
PROGRESS_UPDATE_EVERY = 50


@dataclass
class VolumeFilterConfig:
    job_id: int
    user_id: int
    min_volume: int = 10
    test_size: int = 10000
    min_pass_rate_pct: float = 2.0
    auto_continue_on_canary: bool = True


class VolumeFilterService:
    """검색량 필터링 서비스"""

    def __init__(self, api_client: NaverAdApiClient):
        self.api = api_client

    @staticmethod
    def save_keywords_file(job_id: int, keywords: List[str], data_dir: str) -> str:
        """키워드를 파일에 저장 (재개용)"""
        job_dir = os.path.join(data_dir, "filter_jobs", str(job_id))
        os.makedirs(job_dir, exist_ok=True)
        path = os.path.join(job_dir, "keywords.txt")
        with open(path, "w", encoding="utf-8") as f:
            for kw in keywords:
                f.write(kw + "\n")
        return path

    @staticmethod
    def load_keywords_file(path: str) -> List[str]:
        """저장된 키워드 파일 로드"""
        if not path or not os.path.exists(path):
            return []
        with open(path, "r", encoding="utf-8") as f:
            return [line.rstrip("\n") for line in f if line.strip()]

    async def run(self, config: VolumeFilterConfig, keywords: List[str],
                  start_index: int = 0) -> dict:
        """키워드 리스트를 배치로 검색량 조회 → 임계치 이상만 수집.
        start_index > 0이면 해당 인덱스부터 재개.
        """
        job_id = config.job_id
        total = len(keywords)
        logger.info(
            f"[Filter {job_id}] 시작/재개: {total}개 (start={start_index}), "
            f"임계치 월 {config.min_volume}, 캐너리 {config.test_size}"
        )

        job = get_volume_filter_job(job_id)
        canary_evaluated = bool(job and job.get("canary_evaluated_at"))

        status_prefix = "재개 중" if start_index > 0 else "시작"
        update_volume_filter_job(
            job_id,
            status="running",
            started_at=(job.get("started_at") if job and job.get("started_at")
                        else datetime.now().isoformat()),
            should_pause=0,
            should_cancel=0,
            current_step=f"{status_prefix} - {start_index}/{total} 지점",
        )

        # 중복 제거 (재개 시엔 이미 deduped 된 상태지만 방어적으로)
        if start_index == 0:
            seen = set()
            unique_keywords = []
            for kw in keywords:
                norm = (kw or "").strip()
                if norm and norm not in seen:
                    seen.add(norm)
                    unique_keywords.append(norm)
            keywords = unique_keywords
            total = len(keywords)

        # 이미 처리된 양 (재개 시 그대로 사용)
        processed = start_index
        passed = (job.get("passed_count", 0) or 0) if start_index > 0 else 0
        failed_api = (job.get("failed_api_count", 0) or 0) if start_index > 0 else 0
        pending_results: List[dict] = []

        if total == 0:
            update_volume_filter_job(
                job_id, status="completed",
                completed_at=datetime.now().isoformat(),
                current_step="유효 키워드 없음",
            )
            return {"success": True, "total": 0, "passed": 0, "failed_api": 0}

        try:
            # 남은 범위에서 배치 시작
            remaining = keywords[start_index:]
            num_batches = (len(remaining) + HINT_BATCH_SIZE - 1) // HINT_BATCH_SIZE

            for batch_idx in range(num_batches):
                # 제어 플래그 체크
                if batch_idx % CONTROL_CHECK_EVERY == 0 or batch_idx == 0:
                    cur_job = get_volume_filter_job(job_id)
                    if cur_job:
                        if cur_job.get("should_cancel"):
                            if pending_results:
                                add_volume_filter_results(job_id, pending_results)
                                pending_results = []
                            update_volume_filter_job(
                                job_id, status="cancelled",
                                processed_count=processed,
                                passed_count=passed,
                                failed_api_count=failed_api,
                                completed_at=datetime.now().isoformat(),
                                current_step=f"취소됨: {processed}/{total}개 조회 ({passed}개 통과)",
                            )
                            logger.info(f"[Filter {job_id}] 사용자 취소")
                            return {"success": False, "cancelled": True,
                                    "processed": processed, "passed": passed}
                        if cur_job.get("should_pause"):
                            if pending_results:
                                add_volume_filter_results(job_id, pending_results)
                                pending_results = []
                            update_volume_filter_job(
                                job_id, status="paused",
                                processed_count=processed,
                                passed_count=passed,
                                failed_api_count=failed_api,
                                should_pause=0,  # 클리어
                                current_step=f"일시정지: {processed}/{total}개 조회 완료, {passed}개 통과",
                            )
                            logger.info(f"[Filter {job_id}] 사용자 일시정지 at {processed}")
                            return {"success": True, "paused": True,
                                    "processed": processed, "passed": passed}

                batch = remaining[
                    batch_idx * HINT_BATCH_SIZE : (batch_idx + 1) * HINT_BATCH_SIZE
                ]

                try:
                    volumes = await self.api.get_keywords_volume_batch(batch)
                except Exception as e:
                    logger.warning(f"[Filter {job_id}] batch API 실패: {e}")
                    volumes = {}
                    failed_api += len(batch)

                for kw in batch:
                    hit = volumes.get(kw)
                    if not hit:
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

                processed += len(batch)

                # 캐너리 평가 (딱 한 번)
                if (not canary_evaluated and config.test_size > 0
                        and processed >= config.test_size):
                    if pending_results:
                        add_volume_filter_results(job_id, pending_results)
                        pending_results = []

                    pass_rate = (passed / processed * 100) if processed > 0 else 0
                    logger.info(
                        f"[Filter {job_id}] 캐너리: {processed}개 중 {passed}개 통과 "
                        f"({pass_rate:.2f}%), 임계치 {config.min_pass_rate_pct}%"
                    )
                    update_volume_filter_job(
                        job_id,
                        processed_count=processed,
                        passed_count=passed,
                        failed_api_count=failed_api,
                        canary_evaluated_at=datetime.now().isoformat(),
                        canary_pass_rate=pass_rate,
                        canary_passed=1 if pass_rate >= config.min_pass_rate_pct else 0,
                    )
                    canary_evaluated = True

                    if pass_rate < config.min_pass_rate_pct:
                        # 자동 계속 여부
                        if not config.auto_continue_on_canary:
                            update_volume_filter_job(
                                job_id, status="canary_failed",
                                current_step=(
                                    f"캐너리 실패: 통과율 {pass_rate:.2f}% < 임계치 "
                                    f"{config.min_pass_rate_pct}%. '재개' 버튼으로 강제 진행 가능"
                                ),
                            )
                            logger.info(f"[Filter {job_id}] 캐너리 실패 → 중단")
                            return {"success": False, "canary_failed": True,
                                    "pass_rate": pass_rate, "processed": processed,
                                    "passed": passed}
                        else:
                            update_volume_filter_job(
                                job_id,
                                current_step=(
                                    f"캐너리 통과율 낮음 ({pass_rate:.2f}%) 지만 "
                                    f"자동 계속 설정됨"
                                ),
                            )
                    else:
                        update_volume_filter_job(
                            job_id,
                            current_step=(
                                f"✅ 캐너리 통과! 통과율 {pass_rate:.2f}% ≥ "
                                f"{config.min_pass_rate_pct}% - 나머지 자동 진행"
                            ),
                        )

                # DB flush
                if len(pending_results) >= DB_FLUSH_BATCH:
                    add_volume_filter_results(job_id, pending_results)
                    pending_results = []

                # 진행률 업데이트
                if batch_idx % PROGRESS_UPDATE_EVERY == 0 or batch_idx == num_batches - 1:
                    pct = int(processed / total * 100)
                    eta_sec = int((total - processed) * API_DELAY / HINT_BATCH_SIZE)
                    update_volume_filter_job(
                        job_id,
                        processed_count=processed,
                        passed_count=passed,
                        failed_api_count=failed_api,
                        current_step=(
                            f"{pct}% - {processed}/{total}개 조회, {passed}개 통과 "
                            f"(남은 시간 약 {eta_sec // 60}분 {eta_sec % 60}초)"
                        ),
                    )

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
                current_step=(
                    f"완료: {total}개 중 {passed}개가 검색량 "
                    f"{config.min_volume} 이상 (API 실패 {failed_api}개)"
                ),
            )
            logger.info(f"[Filter {job_id}] 완료: {passed}/{total} 통과")
            return {
                "success": True,
                "total": total,
                "passed": passed,
                "failed_api": failed_api,
            }
        except Exception as e:
            logger.exception(f"[Filter {job_id}] 치명적 오류")
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
