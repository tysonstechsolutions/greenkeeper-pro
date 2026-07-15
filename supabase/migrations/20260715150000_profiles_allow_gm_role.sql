-- ============================================================================
-- Allow 'gm' as a profile role.
--
-- DRIFT BUG
-- The application has had a General Manager role for a while: UserRole includes
-- 'gm', roleLabels maps gm -> 'General Manager', and every client role array
-- (MANAGEMENT_ROLES, ADMIN_ROLES, GM_ROLES, PRO_ROLES, STAFF_ROLES) lists it.
-- can_manage_daily_operations() grants it authority. But the LIVE check
-- constraint on profiles.role never included it:
--
--   CHECK (role = ANY (ARRAY['super','asst_super','director','foreman',
--                            'mechanic','crew','seasonal','pro']))
--
-- so `UPDATE profiles SET role='gm'` fails with 23514. Nobody could actually BE
-- the General Manager. This is live drift — the migration history and the live
-- database disagree.
--
-- Additive: widens the allowed set, never narrows it. No existing row can be
-- invalidated by adding a value.
-- ============================================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'super',
    'asst_super',
    'director',
    'gm',
    'foreman',
    'mechanic',
    'crew',
    'seasonal',
    'pro'
  ));

COMMENT ON CONSTRAINT profiles_role_check ON public.profiles IS
  'Allowed profile roles. Keep in sync with UserRole in src/types/database.ts and the role arrays in src/components/auth/role-guard.tsx.';

notify pgrst, 'reload schema';
