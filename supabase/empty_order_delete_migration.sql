-- Allow active staff to delete an empty order after its last order item is removed.
-- The application only performs this when no order_items remain.
create policy "active staff can delete empty orders"
on public.orders for delete to authenticated
using (
  exists (
    select 1 from public.staff_profiles s
    where s.id=auth.uid() and s.active=true
  )
  and not exists (
    select 1 from public.order_items oi
    where oi.order_id=public.orders.id
  )
);
