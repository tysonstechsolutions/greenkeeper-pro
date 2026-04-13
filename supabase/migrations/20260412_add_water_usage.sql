-- Water Usage Reporting: meter readings & monthly targets
-- Ties irrigation logs to base utilities reporting (DoD MWR)

-- ── Water Meter Readings ──
create table if not exists public.water_meter_readings (
  id            uuid primary key default gen_random_uuid(),
  meter_id      text not null,
  reading_date  date not null default current_date,
  reading_value numeric not null check (reading_value >= 0),
  previous_reading numeric,
  usage_gallons numeric not null default 0 check (usage_gallons >= 0),
  source        text not null default 'municipal'
                check (source in ('municipal','well','reclaimed','pond','mixed')),
  notes         text,
  recorded_by   uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);

create index idx_water_meter_readings_date on public.water_meter_readings(reading_date);
create index idx_water_meter_readings_meter on public.water_meter_readings(meter_id);

-- ── Water Usage Targets ──
create table if not exists public.water_usage_targets (
  id             uuid primary key default gen_random_uuid(),
  year           int not null,
  month          int not null check (month between 1 and 12),
  target_gallons numeric not null check (target_gallons > 0),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (year, month)
);

-- ── RLS ──
alter table public.water_meter_readings enable row level security;
alter table public.water_usage_targets  enable row level security;

-- Readings: all auth'd can SELECT
create policy "readings_select" on public.water_meter_readings
  for select to authenticated using (true);

-- Readings: super, asst_super, director, foreman can INSERT
create policy "readings_insert" on public.water_meter_readings
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director','foreman')
    )
  );

-- Readings: super, asst_super, director, foreman can UPDATE
create policy "readings_update" on public.water_meter_readings
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director','foreman')
    )
  );

-- Readings: super, asst_super, director can DELETE
create policy "readings_delete" on public.water_meter_readings
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

-- Targets: all auth'd can SELECT
create policy "targets_select" on public.water_usage_targets
  for select to authenticated using (true);

-- Targets: super, asst_super, director can INSERT
create policy "targets_insert" on public.water_usage_targets
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

-- Targets: super, asst_super, director can UPDATE
create policy "targets_update" on public.water_usage_targets
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

-- Targets: super, asst_super, director can DELETE
create policy "targets_delete" on public.water_usage_targets
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );
