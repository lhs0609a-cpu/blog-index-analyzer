"""
Backup management API endpoints
백업 관리 API 엔드포인트
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import logging

from services.backup_service import (
    create_backup,
    export_to_json,
    get_backup_list,
    get_backup_status,
    restore_from_backup,
    cleanup_old_backups,
    cleanup_old_json_backups,
    get_disk_free_space_mb
)

router = APIRouter()
logger = logging.getLogger(__name__)


class BackupInfo(BaseModel):
    filename: str
    path: str
    size_mb: float
    created_at: str


class BackupStatusResponse(BaseModel):
    enabled: bool
    backup_count: int
    latest_backup: Optional[BackupInfo] = None
    backup_dir: str
    max_backups: int
    interval_hours: float
    disk_free_mb: Optional[float] = None
    json_backup_count: Optional[int] = None


class BackupResponse(BaseModel):
    success: bool
    message: str
    path: Optional[str] = None


@router.get("/status", response_model=BackupStatusResponse)
async def backup_status():
    """
    백업 상태 조회
    - 자동 백업 활성화 여부
    - 백업 개수
    - 최신 백업 정보
    - 디스크 공간
    """
    try:
        status = get_backup_status()
        status["disk_free_mb"] = get_disk_free_space_mb()
        return BackupStatusResponse(**status)
    except Exception as e:
        logger.error(f"Failed to get backup status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list", response_model=List[BackupInfo])
async def list_backups():
    """
    백업 목록 조회
    - 모든 백업 파일 목록
    - 파일 크기 및 생성 시간
    """
    try:
        backups = get_backup_list()
        return [BackupInfo(**b) for b in backups]
    except Exception as e:
        logger.error(f"Failed to list backups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create", response_model=BackupResponse)
async def create_manual_backup():
    """
    수동 백업 생성
    - 즉시 백업 생성
    """
    try:
        path = create_backup()
        if path:
            return BackupResponse(
                success=True,
                message="백업이 성공적으로 생성되었습니다",
                path=path
            )
        else:
            return BackupResponse(
                success=False,
                message="백업 생성에 실패했습니다"
            )
    except Exception as e:
        logger.error(f"Failed to create backup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/export-json", response_model=BackupResponse)
async def export_json_backup():
    """
    JSON 형식으로 내보내기
    - 학습 데이터를 JSON 파일로 내보내기
    - 외부 백업 또는 마이그레이션용
    """
    try:
        path = export_to_json()
        if path:
            return BackupResponse(
                success=True,
                message="JSON 내보내기가 완료되었습니다",
                path=path
            )
        else:
            return BackupResponse(
                success=False,
                message="JSON 내보내기에 실패했습니다"
            )
    except Exception as e:
        logger.error(f"Failed to export JSON: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/restore/{filename}", response_model=BackupResponse)
async def restore_backup(filename: str):
    """
    백업에서 복원
    - 지정된 백업 파일에서 데이터베이스 복원
    - 복원 전 현재 상태 백업
    """
    try:
        success = restore_from_backup(filename)
        if success:
            return BackupResponse(
                success=True,
                message=f"'{filename}'에서 복원이 완료되었습니다"
            )
        else:
            return BackupResponse(
                success=False,
                message=f"'{filename}' 복원에 실패했습니다"
            )
    except Exception as e:
        logger.error(f"Failed to restore backup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cleanup", response_model=BackupResponse)
async def cleanup_backups():
    """
    수동 백업 정리
    - 오래된 DB 백업 삭제
    - 오래된 JSON 백업 삭제
    - orphan journal 파일 삭제
    """
    try:
        before_space = get_disk_free_space_mb()
        cleanup_old_backups()
        after_space = get_disk_free_space_mb()
        freed = after_space - before_space if before_space > 0 and after_space > 0 else 0

        return BackupResponse(
            success=True,
            message=f"백업 정리 완료. {freed:.1f}MB 확보됨. 현재 여유 공간: {after_space:.1f}MB"
        )
    except Exception as e:
        logger.error(f"Failed to cleanup backups: {e}")
        raise HTTPException(status_code=500, detail=str(e))
