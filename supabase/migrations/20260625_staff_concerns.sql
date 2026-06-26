-- 1:1 concern tracking. Each employee concern is its own item that lives across
-- 1:1 meetings, carrying a thread of dated notes, until it is reconciled.
-- Reconciled concerns drop off the active 1:1 sheet but stay on the site as
-- history (archived, never deleted).
create table if not exists public.staff_concerns (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  opened_on     date not null default current_date,
  status        text not null default 'open' check (status in ('open','reconciled')),
  reconciled_on date,
  updates       jsonb not null default '[]'::jsonb, -- [{ "date": "YYYY-MM-DD", "note": "..." }]
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_staff_concerns_employee on public.staff_concerns(employee_id, status);
alter table public.staff_concerns enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='staff_concerns'
      and policyname='staff_concerns_all_authenticated'
  ) then
    create policy staff_concerns_all_authenticated on public.staff_concerns
      for all to authenticated using (true) with check (true);
  end if;
end $$;

create or replace function public.staff_concerns_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_staff_concerns_updated_at on public.staff_concerns;
create trigger trg_staff_concerns_updated_at
  before update on public.staff_concerns
  for each row execute function public.staff_concerns_set_updated_at();

notify pgrst, 'reload schema';
