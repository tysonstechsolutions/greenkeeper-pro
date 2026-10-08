-- ============================================================================
-- Reception ticket sales split 60 / 40 (2026-10-14).
--
-- Graduate Family Welcome Reception ticket money is shared: 60% belongs to
-- Buckleys (restaurant sales) and 40% to the golf program. Ticket reports
-- saved before this went 100% to Buckleys. This splits them:
--
--   1. every saved day of ticket sales gets a golf program row (category
--      other, which the money pages count as golf course revenue) for 40%
--   2. the Buckleys row keeps 60%
--   3. the ticket item sales (best sellers, prices) keep 60%
--
-- New ticket uploads are split by the app as they are saved.
--
-- Comments here avoid apostrophes and semicolons for the SQL editor.
-- No DO blocks. Idempotent. Safe to run again: rows already split are
-- recognised by their description and left alone.
-- Run 20261009120000_sales_reports.sql first.
-- ============================================================================

-- ── 1. Golf program 40% ─────────────────────────────────────────────────────

INSERT INTO public.revenue_entries
  (entry_date, category, amount, description, source, report_area, sales_report_id, report_path, created_by)
SELECT
  re.entry_date,
  'other',
  re.amount - round(re.amount * 0.6, 2),
  'Reception tickets, golf program 40%' || substring(re.description FROM ' \(\d+ sold\)$'),
  re.source,
  'other',
  re.sales_report_id,
  re.report_path,
  re.created_by
FROM public.revenue_entries re
JOIN public.sales_reports sr ON sr.id = re.sales_report_id
WHERE sr.category = 'Reception tickets'
  AND re.category = 'food_beverage'
  AND position('Buckley''s 60%' IN coalesce(re.description, '')) = 0
  AND re.amount - round(re.amount * 0.6, 2) <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.revenue_entries g
    WHERE g.sales_report_id = re.sales_report_id
      AND g.entry_date = re.entry_date
      AND g.category = 'other'
  );

-- ── 2. Buckleys 60% ─────────────────────────────────────────────────────────

UPDATE public.revenue_entries re
SET amount = round(re.amount * 0.6, 2),
    description = 'Reception tickets, Buckley''s 60%' || coalesce(substring(re.description FROM ' \(\d+ sold\)$'), '')
FROM public.sales_reports sr
WHERE sr.id = re.sales_report_id
  AND sr.category = 'Reception tickets'
  AND re.category = 'food_beverage'
  AND position('Buckley''s 60%' IN coalesce(re.description, '')) = 0;

-- ── 3. Ticket item sales at Buckleys 60% ───────────────────────────────────

UPDATE public.sales_item_days si
SET gross = round(si.gross * 0.6, 2),
    discount = round(si.discount * 0.6, 2),
    net = round(si.net * 0.6, 2),
    description = si.description || ' (Buckley''s 60%)'
FROM public.sales_reports sr
WHERE sr.id = si.report_id
  AND sr.category = 'Reception tickets'
  AND position('Buckley''s 60%' IN si.description) = 0;

-- ── Done ────────────────────────────────────────────────────────────────────

INSERT INTO public.app_migrations (name) VALUES ('20261014120000_reception_ticket_split')
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
