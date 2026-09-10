-- Срок хранения журнала действий + автоматическая очистка.
-- Значения: 1, 24, 48, 72, 168 часов (7 дней), 0 = не удалять.

insert into public.app_settings(key, value)
values ('audit_retention_hours', '48')
on conflict (key) do nothing;

-- Функция выполняется планировщиком базы данных, поэтому очистка не зависит
-- от того, открыт ли сайт на каком-либо устройстве.
create or replace function public.cleanup_old_audit_logs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  retention_hours integer;
begin
  select value::integer into retention_hours
  from public.app_settings
  where key = 'audit_retention_hours';

  if retention_hours is null or retention_hours <= 0 then
    return;
  end if;

  delete from public.audit_logs
  where created_at < now() - make_interval(hours => retention_hours);
end;
$$;

revoke all on function public.cleanup_old_audit_logs() from public;
grant execute on function public.cleanup_old_audit_logs() to postgres;

-- Supabase предоставляет pg_cron. Запускаем очистку раз в час.
create extension if not exists pg_cron with schema extensions;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'cleanup-old-audit-logs';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'cleanup-old-audit-logs',
    '0 * * * *',
    'select public.cleanup_old_audit_logs();'
  );
end $$;

-- Первичная очистка сразу после установки миграции.
select public.cleanup_old_audit_logs();
