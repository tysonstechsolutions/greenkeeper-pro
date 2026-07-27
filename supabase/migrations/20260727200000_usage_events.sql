-- Usage tracking, so the app can be improved from how it is actually used.
--
-- WHAT IS RECORDED
-- ----------------
-- One row per screen view or named action: which route, what kind of event, an
-- optional short label, and how long the screen took to become useful. Nothing
-- else. No task titles, no names, no free text from the GM, no note contents —
-- the label is a fixed vocabulary written by the app, never user input.
--
-- WHY IT IS SAFE
-- --------------
-- This is Tyson's own database. Rows are readable only by an operations
-- manager, and writable only as the signed-in actor. It never leaves the
-- project, and it holds nothing that is not already visible on the screen the
-- event came from.
--
-- The point is prioritisation: which screens get opened every morning, which
-- actions get used, which get opened once and abandoned, and where the app is
-- slow in real use rather than in a synthetic test.

CREATE TABLE IF NOT EXISTS public.usage_events (
  id           BIGSERIAL PRIMARY KEY,
  actor_id     UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 'view' | 'action' | 'slow' — kept as text so adding a kind needs no migration.
  event_kind   TEXT NOT NULL CHECK (BTRIM(event_kind) <> ''),
  -- Normalised route, e.g. '/operations' or '/tasks/view'. Never a query string:
  -- ids and search terms are stripped client-side before this is written.
  route        TEXT NOT NULL CHECK (BTRIM(route) <> ''),
  -- Fixed vocabulary chosen by the app, e.g. 'print_by_position'. Never typed text.
  label        TEXT,
  -- Milliseconds to a useful screen, for 'view' and 'slow' events.
  duration_ms  INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_events_occurred_idx ON public.usage_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_route_idx ON public.usage_events (route, occurred_at DESC);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usage_events_insert_self ON public.usage_events;
CREATE POLICY usage_events_insert_self ON public.usage_events
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS usage_events_select_manager ON public.usage_events;
CREATE POLICY usage_events_select_manager ON public.usage_events
  FOR SELECT TO authenticated
  USING (public.can_manage_tasks());

-- Usage data is a convenience, not a record to protect: the owner may clear it.
DROP POLICY IF EXISTS usage_events_delete_manager ON public.usage_events;
CREATE POLICY usage_events_delete_manager ON public.usage_events
  FOR DELETE TO authenticated
  USING (public.can_manage_tasks());

REVOKE ALL ON public.usage_events FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.usage_events TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.usage_events_id_seq TO authenticated;

COMMENT ON TABLE public.usage_events IS
  'Screen views and named actions, for prioritising app work. Fixed-vocabulary '
  'labels only — never user-entered text, task titles or personal data.';

-- Rollup for the review screen: one row per route per day.
CREATE OR REPLACE VIEW public.usage_daily_rollup AS
SELECT
  route,
  event_kind,
  label,
  (occurred_at AT TIME ZONE 'UTC')::DATE AS day,
  COUNT(*)                                AS events,
  ROUND(AVG(duration_ms))                 AS avg_duration_ms,
  MAX(duration_ms)                        AS worst_duration_ms,
  MAX(occurred_at)                        AS last_seen
FROM public.usage_events
GROUP BY route, event_kind, label, (occurred_at AT TIME ZONE 'UTC')::DATE;

REVOKE ALL ON public.usage_daily_rollup FROM PUBLIC, anon;
GRANT SELECT ON public.usage_daily_rollup TO authenticated;
