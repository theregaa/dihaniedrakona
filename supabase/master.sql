-- ДЫХАНИЕ ДРАКОНА — ЕДИНЫЙ SQL ДЛЯ НОВОГО ПРОЕКТА SUPABASE
-- Содержит финальную схему, RLS, смены, чеки, журнал, Realtime и реальное меню.
-- НЕ запускайте этот файл поверх действующего проекта с данными без резервной копии.
-- После выполнения создайте первого пользователя в Authentication -> Users,
-- затем добавьте его в public.staff_profiles (пример внизу файла).

create extension if not exists pgcrypto;

-- ============================================================
-- 1. ТИПЫ
-- ============================================================
create type public.staff_role as enum ('waiter','hookah','admin');
create type public.table_status as enum ('free','busy');
create type public.order_status as enum ('new','work','ready','done','cancelled');

-- ============================================================
-- 2. СОТРУДНИКИ
-- ============================================================
create table public.staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  username text not null unique,
  role public.staff_role not null default 'waiter',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. СМЕНЫ
-- ============================================================
create table public.cash_register_shifts (
  id bigint generated always as identity primary key,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  status text not null default 'open' check (status in ('open','closed')),
  opening_cash numeric(10,2) not null default 0 check (opening_cash >= 0),
  closing_cash numeric(10,2) check (closing_cash is null or closing_cash >= 0),
  opened_by uuid not null references public.staff_profiles(id),
  closed_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now()
);

create unique index cash_register_one_open_shift_idx
  on public.cash_register_shifts(status) where status='open';
create index cash_register_shifts_opened_at_idx
  on public.cash_register_shifts(opened_at desc);

-- ============================================================
-- 4. СТОЛЫ
-- ============================================================
create table public.restaurant_tables (
  id bigint generated always as identity primary key,
  name text not null unique,
  is_vip boolean not null default false,
  is_bar boolean not null default false,
  status public.table_status not null default 'free',
  guests integer not null default 0 check (guests >= 0),
  active_order_id bigint,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 5. КАТЕГОРИИ И МЕНЮ
-- ============================================================
create table public.menu_categories (
  id bigint generated always as identity primary key,
  name text not null,
  icon text,
  sort_order integer not null default 0,
  active boolean not null default true,
  parent_id bigint references public.menu_categories(id) on delete cascade
);

create unique index menu_categories_parent_name_uidx
  on public.menu_categories(coalesce(parent_id,0), name);

create table public.menu_items (
  id bigint generated always as identity primary key,
  category_id bigint not null references public.menu_categories(id),
  name text not null,
  price numeric(10,2) not null check(price >= 0),
  large_price numeric(10,2),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint menu_items_large_price_check check (large_price is null or large_price >= price)
);

-- ============================================================
-- 6. ЗАКАЗЫ И ПОЗИЦИИ
-- ============================================================
create table public.orders (
  id bigint generated always as identity primary key,
  table_id bigint not null references public.restaurant_tables(id),
  staff_id uuid references public.staff_profiles(id),
  shift_id bigint references public.cash_register_shifts(id),
  status public.order_status not null default 'new',
  comment text,
  payment_method text,
  cash_received numeric(10,2) not null default 0,
  cash_amount numeric(10,2) not null default 0,
  card_amount numeric(10,2) not null default 0,
  change_amount numeric(10,2) not null default 0,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restaurant_tables
  add constraint restaurant_tables_active_order_fk
  foreign key(active_order_id) references public.orders(id) on delete set null;

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  menu_item_id bigint references public.menu_items(id) on delete set null,
  item_name text not null,
  qty integer not null default 1 check(qty > 0),
  unit_price numeric(10,2) not null check(unit_price >= 0),
  details jsonb not null default '{}'::jsonb,
  department text not null default 'waiter' check (department in ('waiter','hookah')),
  item_status public.order_status not null default 'new',
  created_at timestamptz not null default now()
);

create index order_items_department_idx on public.order_items(department);
create index order_items_order_status_idx on public.order_items(order_id, item_status);
create index orders_shift_idx on public.orders(shift_id, created_at desc);
create index orders_table_status_idx on public.orders(table_id, status);
create index orders_closed_at_idx on public.orders(closed_at);
create index restaurant_tables_active_idx on public.restaurant_tables(active, is_vip, id);

-- ============================================================
-- 7. ЧЕКИ
-- ============================================================
create table public.cash_register_receipts (
  id bigint generated always as identity primary key,
  table_id bigint not null references public.restaurant_tables(id),
  staff_id uuid references public.staff_profiles(id),
  shift_id bigint references public.cash_register_shifts(id),
  order_ids bigint[] not null default '{}',
  guests integer not null default 0 check (guests >= 0),
  total numeric(10,2) not null check (total >= 0),
  payment_method text not null check (payment_method in ('cash','card','mixed')),
  cash_amount numeric(10,2) not null default 0 check (cash_amount >= 0),
  card_amount numeric(10,2) not null default 0 check (card_amount >= 0),
  cash_received numeric(10,2) not null default 0 check (cash_received >= 0),
  change_amount numeric(10,2) not null default 0 check (change_amount >= 0),
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint receipt_payment_sum check (cash_amount + card_amount = total),
  constraint receipt_cash_change check (cash_received >= cash_amount),
  constraint receipt_change_value check (change_amount = cash_received - cash_amount)
);

create index cash_register_receipts_closed_at_idx on public.cash_register_receipts(closed_at desc);
create index cash_register_receipts_table_idx on public.cash_register_receipts(table_id);
create index cash_register_receipts_shift_idx on public.cash_register_receipts(shift_id, closed_at desc);

-- ============================================================
-- 8. ЖУРНАЛ
-- ============================================================
create table public.audit_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  staff_id uuid references public.staff_profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb
);

create index audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index audit_logs_staff_id_idx on public.audit_logs(staff_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

-- ============================================================
-- 9. PUSH-ПОДПИСКИ
-- ============================================================
create table public.push_subscriptions (
  id bigint generated by default as identity primary key,
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  role text,
  endpoint text not null unique,
  p256dh text,
  auth text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_staff_idx on public.push_subscriptions(staff_id);
create index push_subscriptions_role_idx on public.push_subscriptions(role);

-- ============================================================
-- 10. ADMIN HELPER
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.staff_profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ============================================================
-- 11. RLS
-- ============================================================
alter table public.staff_profiles enable row level security;
alter table public.cash_register_shifts enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.cash_register_receipts enable row level security;
alter table public.audit_logs enable row level security;
alter table public.push_subscriptions enable row level security;

-- Сотрудники: читать могут активные авторизованные сотрудники.
create policy "authenticated staff can read profiles"
on public.staff_profiles for select to authenticated
using (exists (select 1 from public.staff_profiles s where s.id=auth.uid() and s.active=true));

-- Столы.
create policy "authenticated staff can read tables"
on public.restaurant_tables for select to authenticated
using (exists (select 1 from public.staff_profiles s where s.id=auth.uid() and s.active=true));

create policy "authenticated staff can update tables"
on public.restaurant_tables for update to authenticated
using (exists (select 1 from public.staff_profiles s where s.id=auth.uid() and s.active=true))
with check (exists (select 1 from public.staff_profiles s where s.id=auth.uid() and s.active=true));

create policy "admins can insert tables"
on public.restaurant_tables for insert to authenticated
with check (public.is_admin());

create policy "admins can update tables"
on public.restaurant_tables for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Меню: сотрудники видят активное меню; администратор — всё и может менять.
create policy "authenticated staff can read menu categories"
on public.menu_categories for select to authenticated
using (active=true or public.is_admin());

create policy "authenticated staff can read menu items"
on public.menu_items for select to authenticated
using (active=true or public.is_admin());

create policy "admins can insert menu categories"
on public.menu_categories for insert to authenticated
with check (public.is_admin());

create policy "admins can update menu categories"
on public.menu_categories for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admins can insert menu items"
on public.menu_items for insert to authenticated
with check (public.is_admin());

create policy "admins can update menu items"
on public.menu_items for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Заказы.
create policy "authenticated staff can read orders"
on public.orders for select to authenticated
using (exists (select 1 from public.staff_profiles s where s.id=auth.uid() and s.active=true));

create policy "authenticated staff can create orders"
on public.orders for insert to authenticated
with check (exists (select 1 from public.staff_profiles s where s.id=auth.uid() and s.active=true));

create policy "authenticated staff can update orders"
on public.orders for update to authenticated
using (exists (select 1 from public.staff_profiles s where s.id=auth.uid() and s.active=true))
with check (exists (select 1 from public.staff_profiles s where s.id=auth.uid() and s.active=true));

-- Позиции.
create policy "authenticated staff can read order items"
on public.order_items for select to authenticated
using (exists (select 1 from public.staff_profiles s where s.id=auth.uid() and s.active=true));

create policy "authenticated staff can create order items"
on public.order_items for insert to authenticated
with check (exists (select 1 from public.staff_profiles s where s.id=auth.uid() and s.active=true));

-- Любой активный waiter/hookah/admin может менять статус любой позиции.
create policy "all active staff can update order items"
on public.order_items for update to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.staff_profiles sp
    where sp.id=auth.uid() and sp.active=true and sp.role in ('waiter','hookah')
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.staff_profiles sp
    where sp.id=auth.uid() and sp.active=true and sp.role in ('waiter','hookah')
  )
);

-- Удаление новой позиции официантом; администратор может удалить любую.
create policy "waiter and admin can delete new order items"
on public.order_items for delete to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.staff_profiles sp
    where sp.id=auth.uid() and sp.active=true and sp.role='waiter'
      and public.order_items.department='waiter'
      and public.order_items.item_status='new'
  )
);

-- Смены: открывать/закрывать может любой активный сотрудник.
create policy "staff can read shifts"
on public.cash_register_shifts for select to authenticated
using (exists (select 1 from public.staff_profiles sp where sp.id=auth.uid() and sp.active=true));

create policy "staff can create shifts"
on public.cash_register_shifts for insert to authenticated
with check (exists (select 1 from public.staff_profiles sp where sp.id=auth.uid() and sp.active=true));

create policy "staff can update shifts"
on public.cash_register_shifts for update to authenticated
using (exists (select 1 from public.staff_profiles sp where sp.id=auth.uid() and sp.active=true))
with check (exists (select 1 from public.staff_profiles sp where sp.id=auth.uid() and sp.active=true));

-- Чеки.
create policy "staff can read receipts"
on public.cash_register_receipts for select to authenticated
using (exists (select 1 from public.staff_profiles sp where sp.id=auth.uid() and sp.active=true));

create policy "waiter or admin can create receipts"
on public.cash_register_receipts for insert to authenticated
with check (exists (
  select 1 from public.staff_profiles sp
  where sp.id=auth.uid() and sp.active=true and sp.role in ('waiter','admin')
));

-- Закрывать оплаченные заказы может официант или администратор.
create policy "waiter can close orders"
on public.orders for update to authenticated
using (
  public.is_admin()
  or exists (select 1 from public.staff_profiles sp where sp.id=auth.uid() and sp.active=true and sp.role='waiter')
)
with check (
  public.is_admin()
  or exists (select 1 from public.staff_profiles sp where sp.id=auth.uid() and sp.active=true and sp.role='waiter')
);

-- Журнал.
create policy "active staff can create audit logs"
on public.audit_logs for insert to authenticated
with check (exists (select 1 from public.staff_profiles s where s.id=auth.uid() and s.active=true));

create policy "admins can read audit logs"
on public.audit_logs for select to authenticated
using (exists (select 1 from public.staff_profiles s where s.id=auth.uid() and s.active=true and s.role='admin'));

-- Push.
create policy "staff can manage own push subscriptions"
on public.push_subscriptions for all to authenticated
using (staff_id = auth.uid()) with check (staff_id = auth.uid());

-- ============================================================
-- 12. REALTIME
-- ============================================================
alter publication supabase_realtime add table public.restaurant_tables;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;

-- ============================================================
-- 13. СТОЛЫ
-- ============================================================
insert into public.restaurant_tables(name,is_vip,is_bar) values
('Стол 1',false,false),('Стол 2',false,false),('Стол 3',false,false),('Стол 4',false,false),
('Стол 5',false,false),('Стол 6',false,false),('Стол 7',false,false),('Стол 8',false,false),
('Стол 9',false,false),('Стол 10',false,false),('Стол 13',false,false),
('11 | Красная',true,false),('12 | Черная',true,false),('14 | Подиум',true,false),
('Бар',false,true);

-- ============================================================
-- 14. РЕАЛЬНОЕ МЕНЮ
-- ============================================================
begin;

insert into public.menu_categories(name,icon,sort_order,active,parent_id) values
('Кальяны','💨',1,true,null),
('Чай','🍵',2,true,null),
('Кофе','☕',3,true,null),
('Матча','🍵',4,true,null),
('Б/А напитки','🥤',5,true,null),
('Авторские напитки','🍹',6,true,null),
('Снэки','🍟',7,true,null),
('Сэндвичи','🥪',8,true,null);

insert into public.menu_categories(name,icon,sort_order,active,parent_id)
select v.name,v.icon,v.sort_order,true,c.id
from (values
  ('Классические кальяны','💨',1,'Кальяны'),
  ('Кальяны на фрукте','🍊',2,'Кальяны'),
  ('Премиум кальяны','👑',3,'Кальяны'),
  ('Дополнительно','➕',4,'Кальяны'),
  ('Чай черный','🫖',1,'Чай'),
  ('Чай зеленый','🍃',2,'Чай'),
  ('Авторские чаи','✨',3,'Чай'),
  ('Дополнительно','➕',4,'Чай'),
  ('Классический кофе','☕',1,'Кофе'),
  ('Авторский кофе','✨',2,'Кофе')
) as v(name,icon,sort_order,parent_name)
join public.menu_categories c on c.name=v.parent_name and c.parent_id is null;

-- КАЛЬЯНЫ
insert into public.menu_items(name,price,large_price,description,category_id,active)
select v.name,v.price,null,null,c.id,true
from (values
  ('Классический кальян',1300::numeric,'Классические кальяны'),
  ('Кальян на Апельсине',2300::numeric,'Кальяны на фрукте'),
  ('Кальян на Грейпфруте',2500::numeric,'Кальяны на фрукте'),
  ('Кальян на Ананасе',3000::numeric,'Кальяны на фрукте'),
  ('Кальян на Питахайе',2500::numeric,'Кальяны на фрукте'),
  ('Авторский кальян',4000::numeric,'Премиум кальяны'),
  ('Авторский на фрукте',5000::numeric,'Премиум кальяны'),
  ('Забивка оверпаком',400::numeric,'Дополнительно')
) as v(name,price,parent_name)
join public.menu_categories c on c.name=v.parent_name
and c.parent_id=(select id from public.menu_categories where name='Кальяны' and parent_id is null);

-- ЧАЙ
insert into public.menu_items(name,price,large_price,description,category_id,active)
select v.name,v.small_price,v.large_price,null,c.id,true
from (values
  ('Чай с чебрецом',250::numeric,350::numeric,'Чай черный'),
  ('Обычный черный чай',250::numeric,350::numeric,'Чай черный'),
  ('Чай с бергамотом',250::numeric,350::numeric,'Чай черный'),
  ('Пуэр',450::numeric,550::numeric,'Чай черный'),
  ('Габа',450::numeric,550::numeric,'Чай черный'),
  ('Обычный зеленый чай',250::numeric,350::numeric,'Чай зеленый'),
  ('Молочный улун',450::numeric,550::numeric,'Чай зеленый'),
  ('Те гуань инь',450::numeric,550::numeric,'Чай зеленый'),
  ('Облепиховый чай',550::numeric,null::numeric,'Авторские чаи'),
  ('Малиновый чай',550::numeric,null::numeric,'Авторские чаи'),
  ('Цитрусовый чай',550::numeric,null::numeric,'Авторские чаи'),
  ('Сочная брусника',550::numeric,null::numeric,'Авторские чаи'),
  ('Чайная церемония',550::numeric,null::numeric,'Авторские чаи'),
  ('Мед',50::numeric,null::numeric,'Дополнительно'),
  ('Лимон',50::numeric,null::numeric,'Дополнительно'),
  ('Имбирь',50::numeric,null::numeric,'Дополнительно'),
  ('Мята',50::numeric,null::numeric,'Дополнительно')
) as v(name,small_price,large_price,parent_name)
join public.menu_categories c on c.name=v.parent_name
and c.parent_id=(select id from public.menu_categories where name='Чай' and parent_id is null);

-- КОФЕ
insert into public.menu_items(name,price,large_price,description,category_id,active)
select v.name,v.price,null,null,c.id,true
from (values
  ('Американо',150::numeric,'Классический кофе'),
  ('экспрессо',150::numeric,'Классический кофе'),
  ('Капучино',250::numeric,'Классический кофе'),
  ('Латте',250::numeric,'Классический кофе'),
  ('Раф',250::numeric,'Классический кофе'),
  ('Айс капучино',300::numeric,'Классический кофе'),
  ('Сироп',50::numeric,'Классический кофе'),
  ('Кокос',450::numeric,'Авторский кофе'),
  ('Малина',450::numeric,'Авторский кофе'),
  ('Орео',450::numeric,'Авторский кофе'),
  ('Сникерс',450::numeric,'Авторский кофе')
) as v(name,price,parent_name)
join public.menu_categories c on c.name=v.parent_name
and c.parent_id=(select id from public.menu_categories where name='Кофе' and parent_id is null);

-- МАТЧА
insert into public.menu_items(name,price,large_price,description,category_id,active)
select v.name,v.price,null,null,c.id,true
from (values
  ('Матча латте',350::numeric),
  ('Айс матча',400::numeric),
  ('Клубничная матча',400::numeric),
  ('Матча санрайз',400::numeric)
) as v(name,price)
join public.menu_categories c on c.name='Матча' and c.parent_id is null;

-- Б/А НАПИТКИ
insert into public.menu_items(name,price,large_price,description,category_id,active)
select v.name,v.price,null,null,c.id,true
from (values
  ('Сочная клубника',350::numeric),
  ('Черника-смородина',350::numeric),
  ('Мохито',400::numeric),
  ('Киви-базилик',350::numeric),
  ('Цитрусовый fizz',300::numeric),
  ('Банановый квиз',300::numeric),
  ('Алеша в стакане',300::numeric),
  ('Авторский лимонад 1л',650::numeric)
) as v(name,price)
join public.menu_categories c on c.name='Б/А напитки' and c.parent_id is null;

-- АВТОРСКИЕ НАПИТКИ
insert into public.menu_items(name,price,large_price,description,category_id,active)
select v.name,v.price,null,null,c.id,true
from (values
  ('Pina colada',400::numeric),
  ('Мятный шоколад',300::numeric),
  ('Летний закат',400::numeric),
  ('Экзотический поцелуй',400::numeric),
  ('Мятная малина',400::numeric),
  ('Кокосовая мечта',400::numeric),
  ('Тропическая свежесть',400::numeric)
) as v(name,price)
join public.menu_categories c on c.name='Авторские напитки' and c.parent_id is null;

-- СНЭКИ
insert into public.menu_items(name,price,large_price,description,category_id,active)
select v.name,v.small_price,v.large_price,null,c.id,true
from (values
  ('Чипсы',300::numeric,null::numeric),
  ('Сухарики',150::numeric,null::numeric),
  ('Арахис',250::numeric,null::numeric),
  ('Фисташки',400::numeric,null::numeric),
  ('Кальмар сушенный',350::numeric,null::numeric),
  ('Начос с соусом',350::numeric,null::numeric),
  ('Сырная нарезка',800::numeric,null::numeric),
  ('Нарезка мясная',650::numeric,850::numeric),
  ('Нарезка фруктовая',550::numeric,650::numeric),
  ('Плитка шоколадки',200::numeric,null::numeric),
  ('Сникерс',150::numeric,null::numeric),
  ('Твикс',150::numeric,null::numeric),
  ('Пивной сет',600::numeric,null::numeric)
) as v(name,small_price,large_price)
join public.menu_categories c on c.name='Снэки' and c.parent_id is null;

-- СЭНДВИЧИ
insert into public.menu_items(name,price,large_price,description,category_id,active)
select v.name,v.price,null,null,c.id,true
from (values
  ('Дракон',350::numeric),
  ('Три сыра',350::numeric),
  ('Ветчина и сыр',350::numeric),
  ('Пепперони',350::numeric)
) as v(name,price)
join public.menu_categories c on c.name='Сэндвичи' and c.parent_id is null;

commit;

-- ============================================================
-- 15. ПЕРВЫЙ АДМИН
-- ============================================================
-- Сначала создайте пользователя в Authentication -> Users.
-- Затем выполните, подставив его UUID:
-- insert into public.staff_profiles(id,full_name,role,active)
-- values ('UUID_ПОЛЬЗОВАТЕЛЯ','Администратор','admin',true);
-- Добавление новых категорий и позиций в существующую базу.
-- Выполнить ОДИН РАЗ в Supabase SQL Editor.
-- Скрипт безопасен для повторного запуска: существующие позиции не дублируются.

-- Верхние категории
insert into public.menu_categories(name, icon, sort_order, active, parent_id)
select 'Алкоголь', '🍸', coalesce(max(sort_order), 0) + 1, true, null
from public.menu_categories
where not exists (select 1 from public.menu_categories where name = 'Алкоголь' and parent_id is null);

insert into public.menu_categories(name, icon, sort_order, active, parent_id)
select 'Напитки', '🥤', coalesce(max(sort_order), 0) + 1, true, null
from public.menu_categories
where not exists (select 1 from public.menu_categories where name = 'Напитки' and parent_id is null);

-- Подкатегории алкоголя
insert into public.menu_categories(name, icon, sort_order, active, parent_id)
select v.name, v.icon, v.sort_order,
       true,
       (select id from public.menu_categories where name = 'Алкоголь' and parent_id is null limit 1)
from (values
  ('Шоты', '🥃', 1),
  ('Фирменные 6 шотов', '🔥', 2),
  ('Коктейли', '🍹', 3),
  ('Авторское коктейли', '✨', 4)
) v(name, icon, sort_order)
where not exists (
  select 1 from public.menu_categories c
  where c.name = v.name
    and c.parent_id = (select id from public.menu_categories where name = 'Алкоголь' and parent_id is null limit 1)
);

-- Подкатегории напитков
insert into public.menu_categories(name, icon, sort_order, active, parent_id)
select v.name, v.icon, v.sort_order,
       true,
       (select id from public.menu_categories where name = 'Напитки' and parent_id is null limit 1)
from (values
  ('Безалкогольные напитки', '🥤', 1),
  ('Пиво', '🍺', 2)
) v(name, icon, sort_order)
where not exists (
  select 1 from public.menu_categories c
  where c.name = v.name
    and c.parent_id = (select id from public.menu_categories where name = 'Напитки' and parent_id is null limit 1)
);

-- ШОТЫ
insert into public.menu_items(name, price, large_price, description, category_id, active)
select v.name, v.price, null, null,
       (select id from public.menu_categories where name = 'Шоты' and parent_id = (select id from public.menu_categories where name = 'Алкоголь' and parent_id is null limit 1) limit 1),
       true
from (values
  ('Огненный дракон', 400), ('Скользкий сосок', 450), ('kill shot', 500), ('Б52', 500), ('Б53', 500),
  ('Светофор', 500), ('Рашен', 350), ('Рафаэлло', 450), ('Хиросима', 500), ('Облака', 500)
) v(name, price)
where not exists (
  select 1 from public.menu_items i
  where i.name = v.name
    and i.category_id = (select id from public.menu_categories where name = 'Шоты' and parent_id = (select id from public.menu_categories where name = 'Алкоголь' and parent_id is null limit 1) limit 1)
);

-- ФИРМЕННЫЕ 6 ШОТОВ
insert into public.menu_items(name, price, large_price, description, category_id, active)
select v.name, v.price, null, null,
       (select id from public.menu_categories where name = 'Фирменные 6 шотов' and parent_id = (select id from public.menu_categories where name = 'Алкоголь' and parent_id is null limit 1) limit 1),
       true
from (values
  ('Шот classic', 600), ('Шот night', 600), ('Шот blue', 600), ('Шот green', 600), ('Шот Russia', 600),
  ('Шот mohito', 600), ('Шот white', 600), ('Шот сладкая клубничка', 600), ('Шот пьяная карамель', 600),
  ('Шот цитрусовый бум', 600), ('Шот мстительный', 600), ('Шот непросто ананас', 600), ('Шот Energy', 600)
) v(name, price)
where not exists (
  select 1 from public.menu_items i
  where i.name = v.name
    and i.category_id = (select id from public.menu_categories where name = 'Фирменные 6 шотов' and parent_id = (select id from public.menu_categories where name = 'Алкоголь' and parent_id is null limit 1) limit 1)
);

-- КОКТЕЙЛИ
insert into public.menu_items(name, price, large_price, description, category_id, active)
select v.name, v.price, null, null,
       (select id from public.menu_categories where name = 'Коктейли' and parent_id = (select id from public.menu_categories where name = 'Алкоголь' and parent_id is null limit 1) limit 1),
       true
from (values
  ('Негрони', 650), ('Мохито', 450), ('Маргарита', 500), ('Френч 75', 500), ('Май тай', 600),
  ('Лонг Айленд', 650), ('Арнольд шприц', 550), ('Дайкири классик', 550), ('Дайкири клубничный', 550),
  ('Дайкири мятный', 550), ('текила санрайз', 550), ('голубая лагуна', 550), ('Пина Колада', 550),
  ('Джин тоник', 500), ('Виски кола', 550), ('ром кола', 500), ('Хай-вэй', 450),
  ('Парашют на абсенте', 650), ('Парашют на самбуке', 650)
) v(name, price)
where not exists (
  select 1 from public.menu_items i
  where i.name = v.name
    and i.category_id = (select id from public.menu_categories where name = 'Коктейли' and parent_id = (select id from public.menu_categories where name = 'Алкоголь' and parent_id is null limit 1) limit 1)
);

-- АВТОРСКОЕ КОКТЕЙЛИ
insert into public.menu_items(name, price, large_price, description, category_id, active)
select v.name, v.price, null, null,
       (select id from public.menu_categories where name = 'Авторское коктейли' and parent_id = (select id from public.menu_categories where name = 'Алкоголь' and parent_id is null limit 1) limit 1),
       true
from (values
  ('Оргазм', 500), ('Персиковый сауэр', 600), ('Бренди Сауэр', 600), ('Куртизанка', 650), ('Душа бармена', 600),
  ('Дракон фирменный', 550), ('Райский остров', 550), ('Пьяный шеф', 500), ('Зимняя вишня', 550),
  ('Лаванда', 450), ('Английская королева', 450), ('Night Violet', 450), ('Амаретто', 450), ('Личи', 400)
) v(name, price)
where not exists (
  select 1 from public.menu_items i
  where i.name = v.name
    and i.category_id = (select id from public.menu_categories where name = 'Авторское коктейли' and parent_id = (select id from public.menu_categories where name = 'Алкоголь' and parent_id is null limit 1) limit 1)
);

-- БЕЗАЛКОГОЛЬНЫЕ НАПИТКИ
insert into public.menu_items(name, price, large_price, description, category_id, active)
select v.name, v.price, null, null,
       (select id from public.menu_categories where name = 'Безалкогольные напитки' and parent_id = (select id from public.menu_categories where name = 'Напитки' and parent_id is null limit 1) limit 1),
       true
from (values
  ('Кола 1л', 250), ('Фанта 1л', 250), ('Спрайт 1л', 250), ('Тоник 1л', 250), ('ж/б кола', 150),
  ('вода газированная', 150), ('вода без газа', 150), ('сок апельсин', 300), ('сок ананас', 300),
  ('сок яблоко', 300), ('сок вишня', 300), ('сок персик', 300), ('сок мультифрукт', 300), ('энергетик', 300)
) v(name, price)
where not exists (
  select 1 from public.menu_items i
  where i.name = v.name
    and i.category_id = (select id from public.menu_categories where name = 'Безалкогольные напитки' and parent_id = (select id from public.menu_categories where name = 'Напитки' and parent_id is null limit 1) limit 1)
);

-- ПИВО
insert into public.menu_items(name, price, large_price, description, category_id, active)
select v.name, v.price, null, null,
       (select id from public.menu_categories where name = 'Пиво' and parent_id = (select id from public.menu_categories where name = 'Напитки' and parent_id is null limit 1) limit 1),
       true
from (values
  ('Пиво хадыженское', 250), ('пиво СССР', 250), ('Пиво безалкогольное', 250), ('Corona Extra', 350)
) v(name, price)
where not exists (
  select 1 from public.menu_items i
  where i.name = v.name
    and i.category_id = (select id from public.menu_categories where name = 'Пиво' and parent_id = (select id from public.menu_categories where name = 'Напитки' and parent_id is null limit 1) limit 1)
);
