-- Скидка на чек при закрытии стола.
-- Выполнить один раз в Supabase SQL Editor для уже существующей базы.
alter table public.cash_register_receipts
  add column if not exists discount_percent numeric(5,2) not null default 0
  check (discount_percent >= 0 and discount_percent <= 100);
