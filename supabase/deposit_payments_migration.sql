-- Депозит + отдельная полная оплата позиций для «Дыхание Дракона».
-- НЕ использует отменённую table_payments.
-- Выполнить один раз в Supabase SQL Editor.

alter table public.restaurant_tables
  add column if not exists deposit_total numeric(10,2) not null default 0 check (deposit_total >= 0),
  add column if not exists deposit_cash numeric(10,2) not null default 0 check (deposit_cash >= 0),
  add column if not exists deposit_card numeric(10,2) not null default 0 check (deposit_card >= 0),
  add column if not exists deposit_transfer numeric(10,2) not null default 0 check (deposit_transfer >= 0);

alter table public.cash_register_receipts
  add column if not exists receipt_type text not null default 'close'
    check (receipt_type in ('deposit','item','close','bar')),
  add column if not exists payment_details jsonb not null default '{}'::jsonb;

create table if not exists public.order_item_payments (
  id bigint generated always as identity primary key,
  order_item_id bigint not null references public.order_items(id) on delete cascade,
  order_id bigint not null references public.orders(id) on delete cascade,
  table_id bigint not null references public.restaurant_tables(id) on delete cascade,
  shift_id bigint references public.cash_register_shifts(id),
  staff_id uuid references public.staff_profiles(id),
  amount numeric(10,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash','card','mixed','transfer')),
  cash_amount numeric(10,2) not null default 0 check (cash_amount >= 0),
  card_amount numeric(10,2) not null default 0 check (card_amount >= 0),
  transfer_amount numeric(10,2) not null default 0 check (transfer_amount >= 0),
  cash_received numeric(10,2) not null default 0 check (cash_received >= 0),
  change_amount numeric(10,2) not null default 0 check (change_amount >= 0),
  receipt_id bigint references public.cash_register_receipts(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint item_payment_sum check (cash_amount + card_amount + transfer_amount = amount),
  constraint item_payment_cash_change check (cash_received >= cash_amount),
  constraint item_payment_change_value check (change_amount = cash_received - cash_amount)
);

create unique index if not exists order_item_payments_item_uidx on public.order_item_payments(order_item_id);
create index if not exists order_item_payments_order_idx on public.order_item_payments(order_id);
create index if not exists order_item_payments_shift_idx on public.order_item_payments(shift_id, created_at desc);

alter table public.order_item_payments enable row level security;

drop policy if exists "staff can read item payments" on public.order_item_payments;
create policy "staff can read item payments"
on public.order_item_payments for select to authenticated
using (exists (select 1 from public.staff_profiles s where s.id=auth.uid() and s.active=true));

drop policy if exists "waiter or admin can create item payments" on public.order_item_payments;
create policy "waiter or admin can create item payments"
on public.order_item_payments for insert to authenticated
with check (exists (select 1 from public.staff_profiles s where s.id=auth.uid() and s.active=true and s.role in ('waiter','admin')));
