-- ============================================================================
-- Let any active manager (including the GM) create staff invites.
--
-- Adding staff — the "Add Staff" sheet and "transfer from scheduling" —
-- first inserts an invite row, then pin-signup turns it into an account.
-- The invite INSERT policies were written before the 'gm' role existed and
-- only allowed super/asst_super (002) or super/asst_super/director (006).
-- With the GM's profile role set to 'gm', every add failed with:
--   new row violates row-level security policy for table "invites"
--
-- public.is_manager() already means "active super, asst_super, director, or
-- gm" everywhere else (20260715140000_gm_is_manager.sql), so the invite rule
-- now uses it too. The invite must still be created as yourself.
-- Idempotent.
-- ============================================================================

DROP POLICY IF EXISTS "invites_insert_manager" ON public.invites;
DROP POLICY IF EXISTS "Managers can create invites" ON public.invites;
DROP POLICY IF EXISTS "Active managers create invites" ON public.invites;

CREATE POLICY "Active managers create invites" ON public.invites
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_manager());

NOTIFY pgrst, 'reload schema';
