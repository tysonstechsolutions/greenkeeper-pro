-- Environmental Compliance Log tables
-- EPA/NPDES discharge monitoring & buffer zone tracking

-- ── Environmental Logs ──
create table if not exists public.environmental_logs (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in ('stormwater','discharge','buffer_zone','spill','waste_disposal','fuel_storage','wildlife')),
  title        text not null,
  description  text,
  severity     text not null default 'routine' check (severity in ('routine','minor','major','critical')),
  date_observed date not null default current_date,
  location     text,
  hole_numbers integer[] not null default '{}',
  corrective_action text,
  corrective_deadline date,
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users(id),
  photo_ids    text[] not null default '{}',
  reported_by  uuid not null references auth.users(id),
  npdes_reportable boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_env_logs_date on public.environmental_logs (date_observed);
create index if not exists idx_env_logs_category on public.environmental_logs (category);
create index if not exists idx_env_logs_npdes on public.environmental_logs (npdes_reportable);

-- ── Buffer Zones ──
create table if not exists public.buffer_zones (
  id                  uuid primary key default gen_random_uuid(),
  zone_name           text not null,
  water_feature       text not null,
  buffer_distance_ft  integer not null default 25,
  last_inspected      date,
  inspected_by        uuid references auth.users(id),
  status              text not null default 'needs_review' check (status in ('compliant','non_compliant','needs_review')),
  vegetation_condition text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_buffer_zones_status on public.buffer_zones (status);

-- ── RLS ──
alter table public.environmental_logs enable row level security;
alter table public.buffer_zones enable row level security;

-- SELECT: any authenticated user
create policy "env_logs_select" on public.environmental_logs
  for select to authenticated using (true);

create policy "buffer_zones_select" on public.buffer_zones
  for select to authenticated using (true);

-- INSERT/UPDATE/DELETE: super, asst_super, director only
create policy "env_logs_insert" on public.environmental_logs
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "env_logs_update" on public.environmental_logs
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "env_logs_delete" on public.environmental_logs
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "buffer_zones_insert" on public.buffer_zones
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "buffer_zones_update" on public.buffer_zones
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "buffer_zones_delete" on public.buffer_zones
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );
