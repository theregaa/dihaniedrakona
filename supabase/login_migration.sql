-- Выполнить ОДИН РАЗ в существующей базе
alter table public.staff_profiles add column if not exists username text;
create unique index if not exists staff_profiles_username_lower_uidx on public.staff_profiles (lower(username)) where username is not null;
-- Назначьте логины существующим сотрудникам:
-- update public.staff_profiles set username = 'admin' where id = 'UUID_АДМИНИСТРАТОРА';
