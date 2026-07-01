-- Pro Shop recurring duties — standing daily tasks for the pro-shop jobs
-- (rec aids / golf ops), shown on a separate printable Duties page (NOT stamped
-- onto the schedule). Each duty repeats on a set of weekdays and attaches to
-- EITHER an area (outside/inside/both) OR one specific staff member.

CREATE TABLE IF NOT EXISTS pro_shop_duties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  -- Area assignment (set iff staff_id is NULL).
  area TEXT CHECK (area IN ('outside','inside','both')),
  -- Person assignment (set iff area is NULL).
  staff_id UUID REFERENCES pro_shop_staff(id) ON DELETE CASCADE,
  -- Weekday keys this duty recurs on, e.g. ["mon","wed","fri"]. [] = none set.
  days JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Exactly one of area / staff_id must be set.
  CONSTRAINT pro_shop_duties_target CHECK (
    (area IS NOT NULL AND staff_id IS NULL) OR
    (area IS NULL AND staff_id IS NOT NULL)
  )
);

ALTER TABLE pro_shop_duties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view pro_shop_duties" ON pro_shop_duties;
DROP POLICY IF EXISTS "Authenticated can manage pro_shop_duties" ON pro_shop_duties;

CREATE POLICY "Authenticated can view pro_shop_duties" ON pro_shop_duties FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage pro_shop_duties" ON pro_shop_duties FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pro_shop_duties_active ON pro_shop_duties(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_pro_shop_duties_staff ON pro_shop_duties(staff_id);
