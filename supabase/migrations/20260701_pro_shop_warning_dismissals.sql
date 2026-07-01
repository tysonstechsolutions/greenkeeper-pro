-- Pro Shop schedule — dismissible coverage warnings.
--
-- Generating a month flags days with light coverage warnings (empty group, no
-- opener/closer). This lets the user "bypass" a warning they're fine with. We
-- store the dismissals per issue-per-day on the month's schedule row so a NEW,
-- different problem on that day still surfaces:
--   { "2026-06-13": ["no_inside_closer"], "2026-06-20": ["no_outside"] }

ALTER TABLE pro_shop_schedules
  ADD COLUMN IF NOT EXISTS dismissed_warnings JSONB NOT NULL DEFAULT '{}'::jsonb;
