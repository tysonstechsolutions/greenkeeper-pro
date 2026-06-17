-- A single place to track every document the app generates (sole source, SOW,
-- onboarding packets, etc.) so they can be found + re-downloaded later.
-- Work orders and purchase requests keep their own rich tables/views; this is
-- for the generators that previously only triggered a one-off download.

create table if not exists public.created_documents (
  id           uuid primary key default gen_random_uuid(),
  doc_type     text not null,                        -- 'sole_source' | 'sow' | 'onboarding_packet' | ...
  title        text not null,
  storage_path text,                                 -- path in the 'documents' bucket
  filename     text,
  meta         jsonb not null default '{}'::jsonb,
  created_by   uuid,
  created_at   timestamptz not null default now()
);

create index if not exists idx_created_documents_created on public.created_documents (created_at desc);
create index if not exists idx_created_documents_type on public.created_documents (doc_type);

alter table public.created_documents enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='created_documents'
      and policyname='created_documents_all_authenticated'
  ) then
    create policy created_documents_all_authenticated on public.created_documents
      for all to authenticated using (true) with check (true);
  end if;
end $$;

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
