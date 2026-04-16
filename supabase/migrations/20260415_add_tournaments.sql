CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_end_date DATE,        -- for multi-day events
  event_type TEXT NOT NULL DEFAULT 'tournament' CHECK (event_type IN ('tournament','outing','league','charity','military','practice_round','other')),
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','confirmed','setup','in_progress','completed','cancelled')),
  expected_players INTEGER,
  format TEXT,                -- e.g. "Scramble", "Stroke Play", "Best Ball"
  shotgun_start BOOLEAN DEFAULT false,
  first_tee_time TIME,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('course_setup','equipment','signage','food_beverage','staffing','communication','post_event')),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES profiles(id),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','na')),
  sort_order INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view tournaments" ON tournaments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage tournaments" ON tournaments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth view checklist" ON tournament_checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth manage checklist" ON tournament_checklist_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_tournaments_date ON tournaments(event_date);
CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_tournament_checklist_tournament ON tournament_checklist_items(tournament_id, sort_order);
