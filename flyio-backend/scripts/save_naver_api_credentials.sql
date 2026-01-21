-- Supabase에서 실행할 SQL
-- API 자격증명을 안전하게 저장하는 테이블 생성

-- 1. 시스템 설정 테이블 생성 (없는 경우)
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    is_secret BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. RLS (Row Level Security) 활성화 - 보안 강화
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- 3. 관리자만 접근 가능하도록 정책 설정
CREATE POLICY "Only admins can view settings" ON system_settings
    FOR SELECT USING (auth.role() = 'service_role');

CREATE POLICY "Only admins can insert settings" ON system_settings
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Only admins can update settings" ON system_settings
    FOR UPDATE USING (auth.role() = 'service_role');

-- 4. 네이버 광고 API 자격증명 저장
INSERT INTO system_settings (key, value, description, is_secret) VALUES
('NAVER_AD_CUSTOMER_ID', '3808925', '네이버 검색광고 고객 ID', true),
('NAVER_AD_API_KEY', '010000000036c1b0148b54cd9fa4b4a5bc0032bfe3e2ee3c152c93353471fc27cee3a600c7', '네이버 검색광고 API 액세스 라이선스', true),
('NAVER_AD_SECRET_KEY', 'AQAAAAA2wbAUi1TNn6S0pbwAMr/jxOokQ7jhJaBg0LTOjOECog==', '네이버 검색광고 API 비밀키', true)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = NOW();

-- 확인 쿼리 (마스킹된 형태로 출력)
SELECT
    key,
    CASE WHEN is_secret THEN LEFT(value, 10) || '...' ELSE value END as masked_value,
    description,
    updated_at
FROM system_settings
WHERE key LIKE 'NAVER_AD_%';
