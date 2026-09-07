-- Добавление способа оплаты «Перевод» в существующую базу.
-- Выполнить ОДИН раз в Supabase SQL Editor.

alter table public.cash_register_receipts
  add column if not exists transfer_amount numeric(10,2) not null default 0 check (transfer_amount >= 0);

alter table public.cash_register_receipts
  drop constraint if exists receipt_payment_sum;

alter table public.cash_register_receipts
  add constraint receipt_payment_sum
  check (cash_amount + card_amount + transfer_amount = total);

-- Удаляем старый CHECK по payment_method независимо от его автоматически
-- сгенерированного имени, затем создаём новый с поддержкой transfer.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'cash_register_receipts'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%payment_method%'
  loop
    execute format('alter table public.cash_register_receipts drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.cash_register_receipts
  add constraint receipt_payment_method_check_v2
  check (payment_method in ('cash','card','mixed','transfer'));
