-- Inspection Readiness Checklists
-- Command inspection preparation for MWR golf courses

-- ── Tables ──

create table if not exists inspection_checklists (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  inspection_date date,
  inspector_name text,
  status        text not null default 'draft' check (status in ('draft','in_progress','completed')),
  notes         text,
  created_by    uuid not null references profiles(id) on delete cascade,
  score         smallint check (score is null or (score >= 0 and score <= 100)),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists inspection_items (
  id            uuid primary key default gen_random_uuid(),
  checklist_id  uuid not null references inspection_checklists(id) on delete cascade,
  category      text not null check (category in ('course_conditions','safety','environmental','equipment','facilities','documentation')),
  title         text not null,
  description   text,
  status        text not null default 'not_started' check (status in ('not_started','in_progress','compliant','non_compliant','na')),
  notes         text,
  photo_ids     text[] not null default '{}',
  sort_order    int not null default 0,
  reviewed_by   uuid references profiles(id) on delete set null,
  reviewed_at   timestamptz
);

-- ── Indexes ──

create index if not exists idx_inspection_items_checklist on inspection_items(checklist_id);
create index if not exists idx_inspection_items_category  on inspection_items(category);

-- ── Updated-at trigger ──

create or replace function update_inspection_checklist_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_inspection_checklist_updated on inspection_checklists;
create trigger trg_inspection_checklist_updated
  before update on inspection_checklists
  for each row execute function update_inspection_checklist_timestamp();

-- ── RLS ──

alter table inspection_checklists enable row level security;
alter table inspection_items enable row level security;

-- All authenticated users can read
create policy "inspection_checklists_select"
  on inspection_checklists for select
  to authenticated
  using (true);

create policy "inspection_items_select"
  on inspection_items for select
  to authenticated
  using (true);

-- Only super / asst_super / director can modify checklists
create policy "inspection_checklists_insert"
  on inspection_checklists for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "inspection_checklists_update"
  on inspection_checklists for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "inspection_checklists_delete"
  on inspection_checklists for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

-- Same RLS for items
create policy "inspection_items_insert"
  on inspection_items for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "inspection_items_update"
  on inspection_items for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );

create policy "inspection_items_delete"
  on inspection_items for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super','asst_super','director')
    )
  );
