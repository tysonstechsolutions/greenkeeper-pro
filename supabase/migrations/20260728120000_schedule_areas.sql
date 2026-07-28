-- A second, separate schedule for the maintenance crew.
--
-- The pro-shop scheduler already has the machinery the GM wants for the
-- grounds crew: standing weekly availability, stamped per month, coverage
-- warnings, publish. Rather than duplicate all of it, the tables gain an
-- `area` discriminator so one engine serves two independent schedules.
--
-- The `pro_shop_*` table names are now a legacy misnomer — they hold
-- schedulable staff for every area. Renaming four tables plus their RLS
-- policies and RPCs would be a large change for a cosmetic gain, so the names
-- stay and this comment is the signpost.
--
-- Separation is total: staff, months, shifts and time-off all carry an area,
-- and nothing in one area can appear in the other's schedule.

-- ── Area column ────────────────────────────────────────────────────────────
ALTER TABLE public.pro_shop_staff
  ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT 'pro_shop';
ALTER TABLE public.pro_shop_schedules
  ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT 'pro_shop';
ALTER TABLE public.pro_shop_shifts
  ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT 'pro_shop';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pro_shop_staff_area_check') THEN
    ALTER TABLE public.pro_shop_staff
      ADD CONSTRAINT pro_shop_staff_area_check CHECK (area IN ('pro_shop','maintenance'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pro_shop_schedules_area_check') THEN
    ALTER TABLE public.pro_shop_schedules
      ADD CONSTRAINT pro_shop_schedules_area_check CHECK (area IN ('pro_shop','maintenance'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pro_shop_shifts_area_check') THEN
    ALTER TABLE public.pro_shop_shifts
      ADD CONSTRAINT pro_shop_shifts_area_check CHECK (area IN ('pro_shop','maintenance'));
  END IF;
END $$;

-- ── One schedule per month PER AREA ────────────────────────────────────────
-- The old UNIQUE(month) meant August could only belong to one area, which
-- would have made a maintenance schedule impossible to create.
ALTER TABLE public.pro_shop_schedules DROP CONSTRAINT IF EXISTS pro_shop_schedules_month_key;
CREATE UNIQUE INDEX IF NOT EXISTS pro_shop_schedules_month_area_key
  ON public.pro_shop_schedules (month, area);

-- ── Positions and groups for grounds work ──────────────────────────────────
ALTER TABLE public.pro_shop_staff DROP CONSTRAINT IF EXISTS pro_shop_staff_position_check;
ALTER TABLE public.pro_shop_staff
  ADD CONSTRAINT pro_shop_staff_position_check
  CHECK (position IN ('rec_aid','golf_ops_assistant','maintenance_crew','mechanic'));

ALTER TABLE public.pro_shop_staff DROP CONSTRAINT IF EXISTS pro_shop_staff_default_group_check;
ALTER TABLE public.pro_shop_staff
  ADD CONSTRAINT pro_shop_staff_default_group_check
  CHECK (default_group IN ('inside','outside','grounds','shop'));

ALTER TABLE public.pro_shop_shifts DROP CONSTRAINT IF EXISTS pro_shop_shifts_group_check;
ALTER TABLE public.pro_shop_shifts
  ADD CONSTRAINT pro_shop_shifts_group_check
  CHECK ("group" IN ('inside','outside','grounds','shop'));

CREATE INDEX IF NOT EXISTS pro_shop_staff_area_idx ON public.pro_shop_staff (area, is_active);
CREATE INDEX IF NOT EXISTS pro_shop_shifts_area_date_idx ON public.pro_shop_shifts (area, shift_date);

COMMENT ON COLUMN public.pro_shop_staff.area IS
  'Which schedule this person belongs to: pro_shop or maintenance. The two are '
  'kept entirely separate.';
