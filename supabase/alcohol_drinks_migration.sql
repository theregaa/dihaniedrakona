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
