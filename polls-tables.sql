-- ==========================================
-- GreenKeeper Pro: Member Polls & Surveys
-- Run this in Supabase SQL Editor
-- ==========================================

-- 1. Polls (the survey/poll itself)
-- ==========================================
CREATE TABLE IF NOT EXISTS polls (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by uuid REFERENCES profiles(id) NOT NULL,
  title text NOT NULL,
  description text,
  poll_type text CHECK (poll_type IN ('improvement', 'satisfaction', 'preference', 'ranking', 'general')) DEFAULT 'general',
  status text CHECK (status IN ('draft', 'active', 'closed', 'archived')) DEFAULT 'draft',
  allow_comments boolean DEFAULT true,
  is_anonymous boolean DEFAULT false,
  max_choices integer DEFAULT 1,
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_polls_status ON polls(status);
CREATE INDEX idx_polls_type ON polls(poll_type);
CREATE INDEX idx_polls_created_by ON polls(created_by);

-- 2. Poll Options (choices for each poll)
-- ==========================================
CREATE TABLE IF NOT EXISTS poll_options (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id uuid REFERENCES polls(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  description text,
  image_url text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_poll_options_poll ON poll_options(poll_id);

-- 3. Poll Votes (one vote per user per poll, or per option if max_choices > 1)
-- ==========================================
CREATE TABLE IF NOT EXISTS poll_votes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id uuid REFERENCES polls(id) ON DELETE CASCADE NOT NULL,
  option_id uuid REFERENCES poll_options(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(poll_id, option_id, user_id)
);

CREATE INDEX idx_poll_votes_poll ON poll_votes(poll_id);
CREATE INDEX idx_poll_votes_user ON poll_votes(user_id);
CREATE INDEX idx_poll_votes_option ON poll_votes(option_id);

-- 4. Poll Comments (optional feedback with votes)
-- ==========================================
CREATE TABLE IF NOT EXISTS poll_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id uuid REFERENCES polls(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_poll_comments_poll ON poll_comments(poll_id);

-- RLS Policies
-- ==========================================
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_comments ENABLE ROW LEVEL SECURITY;

-- Polls: everyone can read active polls, managers can create/update
CREATE POLICY "Anyone authenticated can read active polls"
  ON polls FOR SELECT TO authenticated
  USING (status IN ('active', 'closed') OR auth.uid() = created_by);

CREATE POLICY "Managers can create polls"
  ON polls FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super', 'asst_super', 'director', 'pro')
    )
  );

CREATE POLICY "Managers can update their polls"
  ON polls FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super', 'asst_super', 'director')
    )
  );

-- Poll Options: readable by all, managed by poll creator
CREATE POLICY "Anyone authenticated can read poll options"
  ON poll_options FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can manage poll options"
  ON poll_options FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM polls
      WHERE polls.id = poll_id
      AND (polls.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid()
          AND role IN ('super', 'asst_super', 'director')
        ))
    )
  );

CREATE POLICY "Managers can delete poll options"
  ON poll_options FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM polls
      WHERE polls.id = poll_id
      AND (polls.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid()
          AND role IN ('super', 'asst_super', 'director')
        ))
    )
  );

-- Votes: users can read/create their own votes
CREATE POLICY "Users can read votes on polls"
  ON poll_votes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can cast their own votes"
  ON poll_votes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own votes"
  ON poll_votes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Comments: readable by all, users create their own
CREATE POLICY "Anyone can read poll comments"
  ON poll_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can add comments"
  ON poll_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Auto-update trigger for polls
CREATE OR REPLACE FUNCTION update_poll_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER poll_updated
  BEFORE UPDATE ON polls
  FOR EACH ROW
  EXECUTE FUNCTION update_poll_timestamp();

-- Done!
-- Tables: polls, poll_options, poll_votes, poll_comments
