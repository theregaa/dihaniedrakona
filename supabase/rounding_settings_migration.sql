-- Настройка округления суммы после скидки.
-- Выполнить один раз в существующей базе Supabase.

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings(key, value) values ('rounding_step', '100')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "authenticated staff can read app settings" on public.app_settings;
drop policy if exists "admins can insert app settings" on public.app_settings;
drop policy if exists "admins can update app settings" on public.app_settings;

create policy "authenticated staff can read app settings"
on public.app_settings for select to authenticated
using (exists (select 1 from public.staff_profiles s where s.id=auth.uid() and s.active=true));

create policy "admins can insert app settings"
on public.app_settings for insert to authenticated
with check (public.is_admin());

create policy "admins can update app settings"
on public.app_settings for update to authenticated
using (public.is_admin()) with check (public.is_admin());
