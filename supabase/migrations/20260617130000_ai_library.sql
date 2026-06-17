-- AI learning library
-- Reuse past answers (free) before paying for a new AI generation, and keep a
-- usable fallback when the AI is down or a hardcoded model retires.
-- Matching is done locally via pg_trgm similarity (no paid embeddings).

create extension if not exists pg_trgm;

create table if not exists public.ai_library (
  id          uuid primary key default gen_random_uuid(),
  feature     text not null,                       -- e.g. 'work_order', 'fix_instructions'
  input_text  text not null,                       -- salient request text used for matching
  input_meta  jsonb not null default '{}'::jsonb,  -- structured context (facility, hole, etc.)
  output_text text not null,                       -- the answer we serve/reuse
  output_meta jsonb not null default '{}'::jsonb,  -- structured extras (e.g. work_type)
  source      text not null default 'ai' check (source in ('ai','edited','manual')),
  model       text,
  use_count   integer not null default 0,
  last_used_at timestamptz,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_ai_library_feature on public.ai_library (feature);
create index if not exists idx_ai_library_input_trgm on public.ai_library using gin (input_text gin_trgm_ops);
create index if not exists idx_ai_library_feature_created on public.ai_library (feature, created_at desc);

alter table public.ai_library enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_library'
      and policyname = 'ai_library_all_authenticated'
  ) then
    create policy ai_library_all_authenticated on public.ai_library
      for all to authenticated using (true) with check (true);
  end if;
end $$;

create or replace function public.ai_library_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_ai_library_updated_at on public.ai_library;
create trigger trg_ai_library_updated_at
  before update on public.ai_library
  for each row execute function public.ai_library_set_updated_at();

-- Best library match for a feature, by trigram similarity of the input text.
-- Prefers user-edited answers, then most-reused, then most recent.
create or replace function public.match_ai_library(
  p_feature   text,
  p_input     text,
  p_threshold real default 0.30
)
returns table (
  id          uuid,
  output_text text,
  output_meta jsonb,
  source      text,
  score       real
)
language sql stable as $$
  select l.id, l.output_text, l.output_meta, l.source,
         similarity(l.input_text, p_input) as score
  from public.ai_library l
  where l.feature = p_feature
    and similarity(l.input_text, p_input) >= p_threshold
  order by score desc,
           (l.source = 'edited') desc,
           l.use_count desc,
           l.created_at desc
  limit 1;
$$;

-- Atomic usage bump when a library answer is reused.
create or replace function public.bump_ai_library_use(p_id uuid)
returns void
language sql as $$
  update public.ai_library
     set use_count = use_count + 1, last_used_at = now()
   where id = p_id;
$$;

grant execute on function public.match_ai_library(text, text, real) to anon, authenticated, service_role;
grant execute on function public.bump_ai_library_use(uuid) to anon, authenticated, service_role;
