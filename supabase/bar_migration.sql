-- v80: dedicated bar work surface. Run once on the existing database.
alter table public.restaurant_tables
  add column if not exists is_bar boolean not null default false;
insert into public.restaurant_tables (name, is_vip, is_bar, status, guests, active)
select 'Бар', false, true, 'free', 0, true
where not exists (select 1 from public.restaurant_tables where is_bar = true);
create unique index if not exists restaurant_tables_one_bar_idx
  on public.restaurant_tables (is_bar) where is_bar = true;
