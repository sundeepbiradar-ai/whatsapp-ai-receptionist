-- Phase 5.3: schedule the durable retry worker.
-- The trigger only calls the protected internal worker endpoint. The target URL
-- and worker secret are read from Vault at run time, so no domain or secret is
-- ever stored in this repository. The schedule is created only when pg_cron is
-- actually usable in the target environment.

create or replace function public.invoke_whatsapp_retry_worker()
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  worker_url text;
  worker_secret text;
begin
  select decrypted_secret into worker_url
  from vault.decrypted_secrets
  where name = 'whatsapp_retry_worker_url'
  limit 1;

  select decrypted_secret into worker_secret
  from vault.decrypted_secrets
  where name = 'whatsapp_retry_worker_secret'
  limit 1;

  -- Unconfigured environments stay inert rather than emitting failing requests.
  if worker_url is null or worker_secret is null then
    return;
  end if;

  perform net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || worker_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$function$;

revoke all on function public.invoke_whatsapp_retry_worker() from public;

comment on function public.invoke_whatsapp_retry_worker() is
  'Calls the protected internal WhatsApp retry endpoint using Vault-held URL and worker secret. No-op until both secrets exist.';

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is unavailable; the WhatsApp retry schedule was not created.';
    return;
  end if;

  begin
    execute 'create extension if not exists pg_cron';
  exception when others then
    raise notice 'pg_cron could not be enabled; the WhatsApp retry schedule was not created.';
    return;
  end;

  perform cron.unschedule('whatsapp-retry-worker')
  from cron.job
  where jobname = 'whatsapp-retry-worker';

  perform cron.schedule(
    'whatsapp-retry-worker',
    '* * * * *',
    'select public.invoke_whatsapp_retry_worker()'
  );
end;
$$;
