-- ============================================================================
-- PR Audit — categories + manageable code lists (Sites / Cost Centers / G/L)
-- ============================================================================
--
-- Moves the formerly-hardcoded Site / Cost Center / G/L Account lists into the
-- database so the boss can add/edit/hide them himself, and groups them under
-- top-level CATEGORIES (Golf Course, Zappers, Epicenter, Food & Beverage, …)
-- that the PR Audit section can sort/filter by.
--
-- Cost centers also carry a `description` + `examples` so the AI fit-check can
-- judge whether the cost center chosen on a PR is the right one for the items.
--
-- The existing golf-course codes are seeded under a "Golf Course" category so
-- nothing already saved breaks. Everything is idempotent (ON CONFLICT) so this
-- can be applied safely even if partially run before.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK:
--   DROP TABLE IF EXISTS pr_codes;
--   DROP TABLE IF EXISTS pr_categories;
-- ============================================================================

-- ── 1. Categories ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pr_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  sort_order  INT  NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS pr_categories_touch_updated_at ON pr_categories;
CREATE TRIGGER pr_categories_touch_updated_at
  BEFORE UPDATE ON pr_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE pr_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pr_categories_select_auth" ON pr_categories;
CREATE POLICY "pr_categories_select_auth" ON pr_categories FOR SELECT
  TO authenticated USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "pr_categories_write_management" ON pr_categories;
CREATE POLICY "pr_categories_write_management" ON pr_categories FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid())
                 AND role IN ('super','asst_super','director','gm')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid())
                 AND role IN ('super','asst_super','director','gm')));

GRANT SELECT, INSERT, UPDATE, DELETE ON pr_categories TO authenticated;

-- ── 2. Codes (sites / cost centers / G/L accounts) ───────────────────────────

CREATE TABLE IF NOT EXISTS pr_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL CHECK (kind IN ('site','cost_center','gl_account')),
  code         TEXT NOT NULL,
  label        TEXT NOT NULL DEFAULT '',
  category_id  UUID REFERENCES pr_categories(id) ON DELETE SET NULL,
  -- Cost-center "answer key" for the AI fit-check (optional for other kinds).
  description  TEXT,
  examples     TEXT,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INT  NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, code)
);

CREATE INDEX IF NOT EXISTS idx_pr_codes_kind_active ON pr_codes(kind, active);
CREATE INDEX IF NOT EXISTS idx_pr_codes_category ON pr_codes(category_id);

DROP TRIGGER IF EXISTS pr_codes_touch_updated_at ON pr_codes;
CREATE TRIGGER pr_codes_touch_updated_at
  BEFORE UPDATE ON pr_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE pr_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pr_codes_select_auth" ON pr_codes;
CREATE POLICY "pr_codes_select_auth" ON pr_codes FOR SELECT
  TO authenticated USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "pr_codes_write_management" ON pr_codes;
CREATE POLICY "pr_codes_write_management" ON pr_codes FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid())
                 AND role IN ('super','asst_super','director','gm')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid())
                 AND role IN ('super','asst_super','director','gm')));

GRANT SELECT, INSERT, UPDATE, DELETE ON pr_codes TO authenticated;

-- ── 3. Seed categories ───────────────────────────────────────────────────────

INSERT INTO pr_categories (name, sort_order) VALUES
  ('Golf Course', 0),
  ('Zappers', 1),
  ('Epicenter', 2),
  ('Food and Beverage', 3)
ON CONFLICT (name) DO NOTHING;

-- ── 4. Seed the existing golf-course codes under "Golf Course" ───────────────

INSERT INTO pr_codes (kind, code, label, category_id, sort_order)
SELECT 'site', v.code, v.label,
       (SELECT id FROM pr_categories WHERE name = 'Golf Course'), v.ord
FROM (VALUES
  ('7009', '', 1),
  ('7010', '', 2)
) AS v(code, label, ord)
ON CONFLICT (kind, code) DO NOTHING;

INSERT INTO pr_codes (kind, code, label, category_id, description, examples, sort_order)
SELECT 'cost_center', v.code, v.label,
       (SELECT id FROM pr_categories WHERE name = 'Golf Course'),
       v.descr, v.ex, v.ord
FROM (VALUES
  ('20086', 'GLK VMGC GOLF MDSE RESALE',
     'Merchandise bought to RESELL in the pro shop (not for course use).',
     'Hats, gloves, golf balls, apparel, bags, tees, and accessories purchased for resale.', 1),
  ('20087', 'GLK VMGC GOLF COURSE PROGRAM',
     'General golf-course program and operations expenses that are not day-to-day maintenance.',
     'Course program supplies, signage, tournament/event supplies, on-course operational items.', 2),
  ('25224', 'GLK VMGC GOLF RANGE PROG',
     'Driving range program, supplies, and equipment.',
     'Range balls, range baskets, hitting mats, tee dividers, ball pickers, range netting.', 3),
  ('25229', 'GLK VMGC GC CLUB/CART RENTAL',
     'Rental clubs and golf carts and their upkeep.',
     'Rental club sets, golf-cart parts, cart batteries, cart tires, rental equipment.', 4),
  ('25581', 'GLK VMGC GC MAINTENANCE',
     'Day-to-day golf course maintenance and operations.',
     'Fertilizer, seed, sand/topdressing, chemicals, irrigation parts, mower and equipment parts, fuel, hand tools, shop supplies.', 5)
) AS v(code, label, descr, ex, ord)
ON CONFLICT (kind, code) DO NOTHING;

INSERT INTO pr_codes (kind, code, label, category_id, sort_order)
SELECT 'gl_account', v.code, v.label,
       (SELECT id FROM pr_categories WHERE name = 'Golf Course'), v.ord
FROM (VALUES
  ('151110', 'RESALE INVENTORY FOOD', 1),
  ('151120', 'RESALE INVENTORY ALCOHOL', 2),
  ('151130', 'RESALE INVENTORY MERCHANDISE', 3),
  ('152000', 'CENTRAL STOREROOM INVENTORIES', 4),
  ('641000', 'UTILITIES', 5),
  ('681000', 'REPAIRS & MAINT VEHICLES', 6),
  ('683000', 'FURNITURE, FIXTURES & EQUIPMENT', 7),
  ('684000', 'REPAIRS & MAINT GROUNDS', 8),
  ('685000', 'REPAIRS & MAINT BLDG & FAC', 9),
  ('701000', 'SUPPLIES', 10),
  ('701003', 'OFFICE SUPPLIES', 11),
  ('701005', 'CLEANING TOOLS AND SUPPLIES', 12)
) AS v(code, label, ord)
ON CONFLICT (kind, code) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE pr_categories IS 'Top-level groupings for PR Audit (Golf Course, Zappers, Epicenter, F&B, …).';
COMMENT ON TABLE pr_codes IS 'Manageable Site / Cost Center / G/L Account lists for PR Audit, grouped by category. Cost centers carry description + examples for the AI fit-check.';
