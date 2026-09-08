-- v107: обновление меню
-- Выполнить ОДИН РАЗ в Supabase SQL Editor.
-- Безопасно для повторного запуска.

-- 1) Удаляем только «Дополнительно» внутри верхней категории «Кальяны».
-- Сами позиции кальянов и остальные категории не затрагиваются.
delete from public.menu_items i
where i.category_id = (
  select c.id
  from public.menu_categories c
  where c.name = 'Дополнительно'
    and c.parent_id = (select id from public.menu_categories where name = 'Кальяны' and parent_id is null limit 1)
  limit 1
);

delete from public.menu_categories c
where c.name = 'Дополнительно'
  and c.parent_id = (select id from public.menu_categories where name = 'Кальяны' and parent_id is null limit 1);

-- 2) Бостонский чай в Алкоголь -> Коктейли.
insert into public.menu_items(name, price, large_price, description, category_id, active)
select 'Бостонский чай', 750::numeric, null::numeric, null,
       (select id from public.menu_categories
        where name = 'Коктейли'
          and parent_id = (select id from public.menu_categories where name = 'Алкоголь' and parent_id is null limit 1)
        limit 1),
       true
where not exists (
  select 1 from public.menu_items i
  where i.name = 'Бостонский чай'
    and i.category_id = (select id from public.menu_categories
                         where name = 'Коктейли'
                           and parent_id = (select id from public.menu_categories where name = 'Алкоголь' and parent_id is null limit 1)
                         limit 1)
);

-- 3) Новая отдельная верхнеуровневая категория «Свой алкоголь».
-- Если v107 уже создал её внутри «Алкоголь», переносим её на верхний уровень.
DO $$
DECLARE
  nested_id bigint;
  top_id bigint;
BEGIN
  select id into nested_id
  from public.menu_categories
  where name = 'Свой алкоголь'
    and parent_id = (select id from public.menu_categories where name = 'Алкоголь' and parent_id is null limit 1)
  limit 1;

  select id into top_id
  from public.menu_categories
  where name = 'Свой алкоголь' and parent_id is null
  limit 1;

  if top_id is null and nested_id is not null then
    update public.menu_categories set parent_id = null where id = nested_id;
    top_id := nested_id;
  elsif top_id is null then
    insert into public.menu_categories(name, icon, sort_order, active, parent_id)
    select 'Свой алкоголь', '🍾', coalesce(max(sort_order), 0) + 1, true, null
    from public.menu_categories;
    select id into top_id from public.menu_categories where name = 'Свой алкоголь' and parent_id is null limit 1;
  elsif nested_id is not null and nested_id <> top_id then
    update public.menu_items set category_id = top_id where category_id = nested_id;
    delete from public.menu_categories where id = nested_id;
  end if;
END $$;

insert into public.menu_items(name, price, large_price, description, category_id, active)
select v.name, v.price::numeric, null::numeric, null,
       (select id from public.menu_categories
        where name = 'Свой алкоголь' and parent_id is null
        limit 1),
       true
from (values
  ('Свое пиво 0.5л', 50),
  ('Свой вино/шампанское', 150),
  ('Свой крепкий алкоголь 0.5л', 200),
  ('Свой крепкий алкоголь 0.7л', 250),
  ('Свой крепкий алкоголь 1л', 300)
) v(name, price)
where not exists (
  select 1 from public.menu_items i
  where i.name = v.name
    and i.category_id = (select id from public.menu_categories
                         where name = 'Свой алкоголь' and parent_id is null
                         limit 1)
);
