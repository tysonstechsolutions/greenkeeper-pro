-- ============================================================================
-- Buckley's has a manager
-- ============================================================================
--
-- Brittany runs Buckley's. She is scheduled like everyone else — her own
-- availability, her own hours — but she is not one of the restaurant staff a
-- day needs two of, so she gets her own job (`restaurant_manager`) and with it
-- her own colour on the board, her own section in the day, and her own line in
-- the printout's legend.
--
-- Widening these four CHECKs is the whole change; the group and position lists
-- in `types.ts` carry the rest (see AREA_GROUPS / AREA_POSITIONS).
-- ============================================================================

ALTER TABLE public.pro_shop_staff DROP CONSTRAINT IF EXISTS pro_shop_staff_position_check;
ALTER TABLE public.pro_shop_staff ADD CONSTRAINT pro_shop_staff_position_check
  CHECK (position = ANY (ARRAY[
    'rec_aid', 'golf_ops_assistant', 'maintenance_crew', 'mechanic',
    'restaurant_staff', 'restaurant_manager'
  ]::text[]));

ALTER TABLE public.pro_shop_staff DROP CONSTRAINT IF EXISTS pro_shop_staff_default_group_check;
ALTER TABLE public.pro_shop_staff ADD CONSTRAINT pro_shop_staff_default_group_check
  CHECK (default_group = ANY (ARRAY[
    'inside', 'outside', 'grounds', 'shop', 'restaurant', 'restaurant_manager'
  ]::text[]));

ALTER TABLE public.pro_shop_shifts DROP CONSTRAINT IF EXISTS pro_shop_shifts_group_check;
ALTER TABLE public.pro_shop_shifts ADD CONSTRAINT pro_shop_shifts_group_check
  CHECK ("group" = ANY (ARRAY[
    'inside', 'outside', 'grounds', 'shop', 'restaurant', 'restaurant_manager'
  ]::text[]));

ALTER TABLE public.pro_shop_coverage_rules DROP CONSTRAINT IF EXISTS pro_shop_coverage_rules_group_check;
ALTER TABLE public.pro_shop_coverage_rules ADD CONSTRAINT pro_shop_coverage_rules_group_check
  CHECK ("group" = ANY (ARRAY[
    'inside', 'outside', 'grounds', 'shop', 'restaurant', 'restaurant_manager'
  ]::text[]));

NOTIFY pgrst, 'reload schema';
