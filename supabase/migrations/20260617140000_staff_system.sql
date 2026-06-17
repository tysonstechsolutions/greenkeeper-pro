-- Staff management system:
--   1. Org hierarchy  (profiles.supervisor_id)
--   2. Employee documents (staff_documents + storage bucket)
--   3. Per-employee tracking timeline (staff_records)

-- ── 1. Org hierarchy ────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists supervisor_id uuid references public.profiles(id) on delete set null;
create index if not exists idx_profiles_supervisor on public.profiles(supervisor_id);

-- ── 2. Employee documents ───────────────────────────────────────────────────
create table if not exists public.staff_documents (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  category     text not null default 'other',  -- offer | certification | tax | review | id | other
  storage_path text,
  url          text,
  file_type    text,
  uploaded_by  uuid,
  created_at   timestamptz not null default now()
);
create index if not exists idx_staff_documents_employee on public.staff_documents(employee_id);
alter table public.staff_documents enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='staff_documents'
      and policyname='staff_documents_all_authenticated'
  ) then
    create policy staff_documents_all_authenticated on public.staff_documents
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ── 3. Tracking timeline ────────────────────────────────────────────────────
create table if not exists public.staff_records (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  type        text not null check (type in
                ('holiday_pay','call_out','sick_time','disciplinary','one_on_one','note')),
  event_date  date not null default current_date,
  title       text,
  details     text,
  hours       numeric(6,2),
  amount      numeric(10,2),
  follow_up   text,
  attachment_url text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_staff_records_employee on public.staff_records(employee_id, event_date desc);
create index if not exists idx_staff_records_type on public.staff_records(type);
alter table public.staff_records enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='staff_records'
      and policyname='staff_records_all_authenticated'
  ) then
    create policy staff_records_all_authenticated on public.staff_records
      for all to authenticated using (true) with check (true);
  end if;
end $$;

create or replace function public.staff_records_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_staff_records_updated_at on public.staff_records;
create trigger trg_staff_records_updated_at
  before update on public.staff_records
  for each row execute function public.staff_records_set_updated_at();

-- ── 4. Storage bucket for employee documents ────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('staff-documents', 'staff-documents', true)
  on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='staff_docs_insert') then
    create policy staff_docs_insert on storage.objects
      for insert to authenticated with check (bucket_id = 'staff-documents');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='staff_docs_select') then
    create policy staff_docs_select on storage.objects
      for select to public using (bucket_id = 'staff-documents');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='staff_docs_delete') then
    create policy staff_docs_delete on storage.objects
      for delete to authenticated using (bucket_id = 'staff-documents');
  end if;
end $$;
