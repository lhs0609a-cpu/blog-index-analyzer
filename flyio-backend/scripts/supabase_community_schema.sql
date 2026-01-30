-- Supabase Community Tables Schema
-- 커뮤니티 기능을 위한 테이블 스키마
-- Supabase SQL Editor에서 실행하세요

-- ============ 1. 게시글 테이블 ============
CREATE TABLE IF NOT EXISTS posts (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    user_name VARCHAR(100),
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'free',
    tags JSONB DEFAULT '[]',
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_deleted ON posts(is_deleted);

-- ============ 2. 게시글 좋아요 테이블 ============
CREATE TABLE IF NOT EXISTS post_likes (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes(user_id);

-- ============ 3. 게시글 댓글 테이블 ============
CREATE TABLE IF NOT EXISTS post_comments (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    user_name VARCHAR(100),
    content TEXT NOT NULL,
    parent_id BIGINT REFERENCES post_comments(id) ON DELETE CASCADE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON post_comments(parent_id);

-- ============ 4. 사용자 포인트 테이블 ============
CREATE TABLE IF NOT EXISTS user_points (
    user_id INTEGER PRIMARY KEY,
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

CREATE INDEX IF NOT EXISTS idx_user_points_weekly ON user_points(weekly_points DESC);
CREATE INDEX IF NOT EXISTS idx_user_points_monthly ON user_points(monthly_points DESC);
CREATE INDEX IF NOT EXISTS idx_user_points_total ON user_points(total_points DESC);

-- ============ 5. 포인트 이력 테이블 ============
CREATE TABLE IF NOT EXISTS point_history (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    points INTEGER NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_point_history_user ON point_history(user_id);
CREATE INDEX IF NOT EXISTS idx_point_history_created ON point_history(created_at);

-- ============ 6. 활동 피드 테이블 ============
CREATE TABLE IF NOT EXISTS activity_feed (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    user_name VARCHAR(100),
    activity_type VARCHAR(50) NOT NULL,
    title TEXT,
    description TEXT,
    metadata JSONB,
    points_earned INTEGER DEFAULT 0,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_feed_created ON activity_feed(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_feed_public ON activity_feed(is_public, created_at DESC);

-- ============ 7. 키워드 트렌드 테이블 ============
CREATE TABLE IF NOT EXISTS keyword_trends (
    id BIGSERIAL PRIMARY KEY,
    keyword VARCHAR(100) NOT NULL,
    search_count INTEGER DEFAULT 1,
    user_count INTEGER DEFAULT 1,
    trend_score REAL DEFAULT 0,
    prev_trend_score REAL DEFAULT 0,
    trend_change REAL DEFAULT 0,
    is_hot BOOLEAN DEFAULT FALSE,
    recommended_by INTEGER,
    recommendation_reason TEXT,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(keyword, date)
);

CREATE INDEX IF NOT EXISTS idx_keyword_trends_date ON keyword_trends(date);
CREATE INDEX IF NOT EXISTS idx_keyword_trends_score ON keyword_trends(trend_score DESC);

-- ============ 8. 상위노출 성공 기록 테이블 ============
CREATE TABLE IF NOT EXISTS ranking_success (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_ranking_success_created ON ranking_success(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ranking_success_user ON ranking_success(user_id);

-- ============ 9. 인사이트 게시판 테이블 ============
CREATE TABLE IF NOT EXISTS insights (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    user_level VARCHAR(50),
    content TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    likes INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    is_anonymous BOOLEAN DEFAULT TRUE,
    is_approved BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insights_created ON insights(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insights_category ON insights(category);

-- ============ 10. 인사이트 댓글 테이블 ============
CREATE TABLE IF NOT EXISTS insight_comments (
    id BIGSERIAL PRIMARY KEY,
    insight_id BIGINT NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    user_level VARCHAR(50),
    content TEXT NOT NULL,
    is_anonymous BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insight_comments_insight ON insight_comments(insight_id);

-- ============ 11. 인사이트 좋아요 테이블 ============
CREATE TABLE IF NOT EXISTS insight_likes (
    id BIGSERIAL PRIMARY KEY,
    insight_id BIGINT NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(insight_id, user_id)
);

-- ============ RLS (Row Level Security) 정책 ============
-- 필요시 활성화

-- ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

-- ============ 트리거: updated_at 자동 업데이트 ============
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- posts 테이블에 트리거 적용
DROP TRIGGER IF EXISTS update_posts_updated_at ON posts;
CREATE TRIGGER update_posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- user_points 테이블에 트리거 적용
DROP TRIGGER IF EXISTS update_user_points_updated_at ON user_points;
CREATE TRIGGER update_user_points_updated_at
    BEFORE UPDATE ON user_points
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============ 유용한 함수들 ============

-- 게시글 좋아요 토글 함수
CREATE OR REPLACE FUNCTION toggle_post_like(p_post_id BIGINT, p_user_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    v_exists BOOLEAN;
    v_new_likes INTEGER;
BEGIN
    -- 이미 좋아요 했는지 확인
    SELECT EXISTS(SELECT 1 FROM post_likes WHERE post_id = p_post_id AND user_id = p_user_id) INTO v_exists;

    IF v_exists THEN
        -- 좋아요 취소
        DELETE FROM post_likes WHERE post_id = p_post_id AND user_id = p_user_id;
        UPDATE posts SET likes = likes - 1 WHERE id = p_post_id RETURNING likes INTO v_new_likes;
        RETURN jsonb_build_object('liked', false, 'likes', v_new_likes);
    ELSE
        -- 좋아요
        INSERT INTO post_likes (post_id, user_id) VALUES (p_post_id, p_user_id);
        UPDATE posts SET likes = likes + 1 WHERE id = p_post_id RETURNING likes INTO v_new_likes;
        RETURN jsonb_build_object('liked', true, 'likes', v_new_likes);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 포인트 추가 함수
CREATE OR REPLACE FUNCTION add_user_points(
    p_user_id INTEGER,
    p_points INTEGER,
    p_action_type VARCHAR(50),
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_total_points INTEGER;
    v_level INTEGER;
    v_level_name VARCHAR(50);
BEGIN
    -- 사용자 포인트 업데이트 (없으면 생성)
    INSERT INTO user_points (user_id, total_points, weekly_points, monthly_points)
    VALUES (p_user_id, p_points, p_points, p_points)
    ON CONFLICT (user_id) DO UPDATE SET
        total_points = user_points.total_points + p_points,
        weekly_points = user_points.weekly_points + p_points,
        monthly_points = user_points.monthly_points + p_points,
        last_activity_date = CURRENT_DATE,
        updated_at = NOW()
    RETURNING total_points INTO v_total_points;

    -- 레벨 계산
    SELECT
        CASE
            WHEN v_total_points >= 25000 THEN 6
            WHEN v_total_points >= 10000 THEN 5
            WHEN v_total_points >= 5000 THEN 4
            WHEN v_total_points >= 2000 THEN 3
            WHEN v_total_points >= 500 THEN 2
            ELSE 1
        END,
        CASE
            WHEN v_total_points >= 25000 THEN 'Master'
            WHEN v_total_points >= 10000 THEN 'Diamond'
            WHEN v_total_points >= 5000 THEN 'Platinum'
            WHEN v_total_points >= 2000 THEN 'Gold'
            WHEN v_total_points >= 500 THEN 'Silver'
            ELSE 'Bronze'
        END
    INTO v_level, v_level_name;

    -- 레벨 업데이트
    UPDATE user_points SET level = v_level, level_name = v_level_name WHERE user_id = p_user_id;

    -- 포인트 이력 기록
    INSERT INTO point_history (user_id, points, action_type, description)
    VALUES (p_user_id, p_points, p_action_type, p_description);

    RETURN jsonb_build_object(
        'success', true,
        'points_earned', p_points,
        'total_points', v_total_points,
        'level', v_level,
        'level_name', v_level_name
    );
END;
$$ LANGUAGE plpgsql;

-- 주간 포인트 리셋 함수 (매주 월요일 실행)
CREATE OR REPLACE FUNCTION reset_weekly_points()
RETURNS VOID AS $$
BEGIN
    UPDATE user_points SET weekly_points = 0;
END;
$$ LANGUAGE plpgsql;

-- 월간 포인트 리셋 함수 (매월 1일 실행)
CREATE OR REPLACE FUNCTION reset_monthly_points()
RETURNS VOID AS $$
BEGIN
    UPDATE user_points SET monthly_points = 0;
END;
$$ LANGUAGE plpgsql;

-- ============ 완료 메시지 ============
SELECT 'Community tables created successfully!' as message;
