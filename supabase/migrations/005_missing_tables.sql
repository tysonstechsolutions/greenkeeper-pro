-- GreenKeeper Pro - Missing Tables Migration
-- Adds 11 tables referenced in code but not yet created in the database

-- ============================================================================
-- COMMUNITY POSTS TABLE
-- ============================================================================
CREATE TABLE community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_type TEXT NOT NULL CHECK (post_type IN ('official', 'poll', 'discussion', 'photo')),
  content TEXT NOT NULL,
  photo_url TEXT,
  is_official BOOLEAN DEFAULT false,
  is_pinned BOOLEAN DEFAULT false,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  poll_question TEXT,
  poll_options TEXT[] DEFAULT '{}',
  poll_votes JSONB,
  poll_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_community_posts_author ON community_posts(author_id);
CREATE INDEX idx_community_posts_pinned_created ON community_posts(is_pinned DESC, created_at DESC);
CREATE INDEX idx_community_posts_type ON community_posts(post_type);

-- ============================================================================
-- COMMUNITY COMMENTS TABLE
-- ============================================================================
CREATE TABLE community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_community_comments_post ON community_comments(post_id, created_at);
CREATE INDEX idx_community_comments_author ON community_comments(author_id);

-- ============================================================================
-- COMMUNITY LIKES TABLE
-- ============================================================================
CREATE TABLE community_likes (
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- ============================================================================
-- POLL VOTES TABLE
-- ============================================================================
CREATE TABLE poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  option TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX idx_poll_votes_post ON poll_votes(post_id);

-- ============================================================================
-- TEE TIMES TABLE
-- ============================================================================
CREATE TABLE tee_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tee_date DATE NOT NULL,
  tee_time TEXT NOT NULL,
  num_players INTEGER NOT NULL CHECK (num_players >= 1),
  player_names TEXT[] DEFAULT '{}',
  cart_requested BOOLEAN DEFAULT false,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tee_times_user ON tee_times(user_id);
CREATE INDEX idx_tee_times_date_time ON tee_times(tee_date, tee_time);
CREATE INDEX idx_tee_times_status ON tee_times(status);

-- ============================================================================
-- ROUND RATINGS TABLE
-- ============================================================================
CREATE TABLE round_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  round_date DATE NOT NULL,
  overall_rating INTEGER NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  greens_rating INTEGER CHECK (greens_rating BETWEEN 1 AND 5),
  fairways_rating INTEGER CHECK (fairways_rating BETWEEN 1 AND 5),
  bunkers_rating INTEGER CHECK (bunkers_rating BETWEEN 1 AND 5),
  tees_rating INTEGER CHECK (tees_rating BETWEEN 1 AND 5),
  pace_rating INTEGER CHECK (pace_rating BETWEEN 1 AND 5),
  setup_rating INTEGER CHECK (setup_rating BETWEEN 1 AND 5),
  cleanliness_rating INTEGER CHECK (cleanliness_rating BETWEEN 1 AND 5),
  value_rating INTEGER CHECK (value_rating BETWEEN 1 AND 5),
  favorite_hole INTEGER CHECK (favorite_hole BETWEEN 1 AND 18),
  comments TEXT,
  would_recommend BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_round_ratings_user ON round_ratings(user_id);
CREATE INDEX idx_round_ratings_date ON round_ratings(round_date DESC);

-- ============================================================================
-- MEMBER REGISTRATIONS TABLE
-- ============================================================================
CREATE TABLE member_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  member_type TEXT NOT NULL CHECK (member_type IN ('active_duty', 'retired_reserve', 'veteran', 'dod_civilian', 'general_public')),
  handicap INTEGER,
  preferred_tee TEXT NOT NULL CHECK (preferred_tee IN ('blue', 'white', 'gold', 'red')),
  wants_updates BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- GOLFER FEEDBACK TABLE
-- ============================================================================
CREATE TABLE golfer_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feedback_date DATE NOT NULL,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('compliment', 'complaint', 'suggestion')),
  area TEXT NOT NULL CHECK (area IN ('greens', 'fairways', 'bunkers', 'tees', 'cart_paths', 'pace_of_play', 'course_setup', 'cleanliness', 'other')),
  hole_number INTEGER CHECK (hole_number BETWEEN 1 AND 18),
  notes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'in_progress', 'resolved', 'dismissed')),
  superintendent_response TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_golfer_feedback_submitted_by ON golfer_feedback(submitted_by);
CREATE INDEX idx_golfer_feedback_status ON golfer_feedback(status);
CREATE INDEX idx_golfer_feedback_created ON golfer_feedback(created_at DESC);

-- ============================================================================
-- DIAGNOSTICS TABLE
-- ============================================================================
CREATE TABLE diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  zone_id UUID REFERENCES course_zones(id) ON DELETE SET NULL,
  photo_url TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'auto',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'diagnosed', 'treating', 'resolved', 'monitoring')),
  full_response JSONB,
  conversation JSONB DEFAULT '[]'::jsonb,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_diagnostics_course ON diagnostics(course_id);
CREATE INDEX idx_diagnostics_status ON diagnostics(status);
CREATE INDEX idx_diagnostics_created ON diagnostics(created_at DESC);
CREATE INDEX idx_diagnostics_created_by ON diagnostics(created_by);

-- ============================================================================
-- KNOWLEDGE ARTICLES TABLE
-- ============================================================================
CREATE TABLE knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('mowing', 'irrigation', 'chemical', 'equipment', 'greens', 'bunkers', 'landscaping', 'safety', 'admin', 'onboarding', 'emergency', 'seasonal', 'general')),
  article_type TEXT NOT NULL CHECK (article_type IN ('sop', 'guide', 'manual', 'checklist', 'reference', 'training')),
  tags TEXT[] DEFAULT '{}',
  version INTEGER DEFAULT 1,
  is_published BOOLEAN DEFAULT true,
  linked_template_ids UUID[] DEFAULT '{}',
  attachments JSONB DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_knowledge_articles_category ON knowledge_articles(category);
CREATE INDEX idx_knowledge_articles_type ON knowledge_articles(article_type);
CREATE INDEX idx_knowledge_articles_published ON knowledge_articles(is_published);
CREATE INDEX idx_knowledge_articles_tags ON knowledge_articles USING GIN (tags);
CREATE INDEX idx_knowledge_articles_course ON knowledge_articles(course_id);

-- ============================================================================
-- KNOWLEDGE READ LOG TABLE
-- ============================================================================
CREATE TABLE knowledge_read_log (
  article_id UUID NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (article_id, user_id)
);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tee_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE golfer_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_read_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES: COMMUNITY POSTS
-- ============================================================================
CREATE POLICY "community_posts_select_all" ON community_posts
  FOR SELECT USING (true);

CREATE POLICY "community_posts_insert_authenticated" ON community_posts
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "community_posts_update_own" ON community_posts
  FOR UPDATE USING (auth.uid() = author_id OR is_manager(auth.uid()));

CREATE POLICY "community_posts_delete_own" ON community_posts
  FOR DELETE USING (auth.uid() = author_id OR is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: COMMUNITY COMMENTS
-- ============================================================================
CREATE POLICY "community_comments_select_all" ON community_comments
  FOR SELECT USING (true);

CREATE POLICY "community_comments_insert_authenticated" ON community_comments
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "community_comments_delete_own" ON community_comments
  FOR DELETE USING (auth.uid() = author_id OR is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: COMMUNITY LIKES
-- ============================================================================
CREATE POLICY "community_likes_select_all" ON community_likes
  FOR SELECT USING (true);

CREATE POLICY "community_likes_insert_own" ON community_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_likes_delete_own" ON community_likes
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES: POLL VOTES
-- ============================================================================
CREATE POLICY "poll_votes_select_all" ON poll_votes
  FOR SELECT USING (true);

CREATE POLICY "poll_votes_insert_own" ON poll_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES: TEE TIMES
-- ============================================================================
CREATE POLICY "tee_times_select_all" ON tee_times
  FOR SELECT USING (true);

CREATE POLICY "tee_times_insert_own" ON tee_times
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tee_times_update_own" ON tee_times
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES: ROUND RATINGS
-- ============================================================================
CREATE POLICY "round_ratings_select_all" ON round_ratings
  FOR SELECT USING (true);

CREATE POLICY "round_ratings_insert_own" ON round_ratings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES: MEMBER REGISTRATIONS
-- ============================================================================
CREATE POLICY "member_registrations_select_all" ON member_registrations
  FOR SELECT USING (true);

CREATE POLICY "member_registrations_insert_own" ON member_registrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "member_registrations_update_own" ON member_registrations
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES: GOLFER FEEDBACK
-- ============================================================================
CREATE POLICY "golfer_feedback_select_all" ON golfer_feedback
  FOR SELECT USING (auth.uid() = submitted_by OR is_manager(auth.uid()));

CREATE POLICY "golfer_feedback_insert_own" ON golfer_feedback
  FOR INSERT WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "golfer_feedback_update_manager" ON golfer_feedback
  FOR UPDATE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: DIAGNOSTICS
-- ============================================================================
CREATE POLICY "diagnostics_select_all" ON diagnostics
  FOR SELECT USING (true);

CREATE POLICY "diagnostics_insert_authenticated" ON diagnostics
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "diagnostics_update_authenticated" ON diagnostics
  FOR UPDATE USING (auth.uid() = created_by OR is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: KNOWLEDGE ARTICLES
-- ============================================================================
CREATE POLICY "knowledge_articles_select_published" ON knowledge_articles
  FOR SELECT USING (is_published = true OR is_manager(auth.uid()));

CREATE POLICY "knowledge_articles_insert_manager" ON knowledge_articles
  FOR INSERT WITH CHECK (is_manager(auth.uid()));

CREATE POLICY "knowledge_articles_update_manager" ON knowledge_articles
  FOR UPDATE USING (is_manager(auth.uid()));

CREATE POLICY "knowledge_articles_delete_manager" ON knowledge_articles
  FOR DELETE USING (is_manager(auth.uid()));

-- ============================================================================
-- RLS POLICIES: KNOWLEDGE READ LOG
-- ============================================================================
CREATE POLICY "knowledge_read_log_select_own" ON knowledge_read_log
  FOR SELECT USING (auth.uid() = user_id OR is_manager(auth.uid()));

CREATE POLICY "knowledge_read_log_insert_own" ON knowledge_read_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "knowledge_read_log_update_own" ON knowledge_read_log
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- RPC FUNCTIONS: COMMUNITY COUNTERS
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_likes_count(p_post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE community_posts SET likes_count = likes_count + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_likes_count(p_post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE community_posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_comments_count(p_post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_poll_vote(p_post_id UUID, p_option TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE community_posts
  SET poll_votes = COALESCE(poll_votes, '{}'::jsonb) || jsonb_build_object(p_option, COALESCE((poll_votes ->> p_option)::int, 0) + 1)
  WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
