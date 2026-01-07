-- ================================================
-- Supabase PostgreSQL Schema for Blog Index Analyzer
-- Region: Korea (Seoul)
-- ================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- 1. USERS TABLE (핵심 사용자 정보)
-- ================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    name VARCHAR(100),
    blog_id VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE,
    is_premium_granted BOOLEAN DEFAULT FALSE,
    plan VARCHAR(20) DEFAULT 'free',
    subscription_expires_at TIMESTAMPTZ,
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMPTZ,
    memo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_plan ON users(plan);

-- ================================================
-- 2. SUBSCRIPTIONS TABLE (구독 정보)
-- ================================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_type VARCHAR(20) NOT NULL DEFAULT 'free',
    billing_cycle VARCHAR(20) DEFAULT 'monthly',
    status VARCHAR(20) DEFAULT 'active',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    payment_key TEXT,
    customer_key TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- ================================================
-- 3. PAYMENTS TABLE (결제 내역 - 매우 중요)
-- ================================================
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id INTEGER REFERENCES subscriptions(id),
    payment_key VARCHAR(255) UNIQUE,
    order_id VARCHAR(255) UNIQUE,
    amount INTEGER NOT NULL,
    currency VARCHAR(10) DEFAULT 'KRW',
    status VARCHAR(20) DEFAULT 'pending',
    payment_method VARCHAR(50),
    card_company VARCHAR(50),
    card_number VARCHAR(50),
    receipt_url TEXT,
    paid_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created ON payments(created_at DESC);

-- ================================================
-- 4. DAILY USAGE TABLE (사용량 추적)
-- ================================================
CREATE TABLE IF NOT EXISTS daily_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    keyword_searches INTEGER DEFAULT 0,
    blog_analyses INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

CREATE INDEX idx_daily_usage_user_date ON daily_usage(user_id, date);

-- ================================================
-- 5. GUEST USAGE TABLE (비회원 사용량)
-- ================================================
CREATE TABLE IF NOT EXISTS guest_usage (
    id SERIAL PRIMARY KEY,
    ip_address VARCHAR(50) NOT NULL,
    usage_date DATE NOT NULL,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ip_address, usage_date)
);

CREATE INDEX idx_guest_usage_ip_date ON guest_usage(ip_address, usage_date);

-- ================================================
-- 6. USER USAGE TABLE (회원 사용량)
-- ================================================
CREATE TABLE IF NOT EXISTS user_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    usage_date DATE NOT NULL,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, usage_date)
);

CREATE INDEX idx_user_usage_user_date ON user_usage(user_id, usage_date);

-- ================================================
-- 7. EXTRA CREDITS TABLE (추가 크레딧)
-- ================================================
CREATE TABLE IF NOT EXISTS extra_credits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credit_type VARCHAR(50) NOT NULL,
    amount INTEGER NOT NULL,
    remaining INTEGER NOT NULL,
    expires_at TIMESTAMPTZ,
    payment_id INTEGER REFERENCES payments(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_extra_credits_user ON extra_credits(user_id);

-- ================================================
-- 8. BLOGS TABLE (블로그 정보)
-- ================================================
CREATE TABLE IF NOT EXISTS blogs (
    id SERIAL PRIMARY KEY,
    blog_id VARCHAR(100) UNIQUE NOT NULL,
    blog_name VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_blogs_blog_id ON blogs(blog_id);

-- ================================================
-- 9. ANALYSIS HISTORY TABLE (분석 히스토리)
-- ================================================
CREATE TABLE IF NOT EXISTS analysis_history (
    id SERIAL PRIMARY KEY,
    blog_id VARCHAR(100) NOT NULL,
    analysis_type VARCHAR(50),
    score REAL,
    level INTEGER,
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analysis_blog_id ON analysis_history(blog_id);
CREATE INDEX idx_analysis_created ON analysis_history(created_at DESC);

-- ================================================
-- 10. USER POINTS TABLE (포인트 시스템)
-- ================================================
CREATE TABLE IF NOT EXISTS user_points (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_points INTEGER DEFAULT 0,
    weekly_points INTEGER DEFAULT 0,
    monthly_points INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    level_name VARCHAR(50) DEFAULT 'Bronze',
    streak_days INTEGER DEFAULT 0,
    last_activity_date DATE,
    top_ranking_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_points_weekly ON user_points(weekly_points DESC);
CREATE INDEX idx_user_points_monthly ON user_points(monthly_points DESC);

-- ================================================
-- 11. POINT HISTORY TABLE (포인트 이력)
-- ================================================
CREATE TABLE IF NOT EXISTS point_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_point_history_user ON point_history(user_id);
CREATE INDEX idx_point_history_created ON point_history(created_at DESC);

-- ================================================
-- 12. ACTIVITY FEED TABLE (활동 피드)
-- ================================================
CREATE TABLE IF NOT EXISTS activity_feed (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(100),
    activity_type VARCHAR(50) NOT NULL,
    title TEXT,
    description TEXT,
    metadata JSONB,
    points_earned INTEGER DEFAULT 0,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_feed_created ON activity_feed(created_at DESC);
CREATE INDEX idx_activity_feed_public ON activity_feed(is_public, created_at DESC);

-- ================================================
-- 13. POSTS TABLE (커뮤니티 게시판)
-- ================================================
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(100),
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'free',
    tags JSONB,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_posts_category ON posts(category);
CREATE INDEX idx_posts_created ON posts(created_at DESC);

-- ================================================
-- 14. POST LIKES TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS post_likes (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

-- ================================================
-- 15. POST COMMENTS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS post_comments (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(100),
    content TEXT NOT NULL,
    parent_id INTEGER REFERENCES post_comments(id),
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_post_comments_post ON post_comments(post_id);

-- ================================================
-- 16. KEYWORD TRENDS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS keyword_trends (
    id SERIAL PRIMARY KEY,
    keyword VARCHAR(100) NOT NULL,
    search_count INTEGER DEFAULT 1,
    user_count INTEGER DEFAULT 1,
    trend_score REAL DEFAULT 0,
    prev_trend_score REAL DEFAULT 0,
    trend_change REAL DEFAULT 0,
    is_hot BOOLEAN DEFAULT FALSE,
    recommended_by INTEGER REFERENCES users(id),
    recommendation_reason TEXT,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(keyword, date)
);

CREATE INDEX idx_keyword_trends_date ON keyword_trends(date);

-- ================================================
-- 17. RANKING SUCCESS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS ranking_success (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(100),
    blog_id VARCHAR(100),
    keyword VARCHAR(100) NOT NULL,
    prev_rank INTEGER,
    new_rank INTEGER NOT NULL,
    post_url TEXT,
    is_new_entry BOOLEAN DEFAULT FALSE,
    consecutive_days INTEGER DEFAULT 1,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ranking_success_created ON ranking_success(created_at DESC);

-- ================================================
-- 18. INSIGHTS TABLE (인사이트 게시판)
-- ================================================
CREATE TABLE IF NOT EXISTS insights (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_level VARCHAR(50),
    content TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    likes INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    is_anonymous BOOLEAN DEFAULT TRUE,
    is_approved BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_insights_created ON insights(created_at DESC);

-- ================================================
-- 19. INSIGHT LIKES TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS insight_likes (
    id SERIAL PRIMARY KEY,
    insight_id INTEGER NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(insight_id, user_id)
);

-- ================================================
-- 20. INSIGHT COMMENTS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS insight_comments (
    id SERIAL PRIMARY KEY,
    insight_id INTEGER NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_level VARCHAR(50),
    content TEXT NOT NULL,
    is_anonymous BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_blogs_updated_at BEFORE UPDATE ON blogs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_points_updated_at BEFORE UPDATE ON user_points
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_usage_updated_at BEFORE UPDATE ON daily_usage
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- ROW LEVEL SECURITY (RLS)
-- Supabase 권장 보안 설정
-- ================================================

-- Enable RLS on sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid()::text = id::text);

-- Service role can do everything (for backend API)
CREATE POLICY "Service role full access" ON users
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access payments" ON payments
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access subscriptions" ON subscriptions
    FOR ALL USING (auth.role() = 'service_role');

-- ================================================
-- COMMENTS
-- ================================================
COMMENT ON TABLE users IS '사용자 계정 정보';
COMMENT ON TABLE payments IS '결제 내역 (매우 중요 - 백업 필수)';
COMMENT ON TABLE subscriptions IS '구독 정보';
COMMENT ON TABLE daily_usage IS '일일 사용량 추적';
COMMENT ON TABLE posts IS '커뮤니티 게시판';
