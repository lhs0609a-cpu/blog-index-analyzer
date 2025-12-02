-- 블로그 지수 측정 시스템 데이터베이스 초기화 스크립트

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users 테이블
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),

    -- 구독 정보
    subscription_tier VARCHAR(20) DEFAULT 'free',
    subscription_start TIMESTAMP,
    subscription_end TIMESTAMP,

    -- 사용량
    daily_analysis_limit INTEGER DEFAULT 3,
    daily_analysis_used INTEGER DEFAULT 0,
    last_reset_date DATE DEFAULT CURRENT_DATE,

    -- 계정 상태
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_subscription ON users(subscription_tier, subscription_end);

-- Blogs 테이블
CREATE TABLE IF NOT EXISTS blogs (
    id BIGSERIAL PRIMARY KEY,
    blog_id VARCHAR(50) UNIQUE NOT NULL,
    blog_url VARCHAR(255) NOT NULL,
    blog_name VARCHAR(100),
    description TEXT,

    -- 블로그 정보
    created_at TIMESTAMP,
    category VARCHAR(50),

    -- 통계 (최신 값)
    total_posts INTEGER DEFAULT 0,
    total_visitors INTEGER DEFAULT 0,
    neighbor_count INTEGER DEFAULT 0,
    is_influencer BOOLEAN DEFAULT FALSE,

    -- 분석 이력
    first_analyzed_at TIMESTAMP DEFAULT NOW(),
    last_analyzed_at TIMESTAMP,
    analysis_count INTEGER DEFAULT 0,

    -- 상태
    is_deleted BOOLEAN DEFAULT FALSE,
    is_private BOOLEAN DEFAULT FALSE,

    CONSTRAINT blog_id_format CHECK (blog_id ~ '^[a-zA-Z0-9_-]+$')
);

CREATE INDEX idx_blogs_blog_id ON blogs(blog_id);
CREATE INDEX idx_blogs_last_analyzed ON blogs(last_analyzed_at);
CREATE INDEX idx_blogs_influencer ON blogs(is_influencer) WHERE is_influencer = TRUE;

-- Blog Index Snapshots 테이블
CREATE TABLE IF NOT EXISTS blog_index_snapshots (
    id BIGSERIAL PRIMARY KEY,
    blog_id BIGINT REFERENCES blogs(id) ON DELETE CASCADE,
    measured_at TIMESTAMP DEFAULT NOW(),

    -- 종합 지수
    total_score DECIMAL(5,2) NOT NULL,
    level INTEGER CHECK (level BETWEEN 0 AND 11),
    grade VARCHAR(20),
    percentile DECIMAL(5,2),

    -- 카테고리별 점수
    trust_score DECIMAL(5,2),
    content_score DECIMAL(5,2),
    engagement_score DECIMAL(5,2),
    seo_score DECIMAL(5,2),
    traffic_score DECIMAL(5,2),

    -- 세부 지표 (JSONB)
    metrics JSONB,

    -- 경고 및 권장사항
    warnings JSONB,
    recommendations JSONB
);

CREATE INDEX idx_snapshots_blog_measured ON blog_index_snapshots(blog_id, measured_at DESC);
CREATE INDEX idx_snapshots_level ON blog_index_snapshots(level);
CREATE INDEX idx_snapshots_score ON blog_index_snapshots(total_score DESC);

-- Posts 테이블
CREATE TABLE IF NOT EXISTS posts (
    id BIGSERIAL PRIMARY KEY,
    blog_id BIGINT REFERENCES blogs(id) ON DELETE CASCADE,
    post_id VARCHAR(50) NOT NULL,
    post_url VARCHAR(500) NOT NULL,

    -- 기본 정보
    title VARCHAR(500),
    published_at TIMESTAMP,
    category VARCHAR(100),

    -- 콘텐츠 정보
    text_length INTEGER,
    word_count INTEGER,
    paragraph_count INTEGER,
    image_count INTEGER DEFAULT 0,
    video_count INTEGER DEFAULT 0,
    external_link_count INTEGER DEFAULT 0,

    -- 참여 지표
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    scrap_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,

    -- 품질 분석
    originality_score DECIMAL(5,2),
    readability_score DECIMAL(5,2),
    grammar_score DECIMAL(5,2),
    structure_score DECIMAL(5,2),
    keyword_density DECIMAL(5,2),
    ai_generated_probability DECIMAL(5,2),

    -- 분석 데이터
    analysis_data JSONB,

    -- 메타
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    analyzed_at TIMESTAMP,

    UNIQUE(blog_id, post_id)
);

CREATE INDEX idx_posts_blog_published ON posts(blog_id, published_at DESC);
CREATE INDEX idx_posts_post_id ON posts(post_id);
CREATE INDEX idx_posts_score ON posts(originality_score DESC, readability_score DESC);

-- Keyword Rankings 테이블
CREATE TABLE IF NOT EXISTS keyword_rankings (
    id BIGSERIAL PRIMARY KEY,
    blog_id BIGINT REFERENCES blogs(id) ON DELETE CASCADE,
    post_id BIGINT REFERENCES posts(id) ON DELETE CASCADE,
    keyword VARCHAR(200) NOT NULL,

    -- 순위 정보
    blog_tab_rank INTEGER,
    view_tab_rank INTEGER,
    integrated_rank INTEGER,

    -- 경쟁 정보
    total_results BIGINT,
    competition_level VARCHAR(20),

    checked_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rankings_blog_keyword ON keyword_rankings(blog_id, keyword);
CREATE INDEX idx_rankings_post_keyword ON keyword_rankings(post_id, keyword);
CREATE INDEX idx_rankings_checked ON keyword_rankings(checked_at DESC);
CREATE INDEX idx_rankings_latest ON keyword_rankings(blog_id, keyword, checked_at DESC);

-- Keyword Tracking 테이블
CREATE TABLE IF NOT EXISTS keyword_tracking (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    blog_id BIGINT REFERENCES blogs(id) ON DELETE CASCADE,
    keyword VARCHAR(200) NOT NULL,

    -- 추적 설정
    check_frequency VARCHAR(20) DEFAULT 'daily',
    is_active BOOLEAN DEFAULT TRUE,

    -- 알림 설정
    alert_on_rank_change BOOLEAN DEFAULT FALSE,
    alert_threshold INTEGER,

    created_at TIMESTAMP DEFAULT NOW(),
    last_checked_at TIMESTAMP,

    UNIQUE(user_id, blog_id, keyword)
);

CREATE INDEX idx_tracking_user ON keyword_tracking(user_id, is_active);
CREATE INDEX idx_tracking_blog ON keyword_tracking(blog_id, is_active);

-- User Blogs 테이블
CREATE TABLE IF NOT EXISTS user_blogs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    blog_id BIGINT REFERENCES blogs(id) ON DELETE CASCADE,

    -- 사용자 설정
    nickname VARCHAR(100),
    is_favorite BOOLEAN DEFAULT FALSE,
    is_owned BOOLEAN DEFAULT FALSE,

    -- 자동 분석 설정
    auto_analysis BOOLEAN DEFAULT FALSE,
    analysis_schedule VARCHAR(50),

    added_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(user_id, blog_id)
);

CREATE INDEX idx_user_blogs_user ON user_blogs(user_id);
CREATE INDEX idx_user_blogs_favorites ON user_blogs(user_id, is_favorite);

-- Analysis Jobs 테이블
CREATE TABLE IF NOT EXISTS analysis_jobs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    blog_id BIGINT REFERENCES blogs(id),

    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',

    -- 작업 정보
    parameters JSONB,
    result JSONB,

    -- 타이밍
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- 에러 정보
    error_message TEXT,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0
);

CREATE INDEX idx_jobs_user ON analysis_jobs(user_id, created_at DESC);
CREATE INDEX idx_jobs_status ON analysis_jobs(status, created_at);
CREATE INDEX idx_jobs_blog ON analysis_jobs(blog_id, created_at DESC);

-- 트리거: updated_at 자동 업데이트
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 샘플 데이터 (개발용)
INSERT INTO users (email, password_hash, name, subscription_tier) VALUES
('test@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5lW7bSm6hxKvO', 'Test User', 'free')
ON CONFLICT (email) DO NOTHING;

-- 완료 메시지
DO $$
BEGIN
    RAISE NOTICE '데이터베이스 초기화 완료!';
END $$;
