"""
Automatic backup service for learning data persistence
데이터 영구 보존을 위한 자동 백업 서비스
"""
import os
import json
import shutil
import sqlite3
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import threading
import time
import logging

logger = logging.getLogger(__name__)

# Backup configuration
# Windows 로컬 개발환경에서는 ./data 사용
import sys
if sys.platform == "win32":
    BACKUP_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "backups")
    DATABASE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "blog_analyzer.db")
else:
    BACKUP_DIR = "/data/backups"
    DATABASE_PATH = "/data/blog_analyzer.db"
MAX_BACKUPS = 8  # 16시간 분량 (2시간마다 백업) - 디스크 사용량 감소
MAX_JSON_BACKUPS = 2  # JSON 백업은 2개만 유지 - 디스크 사용량 감소
BACKUP_INTERVAL_SECONDS = 7200  # 2시간마다 (리소스 절약)
DISK_WARNING_THRESHOLD_MB = 100  # 100MB 이하면 경고


def ensure_backup_dir():
    """백업 디렉토리 생성"""
    os.makedirs(BACKUP_DIR, exist_ok=True)


def create_backup() -> Optional[str]:
    """
    데이터베이스 백업 생성
    Returns: 백업 파일 경로 또는 None
    """
    try:
        ensure_backup_dir()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(BACKUP_DIR, f"backup_{timestamp}.db")

        # SQLite 안전한 백업 (VACUUM INTO 사용)
        if os.path.exists(DATABASE_PATH):
            conn = sqlite3.connect(DATABASE_PATH)
            backup_conn = sqlite3.connect(backup_path)
            conn.backup(backup_conn)
            backup_conn.close()
            conn.close()

            logger.info(f"Backup created: {backup_path}")
            return backup_path
        else:
            logger.warning(f"Database not found: {DATABASE_PATH}")
            return None

    except Exception as e:
        logger.error(f"Backup failed: {e}")
        return None


def get_disk_free_space_mb() -> float:
    """백업 디렉토리의 남은 디스크 공간 (MB)"""
    try:
        if sys.platform == "win32":
            import ctypes
            free_bytes = ctypes.c_ulonglong(0)
            ctypes.windll.kernel32.GetDiskFreeSpaceExW(
                ctypes.c_wchar_p(BACKUP_DIR), None, None, ctypes.pointer(free_bytes)
            )
            return free_bytes.value / (1024 * 1024)
        else:
            stat = os.statvfs(BACKUP_DIR)
            return (stat.f_bavail * stat.f_frsize) / (1024 * 1024)
    except Exception as e:
        logger.error(f"Failed to get disk space: {e}")
        return -1


def cleanup_old_backups():
    """오래된 백업 파일 정리 (MAX_BACKUPS 유지)"""
    try:
        ensure_backup_dir()

        # 1. DB 백업 파일 정리
        db_backups = sorted([
            f for f in os.listdir(BACKUP_DIR)
            if f.startswith("backup_") and f.endswith(".db")
        ])

        while len(db_backups) > MAX_BACKUPS:
            old_backup = db_backups.pop(0)
            old_path = os.path.join(BACKUP_DIR, old_backup)
            try:
                os.remove(old_path)
                logger.info(f"Removed old backup: {old_backup}")
            except Exception as e:
                logger.warning(f"Failed to remove {old_backup}: {e}")

        # 2. DB Journal 파일 정리 (backup과 쌍이 없는 것들 삭제)
        for f in os.listdir(BACKUP_DIR):
            if f.endswith(".db-journal"):
                db_name = f.replace("-journal", "")
                if db_name not in db_backups:
                    try:
                        os.remove(os.path.join(BACKUP_DIR, f))
                        logger.info(f"Removed orphan journal: {f}")
                    except Exception as e:
                        logger.warning(f"Failed to remove journal {f}: {e}")

        # 3. JSON 백업 파일 정리 (MAX_JSON_BACKUPS 유지)
        cleanup_old_json_backups()

        # 4. 디스크 공간 체크
        free_space = get_disk_free_space_mb()
        if 0 < free_space < DISK_WARNING_THRESHOLD_MB:
            logger.warning(f"⚠️ Low disk space: {free_space:.1f}MB remaining")
            # 긴급 정리: 추가로 백업 삭제
            emergency_cleanup()

    except Exception as e:
        logger.error(f"Cleanup failed: {e}")


def cleanup_old_json_backups():
    """오래된 JSON 백업 파일 정리 (MAX_JSON_BACKUPS 유지)"""
    try:
        ensure_backup_dir()

        json_backups = sorted([
            f for f in os.listdir(BACKUP_DIR)
            if f.startswith("learning_data_") and f.endswith(".json")
        ])

        while len(json_backups) > MAX_JSON_BACKUPS:
            old_json = json_backups.pop(0)
            old_path = os.path.join(BACKUP_DIR, old_json)
            try:
                os.remove(old_path)
                logger.info(f"Removed old JSON backup: {old_json}")
            except Exception as e:
                logger.warning(f"Failed to remove JSON {old_json}: {e}")

    except Exception as e:
        logger.error(f"JSON cleanup failed: {e}")


def emergency_cleanup():
    """긴급 디스크 공간 확보 - 백업 수를 절반으로 줄임"""
    try:
        logger.warning("🚨 Emergency cleanup triggered due to low disk space")

        # DB 백업을 절반으로
        db_backups = sorted([
            f for f in os.listdir(BACKUP_DIR)
            if f.startswith("backup_") and f.endswith(".db")
        ])

        target_count = max(6, len(db_backups) // 2)  # 최소 6개는 유지
        while len(db_backups) > target_count:
            old_backup = db_backups.pop(0)
            try:
                os.remove(os.path.join(BACKUP_DIR, old_backup))
                # 관련 journal도 삭제
                journal_path = os.path.join(BACKUP_DIR, old_backup + "-journal")
                if os.path.exists(journal_path):
                    os.remove(journal_path)
                logger.info(f"Emergency removed: {old_backup}")
            except Exception:
                pass

        # JSON 백업을 2개로
        json_backups = sorted([
            f for f in os.listdir(BACKUP_DIR)
            if f.startswith("learning_data_") and f.endswith(".json")
        ])

        while len(json_backups) > 2:
            old_json = json_backups.pop(0)
            try:
                os.remove(os.path.join(BACKUP_DIR, old_json))
                logger.info(f"Emergency removed JSON: {old_json}")
            except Exception:
                pass

        free_space = get_disk_free_space_mb()
        logger.info(f"After emergency cleanup: {free_space:.1f}MB free")

    except Exception as e:
        logger.error(f"Emergency cleanup failed: {e}")


def export_to_json() -> Optional[str]:
    """
    학습 데이터를 JSON으로 내보내기 (외부 백업용)
    Returns: JSON 파일 경로
    """
    try:
        ensure_backup_dir()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        json_path = os.path.join(BACKUP_DIR, f"learning_data_{timestamp}.json")

        if not os.path.exists(DATABASE_PATH):
            return None

        conn = sqlite3.connect(DATABASE_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        export_data = {
            "exported_at": datetime.now().isoformat(),
            "version": "1.0",
            "data": {}
        }

        # 학습 샘플 내보내기
        cursor.execute("SELECT * FROM learning_samples ORDER BY collected_at DESC")
        export_data["data"]["learning_samples"] = [dict(row) for row in cursor.fetchall()]

        # 학습 세션 내보내기
        cursor.execute("SELECT * FROM learning_sessions ORDER BY started_at DESC")
        export_data["data"]["learning_sessions"] = [dict(row) for row in cursor.fetchall()]

        # 가중치 히스토리 내보내기
        cursor.execute("SELECT * FROM weight_history ORDER BY created_at DESC")
        export_data["data"]["weight_history"] = [dict(row) for row in cursor.fetchall()]

        # 현재 가중치 내보내기
        cursor.execute("SELECT * FROM current_weights")
        export_data["data"]["current_weights"] = [dict(row) for row in cursor.fetchall()]

        conn.close()

        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2, default=str)

        logger.info(f"JSON export created: {json_path}")

        # 오래된 JSON 백업 정리
        cleanup_old_json_backups()

        return json_path

    except Exception as e:
        logger.error(f"JSON export failed: {e}")
        return None


def import_from_json(json_path: str) -> bool:
    """
    JSON에서 학습 데이터 복원
    """
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            import_data = json.load(f)

        conn = sqlite3.connect(DATABASE_PATH)
        cursor = conn.cursor()

        # 학습 샘플 복원
        samples = import_data.get("data", {}).get("learning_samples", [])
        for sample in samples:
            cursor.execute("""
                INSERT OR IGNORE INTO learning_samples (
                    id, keyword, blog_id, actual_rank, predicted_score,
                    c_rank_score, dia_score, post_count, neighbor_count,
                    blog_age_days, recent_posts_30d, visitor_count, collected_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                sample.get('id'),
                sample.get('keyword'),
                sample.get('blog_id'),
                sample.get('actual_rank'),
                sample.get('predicted_score'),
                sample.get('c_rank_score'),
                sample.get('dia_score'),
                sample.get('post_count'),
                sample.get('neighbor_count'),
                sample.get('blog_age_days'),
                sample.get('recent_posts_30d'),
                sample.get('visitor_count'),
                sample.get('collected_at')
            ))

        # 현재 가중치 복원
        weights = import_data.get("data", {}).get("current_weights", [])
        for w in weights:
            cursor.execute("""
                INSERT OR REPLACE INTO current_weights (id, weights, updated_at)
                VALUES (?, ?, ?)
            """, (w.get('id', 1), w.get('weights'), w.get('updated_at')))

        conn.commit()
        conn.close()

        logger.info(f"Data imported from: {json_path}")
        return True

    except Exception as e:
        logger.error(f"Import failed: {e}")
        return False


def get_backup_list() -> List[Dict]:
    """사용 가능한 백업 목록 조회"""
    try:
        ensure_backup_dir()
        backups = []

        for f in sorted(os.listdir(BACKUP_DIR), reverse=True):
            if f.startswith("backup_") and f.endswith(".db"):
                path = os.path.join(BACKUP_DIR, f)
                stat = os.stat(path)
                backups.append({
                    "filename": f,
                    "path": path,
                    "size_mb": round(stat.st_size / (1024 * 1024), 2),
                    "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
                })

        return backups

    except Exception as e:
        logger.error(f"Failed to list backups: {e}")
        return []


def restore_from_backup(backup_filename: str) -> bool:
    """
    백업에서 데이터베이스 복원
    """
    try:
        backup_path = os.path.join(BACKUP_DIR, backup_filename)

        if not os.path.exists(backup_path):
            logger.error(f"Backup not found: {backup_path}")
            return False

        # 현재 DB 백업
        if os.path.exists(DATABASE_PATH):
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            shutil.copy(DATABASE_PATH, f"{DATABASE_PATH}.pre_restore_{timestamp}")

        # 백업에서 복원
        shutil.copy(backup_path, DATABASE_PATH)
        logger.info(f"Restored from: {backup_filename}")
        return True

    except Exception as e:
        logger.error(f"Restore failed: {e}")
        return False


def get_backup_status() -> Dict:
    """백업 상태 조회"""
    try:
        backups = get_backup_list()
        latest = backups[0] if backups else None

        return {
            "enabled": True,
            "backup_count": len(backups),
            "latest_backup": latest,
            "backup_dir": BACKUP_DIR,
            "max_backups": MAX_BACKUPS,
            "interval_hours": BACKUP_INTERVAL_SECONDS / 3600
        }

    except Exception as e:
        return {
            "enabled": False,
            "error": str(e)
        }


class BackupScheduler:
    """자동 백업 스케줄러"""

    def __init__(self):
        self.running = False
        self.thread = None

    def start(self):
        """백업 스케줄러 시작"""
        if self.running:
            return

        self.running = True
        self.thread = threading.Thread(target=self._run_scheduler, daemon=True)
        self.thread.start()
        logger.info("Backup scheduler started")

    def stop(self):
        """백업 스케줄러 중지 (즉시)"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=2)  # 빠른 종료
        logger.info("Backup scheduler stopped")

    def _run_scheduler(self):
        """스케줄러 메인 루프"""
        # 시작 시 즉시 백업 생성
        create_backup()
        cleanup_old_backups()

        while self.running:
            time.sleep(BACKUP_INTERVAL_SECONDS)
            if self.running:
                create_backup()
                cleanup_old_backups()
                # 매 6시간마다 JSON 내보내기
                hour = datetime.now().hour
                if hour % 6 == 0:
                    export_to_json()


# 전역 스케줄러 인스턴스
backup_scheduler = BackupScheduler()
