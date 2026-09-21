-- Разрешить всем активным сотрудникам удалять позиции из заказов.
-- Выполнить один раз в Supabase SQL Editor для уже существующей базы.

drop policy if exists "waiter and admin can delete new order items" on public.order_items;
drop policy if exists "active staff can delete order items" on public.order_items;

create policy "active staff can delete order items"
on public.order_items for delete to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id=auth.uid() and sp.active=true
  )
);
