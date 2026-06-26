-- Internal calendar: two additive tables. Golf outings continue to live in the
-- existing `tournaments` table (the calendar reads it). See
-- docs/plans/2026-06-25-internal-calendar-design.md.

-- General calendar items: F&B events, appointments, meetings, deadlines, other.
create table if not exists public.calendar_events (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  category        text not null default 'other'
                    check (category in ('fb_event','appointment','meeting','deadline','other')),
  event_date      date not null,
  end_date        date,
  start_time      time,
  end_time        time,
  all_day         boolean not null default false,
  location        text,
  expected_guests integer,
  contact_name    text,
  contact_phone   text,
  status          text,
  notes           text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_calendar_events_date on public.calendar_events(event_date);
alter table public.calendar_events enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='calendar_events'
                 and policyname='calendar_events_all_authenticated') then
    create policy calendar_events_all_authenticated on public.calendar_events
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Scheduled 1:1 meetings (reschedulable). The discussion + concerns are logged
-- separately on the employee profile (staff_records / staff_concerns).
create table if not exists public.staff_one_on_ones (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.profiles(id) on delete cascade,
  scheduled_on   date not null,
  scheduled_time time,
  status         text not null default 'scheduled'
                   check (status in ('scheduled','completed','canceled')),
  notes          text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_staff_one_on_ones_date on public.staff_one_on_ones(scheduled_on);
create index if not exists idx_staff_one_on_ones_employee on public.staff_one_on_ones(employee_id);
alter table public.staff_one_on_ones enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='staff_one_on_ones'
                 and policyname='staff_one_on_ones_all_authenticated') then
    create policy staff_one_on_ones_all_authenticated on public.staff_one_on_ones
      for all to authenticated using (true) with check (true);
  end if;
end $$;

create or replace function public.calendar_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_calendar_events_updated_at on public.calendar_events;
create trigger trg_calendar_events_updated_at before update on public.calendar_events
  for each row execute function public.calendar_set_updated_at();
drop trigger if exists trg_staff_one_on_ones_updated_at on public.staff_one_on_ones;
create trigger trg_staff_one_on_ones_updated_at before update on public.staff_one_on_ones
  for each row execute function public.calendar_set_updated_at();

notify pgrst, 'reload schema';
