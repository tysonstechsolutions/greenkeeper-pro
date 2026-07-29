-- ============================================================================
-- Merge "Pro-Shop Staff" into "Golf Ops / Pro Shop" (2026-07-29)
--
-- The duty catalogue carried two role groups for what is one job. Nobody was
-- ever in `pro_shop_staff` — the three people who actually work inside (DJ
-- Skinner, Marty Sordyl, Mike Pelletier) are all `golf_operations_assistant`,
-- both on their profile and on the pro-shop schedule (position
-- 'golf_ops_assistant'). The split produced two printed duty sheets for one
-- person to work from, so the pro-shop duties fold into the golf ops role.
--
-- The same pass moves the clubhouse-interior cleaning off the recreation
-- aides. Rec aides work outside (course, range, carts); the inside cleaning
-- belongs to whoever is standing in the building. Exterior cleaning (entrance
-- sweep, storefront glass, exterior trash) deliberately stays with the aides.
--
-- `department` / `area` are left alone: they drive the /operations category
-- filter (a pro-shop merch task is still pro-shop work), which is a separate
-- axis from who is responsible.
--
-- Idempotent: re-running matches no rows.
-- ============================================================================

-- 1. Fold the pro-shop duties into the golf ops assistant role.
UPDATE public.operation_duties
   SET role_group = 'golf_operations_assistant',
       updated_at = NOW()
 WHERE role_group = 'pro_shop_staff';

-- 2. Move the clubhouse-interior cleaning from the rec aides to golf ops.
UPDATE public.operation_duties
   SET role_group = 'golf_operations_assistant',
       updated_at = NOW()
 WHERE role_group = 'recreation_aide'
   AND title IN (
     'Vacuum floors & entry mats',
     'Sweep & mop hard floors',
     'Clean & restock restrooms',
     'Empty trash & recycling',
     'Wipe tables, counters & sills',
     'Clean interior windows & glass',
     'Haul trash to dumpster',
     'Clean & dust TVs and screens',
     'Clean drinking fountains'
   );

-- 3. Refresh the denormalized role on open occurrences.
--
-- The deferred `operation_duties_rematerialize` trigger only rebuilds
-- CURRENT_DATE .. +90, but `tasks` holds a full year of duty occurrences —
-- everything past the window would keep printing under the old role. Only
-- pending rows are touched: completed occurrences are protected history and
-- must keep the role that was actually responsible on the day.
UPDATE public.tasks t
   SET duty_role_group = d.role_group,
       updated_at = NOW()
  FROM public.operation_duties d
 WHERE t.duty_id = d.id
   AND t.status = 'pending'
   AND t.duty_role_group IS DISTINCT FROM d.role_group;

-- 4. Profiles: nobody is recorded as `pro_shop_staff` today, but keep the
--    column consistent with the merged catalogue if that ever changes.
UPDATE public.profiles
   SET role_group = 'golf_operations_assistant'
 WHERE role_group = 'pro_shop_staff';

notify pgrst, 'reload schema';
