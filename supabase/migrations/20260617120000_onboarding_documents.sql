-- Onboarding & SOP document library (GM side).
-- Stores editable training docs, SOPs, worksheets, info sheets, opening/closing
-- and cart procedures. Seeded from src/lib/onboarding/default-documents.ts on
-- first load; edited in-app thereafter. Fully open access model (single shared
-- authenticated account), so the policy allows any authenticated user.

create table if not exists public.onboarding_documents (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  category text not null,
  roles text[] not null default '{}'::text[],
  body text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.onboarding_documents enable row level security;

drop policy if exists onboarding_documents_rw on public.onboarding_documents;
create policy onboarding_documents_rw on public.onboarding_documents
  for all to authenticated using (true) with check (true);
