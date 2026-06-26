-- Pro Shop scheduler: flex employees. Rec aids can cover any area (inside or
-- outside) when needed; golf ops assistants stay inside by default. `flex` is a
-- per-person override so either default can be changed individually.

alter table public.pro_shop_staff
  add column if not exists flex boolean not null default true;

-- Initial values: rec aids are flex, golf ops assistants are not.
update public.pro_shop_staff set flex = (position = 'rec_aid');

notify pgrst, 'reload schema';
