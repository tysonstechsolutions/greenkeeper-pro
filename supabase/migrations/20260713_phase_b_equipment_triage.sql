-- ═══════════════════════════════════════════════════════════════════════════
-- Phase B (data-incomplete mode) — Equipment triage + down-episode tracking
-- 2026-07-13
--
-- WHY: Phase B makes the equipment module useful WITHOUT new meter readings or
-- manuals. It adds a human-driven triage workflow for down units and tracks the
-- current down episode. It does NOT add PM scheduling (no manuals) and never
-- infers anything — every value here is set by a person.
--
-- MINIMAL by design: two nullable columns on `equipment` + one additive check
-- extension. Inspections reuse `equipment_inspections` (its `checklist_items`
-- JSONB is schemaless, so the triage inspection shape needs no new column);
-- repair/downtime reuse `equipment_logs`; parts reuse `equipment_parts`.
--
-- SOURCE OF TRUTH PRESERVED: `equipment.status`
-- (operational/needs_service/in_repair/out_of_service/retired) is unchanged and
-- remains authoritative. `triage_status` is a supplementary working annotation
-- for down units; it never overrides `status`.
--
-- Idempotent. Additive. Nullable. No data is written, inferred, or defaulted.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Triage workflow state (human-set; NULL = not triaged yet)
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS triage_status text,
  ADD COLUMN IF NOT EXISTS down_since date;   -- date first reported down (current episode)

-- Constrain triage_status to the nine workflow states (or NULL).
-- 'replacement_candidate' is a MANUAL human classification — it is never derived
-- from status alone (Phase D owns any automated replacement analysis).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.equipment'::regclass
      AND conname = 'equipment_triage_status_check'
  ) THEN
    ALTER TABLE public.equipment
      ADD CONSTRAINT equipment_triage_status_check
      CHECK (triage_status IS NULL OR triage_status IN (
        'unknown_problem',
        'needs_inspection',
        'diagnosed',
        'waiting_on_parts',
        'waiting_on_vendor',
        'repair_in_progress',
        'ready_for_testing',
        'returned_to_service',
        'replacement_candidate'
      ));
  END IF;
END $$;

-- 2. Allow a 'triage' inspection type alongside the existing pre/post/cleaning.
--    (The triage/condition inspection is a general observation checklist, not a
--    manufacturer pre-op procedure.)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.equipment_inspections'::regclass
      AND conname = 'equipment_inspections_inspection_type_check'
  ) THEN
    ALTER TABLE public.equipment_inspections
      DROP CONSTRAINT equipment_inspections_inspection_type_check;
  END IF;
  ALTER TABLE public.equipment_inspections
    ADD CONSTRAINT equipment_inspections_inspection_type_check
    CHECK (inspection_type IN ('pre', 'post', 'cleaning', 'triage'));
END $$;

-- Helpful index for the readiness/triage dashboards (down units by triage).
CREATE INDEX IF NOT EXISTS idx_equipment_triage_status
  ON public.equipment (triage_status)
  WHERE triage_status IS NOT NULL;

-- RLS/grants: `equipment` and `equipment_inspections` already have their
-- authenticated-only policies + grants (kiosk model); adding columns / editing a
-- check constraint does not change them. Nothing to do here.

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (only if deliberately reverting Phase B triage)
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP INDEX IF EXISTS public.idx_equipment_triage_status;
-- ALTER TABLE public.equipment DROP CONSTRAINT IF EXISTS equipment_triage_status_check;
-- ALTER TABLE public.equipment DROP COLUMN IF EXISTS triage_status;
-- ALTER TABLE public.equipment DROP COLUMN IF EXISTS down_since;
-- ALTER TABLE public.equipment_inspections
--   DROP CONSTRAINT IF EXISTS equipment_inspections_inspection_type_check;
-- ALTER TABLE public.equipment_inspections
--   ADD CONSTRAINT equipment_inspections_inspection_type_check
--   CHECK (inspection_type IN ('pre','post','cleaning'));
-- ═══════════════════════════════════════════════════════════════════════════
