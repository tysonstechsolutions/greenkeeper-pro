-- Attach the real report sample + how-to instructions + a due date to each
-- obligation. The GM uploads the actual document/report (Excel/PDF/photo), types
-- what it is and how to do it, and sets the day it's due. Files live in the
-- existing 'documents' storage bucket (mirrors created_documents). A row may be
-- instructions-only (no file), so storage_path is nullable.

create table if not exists public.obligation_documents (
  id            uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.obligations(id) on delete cascade,
  storage_path  text,                                 -- path in the 'documents' bucket (nullable: instructions-only)
  file_name     text,
  mime_type     text,
  instructions  text,
  due_date      date,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_obligation_documents_obligation on public.obligation_documents (obligation_id);

alter table public.obligation_documents enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='obligation_documents'
      and policyname='obligation_documents_all_authenticated'
  ) then
    create policy obligation_documents_all_authenticated on public.obligation_documents
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Reuse the existing 'documents' bucket + its storage policies (created by
-- 20260617170000_created_documents.sql). Keep these idempotent inserts/policies
-- here too so this migration works even if applied in isolation.
insert into storage.buckets (id, name, public)
  values ('documents', 'documents', true)
  on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='documents_insert') then
    create policy documents_insert on storage.objects
      for insert to authenticated with check (bucket_id = 'documents');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='documents_select') then
    create policy documents_select on storage.objects
      for select to public using (bucket_id = 'documents');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='documents_delete') then
    create policy documents_delete on storage.objects
      for delete to authenticated using (bucket_id = 'documents');
  end if;
end $$;

notify pgrst, 'reload schema';
