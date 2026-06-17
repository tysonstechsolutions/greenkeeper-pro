-- Link work orders to clubhouse/facilities issues.
--   work_order_id — the issue was created from / escalated to this work order
--   building      — '8400' (Clubhouse / Buckley's) or '3311' (Maintenance), for grouping

alter table public.clubhouse_issues
  add column if not exists work_order_id uuid references public.work_orders(id) on delete set null;
alter table public.clubhouse_issues
  add column if not exists building text;

create index if not exists idx_clubhouse_issues_work_order on public.clubhouse_issues(work_order_id);
create index if not exists idx_clubhouse_issues_building on public.clubhouse_issues(building);
