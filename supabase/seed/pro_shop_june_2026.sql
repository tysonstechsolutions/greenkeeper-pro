-- Seed: pro-shop staff + June 2026 schedule, derived from the June 2026 Pro Shop
-- Schedule PDF. Idempotent: safe to re-run (rebuilds June from the patterns).
-- Apply via the Supabase Management API (scripts/run-sql equivalent).

-- ── 1. Staff (insert once; skip if any already present) ──────────────────────
insert into public.pro_shop_staff (full_name, position, default_group, sort_order, availability_text, availability)
select * from (values
  -- Inside / golf ops assistants
  ('DJ Skinner', 'golf_ops_assistant', 'inside', 10,
   'Inside opener Mon-Thu, 6:00a-1:00p. Off Fri/Sat/Sun.',
   '{"weekly":{"sun":{"works":false},"mon":{"works":true,"group":"inside","start":"06:00","end":"13:00"},"tue":{"works":true,"group":"inside","start":"06:00","end":"13:00"},"wed":{"works":true,"group":"inside","start":"06:00","end":"13:00"},"thu":{"works":true,"group":"inside","start":"06:00","end":"13:00"},"fri":{"works":false},"sat":{"works":false}},"notes":""}'::jsonb),
  ('Marty Sordyl', 'golf_ops_assistant', 'inside', 11,
   'Inside. Sun/Sat close 2:00p-8:00p, Mon/Tue close 1:00p-8:00p, Fri open 6:00a-12:00p. Off Wed/Thu.',
   '{"weekly":{"sun":{"works":true,"group":"inside","start":"14:00","end":"20:00"},"mon":{"works":true,"group":"inside","start":"13:00","end":"20:00"},"tue":{"works":true,"group":"inside","start":"13:00","end":"20:00"},"wed":{"works":false},"thu":{"works":false},"fri":{"works":true,"group":"inside","start":"06:00","end":"12:00"},"sat":{"works":true,"group":"inside","start":"14:00","end":"20:00"}},"notes":""}'::jsonb),
  ('Mike Pelletier', 'golf_ops_assistant', 'inside', 12,
   'Inside. Sun/Sat open 5:30a-2:30p, Wed/Thu 12:30p-8:00p, Fri 11:30a-8:00p. Off Mon/Tue.',
   '{"weekly":{"sun":{"works":true,"group":"inside","start":"05:30","end":"14:30"},"mon":{"works":false},"tue":{"works":false},"wed":{"works":true,"group":"inside","start":"12:30","end":"20:00"},"thu":{"works":true,"group":"inside","start":"12:30","end":"20:00"},"fri":{"works":true,"group":"inside","start":"11:30","end":"20:00"},"sat":{"works":true,"group":"inside","start":"05:30","end":"14:30"}},"notes":""}'::jsonb),
  -- Outside / rec aids
  ('Joe Sordyl', 'rec_aid', 'outside', 20,
   'Outside. Sun/Mon/Sat 8:00a-2:00p, Tue 2:00p-8:00p. Off Wed/Thu/Fri.',
   '{"weekly":{"sun":{"works":true,"group":"outside","start":"08:00","end":"14:00"},"mon":{"works":true,"group":"outside","start":"08:00","end":"14:00"},"tue":{"works":true,"group":"outside","start":"14:00","end":"20:00"},"wed":{"works":false},"thu":{"works":false},"fri":{"works":false},"sat":{"works":true,"group":"outside","start":"08:00","end":"14:00"}},"notes":""}'::jsonb),
  ('Devin Martinez', 'rec_aid', 'outside', 21,
   'Outside. Sun 12:00p-8:00p, Tue 8:00a-2:00p, Thu 2:00p-8:00p.',
   '{"weekly":{"sun":{"works":true,"group":"outside","start":"12:00","end":"20:00"},"mon":{"works":false},"tue":{"works":true,"group":"outside","start":"08:00","end":"14:00"},"wed":{"works":false},"thu":{"works":true,"group":"outside","start":"14:00","end":"20:00"},"fri":{"works":false},"sat":{"works":false}},"notes":""}'::jsonb),
  ('Tony Morales', 'rec_aid', 'outside', 22,
   'Outside. Wed/Thu/Fri 8:00a-2:00p, Sat 12:00p-6:00p.',
   '{"weekly":{"sun":{"works":false},"mon":{"works":false},"tue":{"works":false},"wed":{"works":true,"group":"outside","start":"08:00","end":"14:00"},"thu":{"works":true,"group":"outside","start":"08:00","end":"14:00"},"fri":{"works":true,"group":"outside","start":"08:00","end":"14:00"},"sat":{"works":true,"group":"outside","start":"12:00","end":"18:00"}},"notes":""}'::jsonb),
  ('Aniya Brackett', 'rec_aid', 'outside', 23,
   'Outside close 1:00p-8:00p Sun/Tue/Wed/Thu/Fri. Off Mon/Sat.',
   '{"weekly":{"sun":{"works":true,"group":"outside","start":"13:00","end":"20:00"},"mon":{"works":false},"tue":{"works":true,"group":"outside","start":"13:00","end":"20:00"},"wed":{"works":true,"group":"outside","start":"13:00","end":"20:00"},"thu":{"works":true,"group":"outside","start":"13:00","end":"20:00"},"fri":{"works":true,"group":"outside","start":"13:00","end":"20:00"},"sat":{"works":false}},"notes":""}'::jsonb),
  ('Bart Diaz', 'rec_aid', 'outside', 24,
   'Outside closer Mon/Wed/Fri 3:00p-8:00p.',
   '{"weekly":{"sun":{"works":false},"mon":{"works":true,"group":"outside","start":"15:00","end":"20:00"},"tue":{"works":false},"wed":{"works":true,"group":"outside","start":"15:00","end":"20:00"},"thu":{"works":false},"fri":{"works":true,"group":"outside","start":"15:00","end":"20:00"},"sat":{"works":false}},"notes":""}'::jsonb),
  ('Colin O''Neill', 'rec_aid', 'outside', 25,
   'New rec aid — availability not set yet.',
   '{"weekly":{"sun":{"works":false},"mon":{"works":false},"tue":{"works":false},"wed":{"works":false},"thu":{"works":false},"fri":{"works":false},"sat":{"works":false}},"notes":"New hire — set availability."}'::jsonb)
) as v(full_name, position, default_group, sort_order, availability_text, availability)
where not exists (select 1 from public.pro_shop_staff);

-- Rec aids are flex (can cover any area); golf ops assistants stay inside.
update public.pro_shop_staff set flex = (position = 'rec_aid');

-- ── 2. June 2026 schedule container ──────────────────────────────────────────
insert into public.pro_shop_schedules (month, title, status)
values ('2026-06-01', 'June 2026 Pro Shop Schedule', 'published')
on conflict (month) do nothing;

-- ── 3. Rebuild June from the weekly patterns ─────────────────────────────────
delete from public.pro_shop_shifts
 where schedule_id = (select id from public.pro_shop_schedules where month='2026-06-01');

-- Aniya out 21-25 Jun (per the sheet). Reset + reinsert so the seed is idempotent.
delete from public.pro_shop_time_off
 where staff_id = (select id from public.pro_shop_staff where full_name='Aniya Brackett')
   and start_date = '2026-06-21';
insert into public.pro_shop_time_off (staff_id, start_date, end_date, reason)
select id, '2026-06-21', '2026-06-25', 'Out 21-25 Jun'
  from public.pro_shop_staff where full_name='Aniya Brackett';

-- Stamp each active person's weekly pattern across June, skipping their time-off.
insert into public.pro_shop_shifts (schedule_id, staff_id, shift_date, "group", start_time, end_time, source)
select sch.id, s.id, g.d::date,
       (p->>'group'), (p->>'start')::time, (p->>'end')::time, 'template'
from public.pro_shop_schedules sch
cross join public.pro_shop_staff s
cross join generate_series('2026-06-01'::date, '2026-06-30'::date, interval '1 day') g(d)
cross join lateral (
  select s.availability->'weekly'-> (
    case extract(dow from g.d)::int
      when 0 then 'sun' when 1 then 'mon' when 2 then 'tue' when 3 then 'wed'
      when 4 then 'thu' when 5 then 'fri' when 6 then 'sat' end
  ) as p
) pat
where sch.month = '2026-06-01'
  and s.is_active
  and (p->>'works')::boolean is true
  and not exists (
    select 1 from public.pro_shop_time_off t
     where t.staff_id = s.id and g.d::date between t.start_date and t.end_date
  );

-- Bart covers Aniya's closing slot on the days she's out (matches the
-- handwritten cover on the sheet). Wed 24 he already closes, so extend that one.
insert into public.pro_shop_shifts (schedule_id, staff_id, shift_date, "group", start_time, end_time, source, note)
select sch.id, b.id, d::date, 'outside', '13:00'::time, '20:00'::time, 'manual', 'Covering for Aniya'
from public.pro_shop_schedules sch
cross join (select id from public.pro_shop_staff where full_name='Bart Diaz') b
cross join (values ('2026-06-21'::date), ('2026-06-23'::date), ('2026-06-25'::date)) v(d)
where sch.month = '2026-06-01';

update public.pro_shop_shifts
   set start_time = '13:00', note = 'Covering for Aniya'
 where shift_date = '2026-06-24'
   and staff_id = (select id from public.pro_shop_staff where full_name='Bart Diaz');
