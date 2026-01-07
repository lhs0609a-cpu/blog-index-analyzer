"""
SQLite → Supabase 데이터 마이그레이션 스크립트

사용법:
1. .env 파일에 SUPABASE_URL, SUPABASE_KEY 설정
2. python scripts/migrate_sqlite_to_supabase.py

주의:
- 마이그레이션 전 Supabase에서 supabase_schema.sql 실행 필요
- 기존 데이터가 있으면 충돌할 수 있으므로 주의
"""
import sqlite3
import json
import os
import sys
from datetime import datetime
from typing import Dict, List, Any, Optional

# 프로젝트 루트를 path에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

# Supabase 클라이언트
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ SUPABASE_URL, SUPABASE_KEY 환경변수를 설정하세요!")
    print("   .env 파일을 확인하세요.")
    sys.exit(1)

try:
    from supabase import create_client, Client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print(f"✅ Supabase 연결 성공: {SUPABASE_URL}")
except ImportError:
    print("❌ supabase-py가 설치되지 않았습니다.")
    print("   pip install supabase")
    sys.exit(1)


# SQLite 데이터베이스 경로
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

SQLITE_DATABASES = {
    "main": os.path.join(DATA_DIR, "blog_analyzer.db"),
    "subscription": os.path.join(DATA_DIR, "subscription.db"),
    "community": os.path.join(DATA_DIR, "community.db"),
}


def get_sqlite_connection(db_path: str):
    """SQLite 연결"""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def get_table_data(db_path: str, table_name: str) -> List[Dict]:
    """테이블 데이터 조회"""
    if not os.path.exists(db_path):
        print(f"⚠️ 데이터베이스 없음: {db_path}")
        return []

    conn = get_sqlite_connection(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute(f"SELECT * FROM {table_name}")
        columns = [description[0] for description in cursor.description]
        rows = cursor.fetchall()

        data = []
        for row in rows:
            row_dict = {}
            for i, col in enumerate(columns):
                value = row[i]
                # JSON 문자열 처리
                if isinstance(value, str) and (value.startswith('[') or value.startswith('{')):
                    try:
                        value = json.loads(value)
                    except:
                        pass
                row_dict[col] = value
            data.append(row_dict)

        return data
    except sqlite3.OperationalError as e:
        print(f"⚠️ 테이블 조회 실패 ({table_name}): {e}")
        return []
    finally:
        conn.close()


def migrate_users():
    """users 테이블 마이그레이션"""
    print("\n📦 Users 테이블 마이그레이션 중...")

    data = get_table_data(SQLITE_DATABASES["main"], "users")
    if not data:
        print("   - 데이터 없음")
        return

    migrated = 0
    errors = 0

    for row in data:
        try:
            # id 필드 제외 (Supabase에서 자동 생성)
            insert_data = {k: v for k, v in row.items() if k != 'id'}

            # 타임스탬프 변환
            for field in ['created_at', 'updated_at', 'subscription_expires_at', 'granted_at']:
                if field in insert_data and insert_data[field]:
                    # ISO 형식으로 변환
                    try:
                        if isinstance(insert_data[field], str):
                            dt = datetime.fromisoformat(insert_data[field].replace('Z', '+00:00'))
                            insert_data[field] = dt.isoformat()
                    except:
                        pass

            response = supabase.table("users").insert(insert_data).execute()
            migrated += 1
        except Exception as e:
            print(f"   ❌ 사용자 마이그레이션 실패 (email: {row.get('email')}): {e}")
            errors += 1

    print(f"   ✅ Users: {migrated}건 성공, {errors}건 실패")


def migrate_payments():
    """payments 테이블 마이그레이션 (매우 중요!)"""
    print("\n💳 Payments 테이블 마이그레이션 중...")

    data = get_table_data(SQLITE_DATABASES["subscription"], "payments")
    if not data:
        print("   - 데이터 없음")
        return

    migrated = 0
    errors = 0

    for row in data:
        try:
            insert_data = {k: v for k, v in row.items() if k != 'id'}

            # 사용자 ID 매핑 필요할 수 있음
            # TODO: 기존 user_id와 새로운 user_id 매핑 테이블 필요

            response = supabase.table("payments").insert(insert_data).execute()
            migrated += 1
        except Exception as e:
            print(f"   ❌ 결제 마이그레이션 실패 (order_id: {row.get('order_id')}): {e}")
            errors += 1

    print(f"   ✅ Payments: {migrated}건 성공, {errors}건 실패")


def migrate_subscriptions():
    """subscriptions 테이블 마이그레이션"""
    print("\n📋 Subscriptions 테이블 마이그레이션 중...")

    data = get_table_data(SQLITE_DATABASES["subscription"], "subscriptions")
    if not data:
        print("   - 데이터 없음")
        return

    migrated = 0
    errors = 0

    for row in data:
        try:
            insert_data = {k: v for k, v in row.items() if k != 'id'}
            response = supabase.table("subscriptions").insert(insert_data).execute()
            migrated += 1
        except Exception as e:
            print(f"   ❌ 구독 마이그레이션 실패: {e}")
            errors += 1

    print(f"   ✅ Subscriptions: {migrated}건 성공, {errors}건 실패")


def migrate_daily_usage():
    """daily_usage 테이블 마이그레이션"""
    print("\n📊 Daily Usage 테이블 마이그레이션 중...")

    data = get_table_data(SQLITE_DATABASES["subscription"], "daily_usage")
    if not data:
        print("   - 데이터 없음")
        return

    # 배치 삽입
    batch_size = 100
    migrated = 0

    for i in range(0, len(data), batch_size):
        batch = data[i:i + batch_size]
        batch_clean = [{k: v for k, v in row.items() if k != 'id'} for row in batch]

        try:
            response = supabase.table("daily_usage").insert(batch_clean).execute()
            migrated += len(batch)
        except Exception as e:
            print(f"   ❌ 배치 마이그레이션 실패: {e}")

    print(f"   ✅ Daily Usage: {migrated}건 성공")


def migrate_posts():
    """posts (커뮤니티 게시판) 마이그레이션"""
    print("\n📝 Posts 테이블 마이그레이션 중...")

    data = get_table_data(SQLITE_DATABASES["community"], "posts")
    if not data:
        print("   - 데이터 없음")
        return

    migrated = 0
    errors = 0

    for row in data:
        try:
            insert_data = {k: v for k, v in row.items() if k != 'id'}
            response = supabase.table("posts").insert(insert_data).execute()
            migrated += 1
        except Exception as e:
            print(f"   ❌ 게시글 마이그레이션 실패: {e}")
            errors += 1

    print(f"   ✅ Posts: {migrated}건 성공, {errors}건 실패")


def migrate_user_points():
    """user_points 테이블 마이그레이션"""
    print("\n🏆 User Points 테이블 마이그레이션 중...")

    data = get_table_data(SQLITE_DATABASES["community"], "user_points")
    if not data:
        print("   - 데이터 없음")
        return

    migrated = 0
    errors = 0

    for row in data:
        try:
            insert_data = dict(row)
            response = supabase.table("user_points").insert(insert_data).execute()
            migrated += 1
        except Exception as e:
            print(f"   ❌ 포인트 마이그레이션 실패: {e}")
            errors += 1

    print(f"   ✅ User Points: {migrated}건 성공, {errors}건 실패")


def export_to_json():
    """모든 데이터를 JSON으로 내보내기 (백업용)"""
    print("\n💾 JSON 백업 생성 중...")

    backup_dir = os.path.join(DATA_DIR, "backup_for_migration")
    os.makedirs(backup_dir, exist_ok=True)

    tables_to_export = [
        ("main", "users"),
        ("main", "blogs"),
        ("main", "analysis_history"),
        ("subscription", "subscriptions"),
        ("subscription", "payments"),
        ("subscription", "daily_usage"),
        ("subscription", "extra_credits"),
        ("community", "posts"),
        ("community", "post_comments"),
        ("community", "post_likes"),
        ("community", "user_points"),
        ("community", "point_history"),
        ("community", "activity_feed"),
        ("community", "insights"),
        ("community", "keyword_trends"),
        ("community", "ranking_success"),
    ]

    for db_key, table_name in tables_to_export:
        db_path = SQLITE_DATABASES.get(db_key)
        if db_path:
            data = get_table_data(db_path, table_name)
            if data:
                output_file = os.path.join(backup_dir, f"{table_name}.json")
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2, default=str)
                print(f"   ✅ {table_name}: {len(data)}건 백업")

    print(f"\n📁 백업 위치: {backup_dir}")


def main():
    print("=" * 60)
    print("SQLite → Supabase 데이터 마이그레이션")
    print("=" * 60)

    # 1. 먼저 JSON 백업 생성
    export_to_json()

    print("\n" + "=" * 60)
    print("Supabase로 데이터 마이그레이션 시작")
    print("=" * 60)

    # 마이그레이션 순서 (외래 키 의존성 고려)
    # 1. users (기본)
    migrate_users()

    # 2. payments, subscriptions (users에 의존)
    migrate_payments()
    migrate_subscriptions()

    # 3. daily_usage
    migrate_daily_usage()

    # 4. community 관련
    migrate_posts()
    migrate_user_points()

    print("\n" + "=" * 60)
    print("✅ 마이그레이션 완료!")
    print("=" * 60)
    print("\n⚠️ 주의사항:")
    print("   1. Supabase 대시보드에서 데이터 확인")
    print("   2. user_id 매핑이 올바른지 확인 (기존 ID와 새 ID가 다를 수 있음)")
    print("   3. 외래 키 제약조건 오류가 있으면 수동 조정 필요")


if __name__ == "__main__":
    main()
