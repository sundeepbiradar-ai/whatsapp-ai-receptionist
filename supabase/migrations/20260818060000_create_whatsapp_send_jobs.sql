-- Phase 5.3: durable outbound retry jobs.
-- Access is denied by default; every operation runs through a narrow
-- security-definer RPC. No arbitrary payload column exists: the message row
-- remains the single source of truth for what is sent.

create table public.whatsapp_send_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  message_id uuid not null,
  provider text not null default 'meta_whatsapp_cloud',
  status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_send_jobs_provider_check
    check (provider = 'meta_whatsapp_cloud'),
  constraint whatsapp_send_jobs_status_check
    check (status in ('pending', 'processing', 'completed', 'dead')),
  constraint whatsapp_send_jobs_attempt_count_check
    check (attempt_count >= 0 and attempt_count <= max_attempts),
  constraint whatsapp_send_jobs_max_attempts_check
    check (max_attempts between 1 and 10),
  constraint whatsapp_send_jobs_claim_check
    check ((claimed_at is null) = (claim_expires_at is null)),
  constraint whatsapp_send_jobs_organization_message_fk
    foreign key (organization_id, message_id)
    references public.messages (organization_id, id)
    on delete cascade
);

-- At most one live job per message keeps retries from forking a send.
create unique index whatsapp_send_jobs_live_message_key
  on public.whatsapp_send_jobs (organization_id, message_id)
  where status in ('pending', 'processing');

create index whatsapp_send_jobs_claim_idx
  on public.whatsapp_send_jobs (next_attempt_at, created_at)
  where status = 'pending';

create index whatsapp_send_jobs_organization_status_idx
  on public.whatsapp_send_jobs (organization_id, status);

create index whatsapp_send_jobs_claim_expiry_idx
  on public.whatsapp_send_jobs (claim_expires_at)
  where status = 'processing';

alter table public.whatsapp_send_jobs enable row level security;

revoke all on table public.whatsapp_send_jobs from anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_send_jobs to service_role;

comment on table public.whatsapp_send_jobs is
  'Durable outbound WhatsApp retry jobs. RLS is enabled with no anon/authenticated policies; access is only through security-definer RPCs.';
comment on column public.whatsapp_send_jobs.attempt_count is
  'Retry attempts started. Incremented when a worker claims the job so a crashed worker still consumes an attempt.';
comment on column public.whatsapp_send_jobs.last_error_message is
  'Safe diagnostic text only. Provider response bodies and credentials are never stored.';

-- Enqueued from the authenticated outbound request path. Only a member of the
-- owning organization can create a job, and only for an eligible message.
create or replace function public.enqueue_whatsapp_send_job(
  target_organization_id uuid,
  target_message_id uuid,
  target_next_attempt_at timestamptz,
  target_error_code text default null,
  target_error_message text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  resolved_job_id uuid;
begin
  if target_organization_id is null
    or target_message_id is null
    or target_next_attempt_at is null
  then
    return jsonb_build_object('ok', false, 'error_code', 'whatsapp_retry_input_invalid');
  end if;

  if not public.is_organization_member(target_organization_id) then
    return jsonb_build_object('ok', false, 'error_code', 'whatsapp_tenant_mismatch');
  end if;

  if not exists (
    select 1
    from public.messages message
    where message.organization_id = target_organization_id
      and message.id = target_message_id
      and message.direction = 'outbound'
      and message.provider = 'meta_whatsapp_cloud'
      and message.delivery_status = 'pending'
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'whatsapp_retry_message_ineligible');
  end if;

  insert into public.whatsapp_send_jobs (
    organization_id,
    message_id,
    next_attempt_at,
    last_error_code,
    last_error_message
  ) values (
    target_organization_id,
    target_message_id,
    target_next_attempt_at,
    target_error_code,
    target_error_message
  )
  on conflict (organization_id, message_id) where status in ('pending', 'processing')
  do nothing
  returning id into resolved_job_id;

  if resolved_job_id is null then
    select job.id into resolved_job_id
    from public.whatsapp_send_jobs job
    where job.organization_id = target_organization_id
      and job.message_id = target_message_id
      and job.status in ('pending', 'processing')
    limit 1;

    return jsonb_build_object('ok', true, 'job_id', resolved_job_id, 'created', false);
  end if;

  return jsonb_build_object('ok', true, 'job_id', resolved_job_id, 'created', true);
end;
$function$;

-- Claims a bounded batch. Concurrent workers receive disjoint jobs because the
-- candidate scan takes row locks with SKIP LOCKED. Jobs whose message left the
-- pending state (including unconfirmed) are never claimable.
create or replace function public.claim_whatsapp_send_jobs(target_batch_size integer default 10)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  claimed_jobs jsonb;
begin
  if target_batch_size is null or target_batch_size < 1 or target_batch_size > 50 then
    return jsonb_build_object('ok', false, 'error_code', 'whatsapp_retry_input_invalid');
  end if;

  with claimable as (
    select job.id
    from public.whatsapp_send_jobs job
    join public.messages message
      on message.organization_id = job.organization_id
     and message.id = job.message_id
    where job.status = 'pending'
      and job.next_attempt_at <= now()
      and job.attempt_count < job.max_attempts
      and message.delivery_status = 'pending'
    order by job.next_attempt_at, job.created_at
    limit target_batch_size
    for update of job skip locked
  ),
  claimed as (
    update public.whatsapp_send_jobs job
    set status = 'processing',
        attempt_count = job.attempt_count + 1,
        claimed_at = now(),
        claim_expires_at = now() + interval '5 minutes',
        updated_at = now()
    from claimable
    where job.id = claimable.id
    returning job.id, job.organization_id, job.message_id, job.attempt_count, job.max_attempts
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'job_id', claimed.id,
        'organization_id', claimed.organization_id,
        'message_id', claimed.message_id,
        'attempt_count', claimed.attempt_count,
        'max_attempts', claimed.max_attempts,
        'content', message.content,
        'recipient_phone', contact.phone
      )
      order by claimed.id
    ),
    '[]'::jsonb
  )
  into claimed_jobs
  from claimed
  join public.messages message
    on message.organization_id = claimed.organization_id
   and message.id = claimed.message_id
  join public.conversations conversation
    on conversation.organization_id = message.organization_id
   and conversation.id = message.conversation_id
  join public.contacts contact
    on contact.organization_id = conversation.organization_id
   and contact.id = conversation.contact_id;

  return jsonb_build_object('ok', true, 'jobs', claimed_jobs);
end;
$function$;

-- Correlates the provider message id onto the existing message row. No second
-- logical message is ever created by a retry.
create or replace function public.complete_whatsapp_send_job(
  target_job_id uuid,
  target_provider_message_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  resolved_organization_id uuid;
  resolved_message_id uuid;
  updated_message_id uuid;
begin
  if target_job_id is null
    or target_provider_message_id is null
    or btrim(target_provider_message_id) = ''
  then
    return jsonb_build_object('ok', false, 'error_code', 'whatsapp_retry_input_invalid');
  end if;

  select job.organization_id, job.message_id
    into resolved_organization_id, resolved_message_id
  from public.whatsapp_send_jobs job
  where job.id = target_job_id
    and job.status = 'processing'
  for update;

  if resolved_message_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'whatsapp_retry_job_not_claimed');
  end if;

  begin
    update public.messages
    set provider_message_id = target_provider_message_id,
        delivery_status = 'sent',
        delivery_status_at = now(),
        delivery_error_code = null,
        delivery_error_message = null
    where organization_id = resolved_organization_id
      and id = resolved_message_id
      and delivery_status = 'pending'
    returning id into updated_message_id;
  exception when unique_violation then
    update public.whatsapp_send_jobs
    set status = 'dead',
        claimed_at = null,
        claim_expires_at = null,
        last_error_code = 'whatsapp_message_unconfirmed',
        last_error_message = 'ambiguous',
        updated_at = now()
    where id = target_job_id;

    update public.messages
    set delivery_status = 'unconfirmed',
        delivery_status_at = now(),
        delivery_error_code = 'whatsapp_message_unconfirmed',
        delivery_error_message = 'ambiguous'
    where organization_id = resolved_organization_id
      and id = resolved_message_id
      and delivery_status = 'pending';

    return jsonb_build_object('ok', true, 'outcome', 'unconfirmed');
  end;

  update public.whatsapp_send_jobs
  set status = 'completed',
      claimed_at = null,
      claim_expires_at = null,
      last_error_code = null,
      last_error_message = null,
      updated_at = now()
  where id = target_job_id;

  return jsonb_build_object(
    'ok', true,
    'outcome', case when updated_message_id is null then 'message_not_pending' else 'completed' end,
    'message_id', resolved_message_id
  );
end;
$function$;

create or replace function public.reschedule_whatsapp_send_job(
  target_job_id uuid,
  target_next_attempt_at timestamptz,
  target_error_code text,
  target_error_message text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  updated_job_id uuid;
begin
  if target_job_id is null or target_next_attempt_at is null then
    return jsonb_build_object('ok', false, 'error_code', 'whatsapp_retry_input_invalid');
  end if;

  update public.whatsapp_send_jobs
  set status = 'pending',
      next_attempt_at = target_next_attempt_at,
      claimed_at = null,
      claim_expires_at = null,
      last_error_code = target_error_code,
      last_error_message = target_error_message,
      updated_at = now()
  where id = target_job_id
    and status = 'processing'
  returning id into updated_job_id;

  if updated_job_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'whatsapp_retry_job_not_claimed');
  end if;

  return jsonb_build_object('ok', true, 'outcome', 'rescheduled', 'job_id', updated_job_id);
end;
$function$;

-- Terminal outcome. failed means the send definitively did not succeed;
-- unconfirmed means the outcome is ambiguous and needs manual reconciliation.
-- Dead jobs are retained for operational review and are never deleted here.
create or replace function public.terminate_whatsapp_send_job(
  target_job_id uuid,
  target_message_status text,
  target_error_code text,
  target_error_message text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  resolved_organization_id uuid;
  resolved_message_id uuid;
begin
  if target_job_id is null
    or target_message_status is null
    or target_message_status not in ('failed', 'unconfirmed')
  then
    return jsonb_build_object('ok', false, 'error_code', 'whatsapp_retry_input_invalid');
  end if;

  update public.whatsapp_send_jobs
  set status = 'dead',
      claimed_at = null,
      claim_expires_at = null,
      last_error_code = target_error_code,
      last_error_message = target_error_message,
      updated_at = now()
  where id = target_job_id
    and status = 'processing'
  returning organization_id, message_id
    into resolved_organization_id, resolved_message_id;

  if resolved_message_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'whatsapp_retry_job_not_claimed');
  end if;

  update public.messages
  set delivery_status = target_message_status,
      delivery_status_at = now(),
      delivery_error_code = target_error_code,
      delivery_error_message = target_error_message
  where organization_id = resolved_organization_id
    and id = resolved_message_id
    and delivery_status = 'pending';

  return jsonb_build_object('ok', true, 'outcome', 'dead', 'message_status', target_message_status);
end;
$function$;

-- Returns expired leases to pending, or retires them when attempts are spent.
create or replace function public.reap_whatsapp_send_job_claims()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  released_count integer;
  retired_count integer;
begin
  with retired as (
    update public.whatsapp_send_jobs
    set status = 'dead',
        claimed_at = null,
        claim_expires_at = null,
        last_error_code = coalesce(last_error_code, 'whatsapp_retry_claim_expired'),
        updated_at = now()
    where status = 'processing'
      and claim_expires_at < now()
      and attempt_count >= max_attempts
    returning 1
  )
  select count(*) into retired_count from retired;

  with released as (
    update public.whatsapp_send_jobs
    set status = 'pending',
        claimed_at = null,
        claim_expires_at = null,
        last_error_code = coalesce(last_error_code, 'whatsapp_retry_claim_expired'),
        updated_at = now()
    where status = 'processing'
      and claim_expires_at < now()
    returning 1
  )
  select count(*) into released_count from released;

  return jsonb_build_object('ok', true, 'released', released_count, 'retired', retired_count);
end;
$function$;

revoke all on function public.enqueue_whatsapp_send_job(uuid, uuid, timestamptz, text, text) from public;
grant execute on function public.enqueue_whatsapp_send_job(uuid, uuid, timestamptz, text, text) to authenticated;

revoke all on function public.claim_whatsapp_send_jobs(integer) from public;
grant execute on function public.claim_whatsapp_send_jobs(integer) to service_role;

revoke all on function public.complete_whatsapp_send_job(uuid, text) from public;
grant execute on function public.complete_whatsapp_send_job(uuid, text) to service_role;

revoke all on function public.reschedule_whatsapp_send_job(uuid, timestamptz, text, text) from public;
grant execute on function public.reschedule_whatsapp_send_job(uuid, timestamptz, text, text) to service_role;

revoke all on function public.terminate_whatsapp_send_job(uuid, text, text, text) from public;
grant execute on function public.terminate_whatsapp_send_job(uuid, text, text, text) to service_role;

revoke all on function public.reap_whatsapp_send_job_claims() from public;
grant execute on function public.reap_whatsapp_send_job_claims() to service_role;

comment on function public.claim_whatsapp_send_jobs(integer) is
  'Service-only bounded claim of due retry jobs using FOR UPDATE SKIP LOCKED with a five minute lease.';
comment on function public.terminate_whatsapp_send_job(uuid, text, text, text) is
  'Service-only terminal retry outcome; marks the job dead and the message failed or unconfirmed.';
