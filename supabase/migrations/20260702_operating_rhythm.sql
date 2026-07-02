-- ============================================================================
-- Phase 1 of the Operation Blueprint: the operating rhythm.
--
--   obligations            — recurring monthly/quarterly/annual anchors with
--                            lead-time alarms (tank inspections, inventory
--                            counts, 889 renewals, FY rollover...).
--   obligation_completions — one row per obligation per period; the
--                            compliance history (who completed it, when).
--   operation_duties       — the weekly rhythm: standing duties per weekday
--                            per area (course / restaurant / pro_shop).
--   duty_completions       — per-day check-offs for duties.
--
-- Seeds implement the blueprint's weekly template + monthly anchor table.
-- Everything is editable in-app afterwards; seeds use fixed slugs/titles so
-- re-running this file is safe (ON CONFLICT DO NOTHING).
-- ============================================================================

-- ── Obligations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  workspace TEXT NOT NULL CHECK (workspace IN ('course','restaurant','pro_shop','money','people','general')),
  cadence TEXT NOT NULL CHECK (cadence IN ('monthly','quarterly','annual')),
  -- Day the item is due: 1..28, or -1 = last day of the due month.
  due_day INTEGER NOT NULL DEFAULT 1 CHECK (due_day = -1 OR (due_day >= 1 AND due_day <= 28)),
  -- annual: calendar month 1..12. quarterly: month within the quarter 1..3.
  -- monthly: NULL.
  due_month INTEGER CHECK (due_month IS NULL OR (due_month >= 1 AND due_month <= 12)),
  lead_days INTEGER NOT NULL DEFAULT 7 CHECK (lead_days >= 0 AND lead_days <= 90),
  delegable BOOLEAN NOT NULL DEFAULT FALSE,
  -- Deep link to the tool that satisfies the obligation (e.g. /ast-inspections).
  link_href TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT obligations_annual_month CHECK (cadence <> 'annual' OR due_month IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS obligation_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id UUID NOT NULL REFERENCES obligations(id) ON DELETE CASCADE,
  -- Period key: '2026-07' (monthly), '2026-Q3' (quarterly), '2026' (annual).
  period TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_by UUID REFERENCES profiles(id),
  note TEXT,
  UNIQUE (obligation_id, period)
);

-- ── Weekly duties ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operation_duties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('course','restaurant','pro_shop')),
  -- Weekday keys this duty recurs on, e.g. ["mon","wed","fri"] — same
  -- convention as pro_shop_duties.
  days JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- in_season = late Mar..early Oct (the app decides the window);
  -- year_round always shows.
  season TEXT NOT NULL DEFAULT 'in_season' CHECK (season IN ('in_season','year_round')),
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS duty_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_id UUID NOT NULL REFERENCES operation_duties(id) ON DELETE CASCADE,
  duty_date DATE NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_by UUID REFERENCES profiles(id),
  UNIQUE (duty_id, duty_date)
);

-- ── RLS (same posture as the rest of the app: authenticated full access) ──
ALTER TABLE obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligation_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_duties ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage obligations" ON obligations;
CREATE POLICY "Authenticated manage obligations" ON obligations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated manage obligation_completions" ON obligation_completions;
CREATE POLICY "Authenticated manage obligation_completions" ON obligation_completions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated manage operation_duties" ON operation_duties;
CREATE POLICY "Authenticated manage operation_duties" ON operation_duties
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated manage duty_completions" ON duty_completions;
CREATE POLICY "Authenticated manage duty_completions" ON duty_completions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_obligations_active ON obligations(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_obligation_completions_lookup ON obligation_completions(obligation_id, period);
CREATE INDEX IF NOT EXISTS idx_operation_duties_active ON operation_duties(is_active, area, sort_order);
CREATE INDEX IF NOT EXISTS idx_duty_completions_date ON duty_completions(duty_date);

-- ── Seeds: monthly / annual anchors (from the blueprint; all editable) ─────
INSERT INTO obligations (slug, title, detail, workspace, cadence, due_day, due_month, lead_days, delegable, link_href, notes, sort_order) VALUES
  ('tank-inspections',        'AST tank inspections',                        'Monthly above-ground storage tank inspection checklist.',                          'course',     'monthly', 1,  NULL, 5,  FALSE, '/ast-inspections',   NULL, 10),
  ('fire-extinguishers',      'Fire extinguisher signatures',                'Sign the monthly fire-extinguisher checks in the restaurant/clubhouse.',           'restaurant', 'monthly', 1,  NULL, 5,  TRUE,  NULL,                  'Delegable — assign to F&B staff once they join the app.', 20),
  ('revenue-rollup',          'Prior-month revenue rollup',                  'Revenue by category, per area (course / range / restaurant / pro shop).',          'money',      'monthly', 5,  NULL, 5,  FALSE, '/revenue',            NULL, 30),
  ('spend-totals',            'Prior-month PR spend + fuel totals',          'Roll up purchase-request spend and fuel purchases for last month.',                'money',      'monthly', 5,  NULL, 5,  FALSE, '/purchase-requests',  NULL, 40),
  ('restaurant-inventory',    'Restaurant inventory count',                  'Hand-count food & supplies stock.',                                                 'restaurant', 'monthly', -1, NULL, 7,  FALSE, NULL,                  NULL, 50),
  ('pro-shop-inventory',      'Pro shop inventory count',                    'Hand-count merchandise (shirts, balls, tees, hats, shoes, polos...).',             'pro_shop',   'monthly', -1, NULL, 7,  FALSE, NULL,                  NULL, 60),
  ('asset-submissions',       'Asset inventory submissions',                 'Submit asset inventories for maintenance, F&B, and pro shop.',                     'general',    'monthly', -1, NULL, 7,  FALSE, '/assets',             'Cadence/dates to confirm with the business office.', 70),
  ('889-renewals',            'Section 889 vendor cert renewals',            'Re-sign vendor 889 representations for the new fiscal year.',                      'money',      'annual',  1,  10,   30, FALSE, '/vendors',            NULL, 80),
  ('fy-rollover',             'Fiscal-year rollover',                        'New FY budgets and PR numbering (FY runs Oct–Sep).',                               'money',      'annual',  1,  10,   21, FALSE, '/budget',             NULL, 90),
  ('greens-aeration-spring',  'Greens aeration (spring)',                    'Core/needle aerate greens; schedule around play.',                                 'course',     'annual',  15, 5,    21, FALSE, NULL,                  NULL, 100),
  ('greens-aeration-fall',    'Greens aeration (fall)',                      'Fall aeration window.',                                                             'course',     'annual',  15, 9,    21, FALSE, NULL,                  NULL, 110),
  ('overseed',                'Overseed (late summer)',                      'Overseed thin/worn turf while soil is warm.',                                       'course',     'annual',  1,  9,    21, FALSE, NULL,                  NULL, 120),
  ('winterize-irrigation',    'Winterize irrigation',                        'Blow out lines before hard freeze.',                                                'course',     'annual',  25, 10,   21, FALSE, '/irrigation',         NULL, 130),
  ('simulator-setup',         'Golf simulator setup',                        'Stand up the indoor simulators for winter revenue.',                                'general',    'annual',  1,  11,   14, FALSE, NULL,                  'New for winter 2026.', 140),
  ('reladyne-gauge',          'Set up Reladyne auto-gauge refills',          'Call Reladyne: they can install a tank gauge and refill automatically when low.',  'course',     'annual',  1,  8,    30, FALSE, NULL,                  'One-time — deactivate this once it''s done.', 150)
ON CONFLICT (slug) DO NOTHING;

-- ── Seeds: the weekly rhythm (blueprint §2; all editable) ──────────────────
-- Guarded so re-running the migration doesn't duplicate rows.
INSERT INTO operation_duties (title, area, days, season, note, sort_order)
SELECT * FROM (VALUES
  ('Mow greens + change cups',            'course',     '["mon","thu"]'::jsonb,        'in_season',  NULL,                                              10),
  ('Range setup + ball pick',             'course',     '["mon","fri"]'::jsonb,        'in_season',  NULL,                                              20),
  ('Mow tees & collars',                  'course',     '["tue"]'::jsonb,              'in_season',  NULL,                                              30),
  ('Rake bunkers',                        'course',     '["tue"]'::jsonb,              'in_season',  NULL,                                              40),
  ('Mow fairways (AM, before league)',    'course',     '["wed"]'::jsonb,              'in_season',  'Wednesday league plays in the afternoon.',        50),
  ('League course setup',                 'course',     '["wed","thu"]'::jsonb,        'in_season',  'Wed league + Thursday commanders league.',        60),
  ('Mow rough (rotating sections)',       'course',     '["fri"]'::jsonb,              'in_season',  NULL,                                              70),
  ('Weekend setup (cups, tees, markers)', 'course',     '["fri"]'::jsonb,              'in_season',  NULL,                                              80),
  ('Greens touch-up + cups',              'course',     '["sat","sun"]'::jsonb,        'in_season',  'Minimal weekend crew.',                           90),
  ('Porta potty check (2 units)',         'course',     '["fri"]'::jsonb,              'in_season',  'Service schedule TBD — adjust when confirmed.',   100),
  ('Hot Dog Monday prep',                 'restaurant', '["mon"]'::jsonb,              'in_season',  'Cheap hot dogs for golfers.',                     110),
  ('Place US Foods order',                'restaurant', '["mon"]'::jsonb,              'year_round', 'Confirm actual order/delivery days.',             120),
  ('Receive & stock US Foods delivery',   'restaurant', '["tue"]'::jsonb,              'year_round', 'Adjust to the actual delivery day.',              130),
  ('Cleaning log — fryer & equipment',    'restaurant', '["fri"]'::jsonb,              'year_round', NULL,                                              140),
  ('Merch walk-through / restock check',  'pro_shop',   '["mon"]'::jsonb,              'in_season',  NULL,                                              150)
) AS seed(title, area, days, season, note, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM operation_duties);
