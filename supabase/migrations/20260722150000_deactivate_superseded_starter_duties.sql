-- ============================================================================
-- Deactivate the original starter duties that the crew task-menu seed
-- (20260722140000) superseded, so the printed role duty sheets don't show
-- phantom days — e.g. old "Rake bunkers" (Tue) alongside the GM's chosen
-- Mon/Wed/Fri, or "Mow fairways (AM, before league)" duplicating "Mow
-- fairways".
--
-- DELIBERATELY KEPT ACTIVE (real work the new menu does not cover):
--   League course setup · Weekend setup (cups, tees, markers) ·
--   Greens touch-up + cups · Porta potty check (2 units)
--
-- Mirrors what save_operation_duty does on deactivation: records the reason,
-- lets trg_operation_duty_series flip the series inactive, and cancels the
-- pending occurrences. Idempotent (only touches rows still active).
-- ============================================================================

DO $$
DECLARE
  v_ids UUID[];
BEGIN
  SELECT COALESCE(array_agg(id), '{}') INTO v_ids
  FROM public.operation_duties
  WHERE is_active
    AND (legacy_source IS NULL OR legacy_source <> 'crew_task_menu_2026')
    AND title IN (
      'Mow greens + change cups',
      'Range setup + ball pick',
      'Mow tees & collars',
      'Rake bunkers',
      'Mow fairways (AM, before league)',
      'Mow rough (rotating sections)',
      'Hot Dog Monday prep',
      'Place US Foods order',
      'Receive & stock US Foods delivery',
      'Cleaning log — fryer & equipment',
      'Merch walk-through / restock check'
    );

  IF array_length(v_ids, 1) IS NULL THEN
    RAISE NOTICE 'No superseded starter duties left to deactivate.';
    RETURN;
  END IF;

  UPDATE public.operation_duties
  SET is_active = FALSE,
      inactive_reason = 'Superseded by the crew task-menu duties seeded 2026-07-22',
      updated_at = NOW()
  WHERE id = ANY (v_ids);

  -- Their not-yet-worked occurrences must not linger on anyone's list.
  UPDATE public.tasks
  SET status = 'cancelled',
      cancel_reason = 'duty_inactive',
      updated_at = NOW()
  WHERE duty_id = ANY (v_ids) AND status = 'pending';

  RAISE NOTICE 'Deactivated % superseded starter duties.', array_length(v_ids, 1);
END $$;

notify pgrst, 'reload schema';
