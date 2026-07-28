-- Record an employee's last working day.
--
-- `pro_shop_staff` only had `is_active`, an on/off switch with no date. When a
-- part-timer gives notice there was nowhere to record "last day is 4 August",
-- so the schedule engine kept stamping their weekly pattern across every
-- future month. Flipping is_active off early removes them from the schedule
-- they are still working; leaving it on schedules them after they have gone.
--
-- `employed_through` is the missing middle: they stay on the schedule up to and
-- including that date, and disappear after it, with no further action needed.
-- NULL means open-ended employment, which is the normal case.

ALTER TABLE public.pro_shop_staff
  ADD COLUMN IF NOT EXISTS employed_through DATE;

COMMENT ON COLUMN public.pro_shop_staff.employed_through IS
  'Last day this person works, inclusive. NULL = open-ended. The schedule '
  'engine stops generating shifts after this date.';
