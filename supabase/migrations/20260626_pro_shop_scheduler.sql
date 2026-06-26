-- Pro Shop Scheduler: hours/days scheduling for the pro-shop & golf-ops staff
-- (rec aids + golf ops assistants) — a group distinct from the greens crew.
-- See docs/plans/2026-06-26-pro-shop-scheduler-design.md.
--
-- Four additive tables. No auth users / no logins for these staff: this is a
-- lightweight roster used only for scheduling.

-- ── Staff (lightweight, no auth) ────────────────────────────────────────────
create table if not exists public.pro_shop_staff (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null,
  position         text not null default 'rec_aid'
                     check (position in ('rec_aid','golf_ops_assistant')),
  default_group    text not null default 'outside'
                     check (default_group in ('inside','outside')),
  availability_text text,
  -- Standing weekly pattern: { weekly: { sun:{works,group,start,end}, ... }, notes }
  availability     jsonb not null default '{}'::jsonb,
  phone            text,
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_pro_shop_staff_active on public.pro_shop_staff(is_active);
alter table public.pro_shop_staff enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pro_shop_staff'
                 and policyname='pro_shop_staff_all_authenticated') then
    create policy pro_shop_staff_all_authenticated on public.pro_shop_staff
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ── Monthly schedule container ──────────────────────────────────────────────
create table if not exists public.pro_shop_schedules (
  id          uuid primary key default gen_random_uuid(),
  month       date not null unique,           -- first of the month
  title       text not null,
  status      text not null default 'draft'
                check (status in ('draft','published')),
  notes       text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_pro_shop_schedules_month on public.pro_shop_schedules(month);
alter table public.pro_shop_schedules enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pro_shop_schedules'
                 and policyname='pro_shop_schedules_all_authenticated') then
    create policy pro_shop_schedules_all_authenticated on public.pro_shop_schedules
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ── Individual shift assignments ────────────────────────────────────────────
create table if not exists public.pro_shop_shifts (
  id           uuid primary key default gen_random_uuid(),
  schedule_id  uuid references public.pro_shop_schedules(id) on delete cascade,
  staff_id     uuid not null references public.pro_shop_staff(id) on delete cascade,
  shift_date   date not null,
  "group"      text not null default 'outside'
                 check ("group" in ('inside','outside')),
  start_time   time not null,
  end_time     time not null,
  source       text not null default 'manual'
                 check (source in ('template','ai','manual')),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_pro_shop_shifts_date on public.pro_shop_shifts(shift_date);
create index if not exists idx_pro_shop_shifts_schedule on public.pro_shop_shifts(schedule_id);
create index if not exists idx_pro_shop_shifts_staff on public.pro_shop_shifts(staff_id);
alter table public.pro_shop_shifts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pro_shop_shifts'
                 and policyname='pro_shop_shifts_all_authenticated') then
    create policy pro_shop_shifts_all_authenticated on public.pro_shop_shifts
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ── Time off (drives "NO ANIYA"-style annotations + re-cover) ────────────────
create table if not exists public.pro_shop_time_off (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references public.pro_shop_staff(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_pro_shop_time_off_staff on public.pro_shop_time_off(staff_id);
create index if not exists idx_pro_shop_time_off_range on public.pro_shop_time_off(start_date, end_date);
alter table public.pro_shop_time_off enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pro_shop_time_off'
                 and policyname='pro_shop_time_off_all_authenticated') then
    create policy pro_shop_time_off_all_authenticated on public.pro_shop_time_off
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ── updated_at triggers (reuse the calendar helper if present, else create) ──
create or replace function public.pro_shop_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_pro_shop_staff_updated_at on public.pro_shop_staff;
create trigger trg_pro_shop_staff_updated_at before update on public.pro_shop_staff
  for each row execute function public.pro_shop_set_updated_at();
drop trigger if exists trg_pro_shop_schedules_updated_at on public.pro_shop_schedules;
create trigger trg_pro_shop_schedules_updated_at before update on public.pro_shop_schedules
  for each row execute function public.pro_shop_set_updated_at();
drop trigger if exists trg_pro_shop_shifts_updated_at on public.pro_shop_shifts;
create trigger trg_pro_shop_shifts_updated_at before update on public.pro_shop_shifts
  for each row execute function public.pro_shop_set_updated_at();

notify pgrst, 'reload schema';
