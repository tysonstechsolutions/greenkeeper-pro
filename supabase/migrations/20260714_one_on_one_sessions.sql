-- ============================================================================
-- Dynamic 1:1 system.
--
--   1. staff_one_on_one_sessions — a real, structured 1:1: the question set
--      (transition / 30-day / monthly / custom) with the answers captured
--      in-app, a summary, and an optional link to the scheduled calendar 1:1.
--      Replaces the old free-text "Log a 1:1" (which wrote a staff_records row).
--
--   2. staff_engagement_profiles — one quietly-maintained profile per employee
--      (interests, family, career goals, sports, life goals, communication
--      notes). The AI updates it after each 1:1 so future monthly questions get
--      personal and build on prior conversations.
--
-- Personal/formal follow-ups still live in staff_concerns (relabeled
-- "Follow-ups" in the UI). Applied action items flow into the existing My Day,
-- time-off, and calendar tables — no schema needed here for those.
-- ============================================================================

-- ── 1. Structured 1:1 sessions ─────────────────────────────────────────────
create table if not exists public.staff_one_on_one_sessions (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.profiles(id) on delete cascade,
  session_date  date not null default current_date,
  template      text not null default 'monthly'
                  check (template in ('transition','thirty_day','monthly','custom')),
  status        text not null default 'completed'
                  check (status in ('draft','completed')),
  -- [{ id, section, prompt, answer }]
  questions     jsonb not null default '[]'::jsonb,
  summary       text,
  -- Optional link back to the scheduled calendar 1:1 (staff_one_on_ones.id).
  scheduled_id  uuid,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_one_on_one_sessions_employee
  on public.staff_one_on_one_sessions(employee_id, session_date desc);
alter table public.staff_one_on_one_sessions enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='staff_one_on_one_sessions'
      and policyname='one_on_one_sessions_all_authenticated'
  ) then
    create policy one_on_one_sessions_all_authenticated on public.staff_one_on_one_sessions
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ── 2. Per-employee engagement profile (AI-maintained) ─────────────────────
create table if not exists public.staff_engagement_profiles (
  employee_id   uuid primary key references public.profiles(id) on delete cascade,
  -- { interests[], family[], career_goals[], sports[], life_goals[],
  --   communication_notes, misc[] }
  profile       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.staff_engagement_profiles enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='staff_engagement_profiles'
      and policyname='engagement_profiles_all_authenticated'
  ) then
    create policy engagement_profiles_all_authenticated on public.staff_engagement_profiles
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ── Shared updated_at trigger ──────────────────────────────────────────────
create or replace function public.one_on_one_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_one_on_one_sessions_updated_at on public.staff_one_on_one_sessions;
create trigger trg_one_on_one_sessions_updated_at
  before update on public.staff_one_on_one_sessions
  for each row execute function public.one_on_one_set_updated_at();

drop trigger if exists trg_engagement_profiles_updated_at on public.staff_engagement_profiles;
create trigger trg_engagement_profiles_updated_at
  before update on public.staff_engagement_profiles
  for each row execute function public.one_on_one_set_updated_at();

notify pgrst, 'reload schema';
