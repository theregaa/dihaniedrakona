-- ============================================================
--  TABLE PAYMENTS / ОПЛАТЫ ПО ОТКРЫТОМУ СТОЛУ
--
-- Позволяет принимать несколько оплат по одному открытому столу,
-- не закрывая стол. Финальный чек создаётся только при закрытии стола.
-- ============================================================

alter table public.orders
  add column if not exists payment_status text not null default 'unpaid';

alter table public.orders
  add column if not exists paid_at timestamptz;

alter table public.orders
  drop constraint if exists orders_payment_status_check;

alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('unpaid','paid'));

update public.orders
set payment_status='paid'
where status='done' and payment_status='unpaid';

create index if not exists orders_table_payment_status_idx
  on public.orders(table_id, shift_id, payment_status, created_at);

create table if not exists public.table_payments (
  id bigint generated always as identity primary key,
  table_id bigint not null references public.restaurant_tables(id),
  shift_id bigint references public.cash_register_shifts(id),
  staff_id uuid references public.staff_profiles(id),
  amount numeric(10,2) not null check (amount >= 0),
  payment_method text not null check (payment_method in ('cash','card','mixed','transfer')),
  cash_amount numeric(10,2) not null default 0 check (cash_amount >= 0),
  card_amount numeric(10,2) not null default 0 check (card_amount >= 0),
  transfer_amount numeric(10,2) not null default 0 check (transfer_amount >= 0),
  cash_received numeric(10,2) not null default 0 check (cash_received >= 0),
  change_amount numeric(10,2) not null default 0 check (change_amount >= 0),
  created_at timestamptz not null default now(),
  constraint table_payment_sum check (cash_amount + card_amount + transfer_amount = amount),
  constraint table_payment_cash_change check (cash_received >= cash_amount),
  constraint table_payment_change_value check (change_amount = cash_received - cash_amount)
);

create index if not exists table_payments_table_idx
  on public.table_payments(table_id, shift_id, created_at desc);

alter table public.table_payments enable row level security;

drop policy if exists "active staff can read table payments" on public.table_payments;
create policy "active staff can read table payments"
on public.table_payments for select to authenticated
using (exists (
  select 1 from public.staff_profiles s
  where s.id=auth.uid() and s.active=true
));

drop policy if exists "waiter or admin can create table payments" on public.table_payments;
create policy "waiter or admin can create table payments"
on public.table_payments for insert to authenticated
with check (exists (
  select 1 from public.staff_profiles s
  where s.id=auth.uid() and s.active=true and s.role in ('waiter','admin')
));
