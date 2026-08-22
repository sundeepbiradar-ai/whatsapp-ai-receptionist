-- Durable inbound AI processing jobs. One job is allowed per persisted inbound
-- message; outbound delivery remains owned by whatsapp_send_jobs.

alter table public.messages
  add column source_inbound_message_id uuid;

alter table public.messages
  add constraint messages_source_inbound_fk
  foreign key (organization_id, source_inbound_message_id)
  references public.messages (organization_id, id);

create unique index messages_one_ai_reply_per_inbound
  on public.messages (organization_id, source_inbound_message_id)
  where source_inbound_message_id is not null;

create or replace function public.validate_whatsapp_reply_source()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.source_inbound_message_id is not null and not exists (
    select 1 from public.messages inbound
    where inbound.organization_id = new.organization_id
      and inbound.id = new.source_inbound_message_id
      and inbound.direction = 'inbound'
  ) then
    raise exception 'source_inbound_message_id must reference an inbound message';
  end if;
  return new;
end;
$function$;

create trigger messages_validate_whatsapp_reply_source
before insert or update of source_inbound_message_id on public.messages
for each row execute function public.validate_whatsapp_reply_source();

create table public.whatsapp_ai_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  inbound_message_id uuid not null,
  conversation_id uuid not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_ai_jobs_status_check
    check (status in ('pending', 'processing', 'completed', 'dead')),
  constraint whatsapp_ai_jobs_attempt_count_check
    check (attempt_count >= 0 and attempt_count <= max_attempts),
  constraint whatsapp_ai_jobs_max_attempts_check
    check (max_attempts between 1 and 10),
  constraint whatsapp_ai_jobs_claim_check
    check ((claimed_at is null) = (claim_expires_at is null)),
  constraint whatsapp_ai_jobs_inbound_fk
    foreign key (organization_id, inbound_message_id)
    references public.messages (organization_id, id) on delete cascade,
  constraint whatsapp_ai_jobs_conversation_fk
    foreign key (organization_id, conversation_id)
    references public.conversations (organization_id, id) on delete cascade,
  constraint whatsapp_ai_jobs_inbound_unique unique (organization_id, inbound_message_id)
);

create or replace function public.validate_whatsapp_ai_job_context()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
begin
  if not exists (
    select 1
    from public.messages inbound
    where inbound.organization_id = new.organization_id
      and inbound.id = new.inbound_message_id
      and inbound.direction = 'inbound'
      and inbound.conversation_id = new.conversation_id
  ) then
    raise exception 'AI job context does not match its inbound message';
  end if;
  return new;
end;
$function$;

create trigger whatsapp_ai_jobs_validate_context
before insert or update of inbound_message_id, conversation_id, organization_id
on public.whatsapp_ai_jobs
for each row execute function public.validate_whatsapp_ai_job_context();

create index whatsapp_ai_jobs_claim_idx
  on public.whatsapp_ai_jobs (next_attempt_at, created_at)
  where status = 'pending';

alter table public.whatsapp_ai_jobs enable row level security;
revoke all on table public.whatsapp_ai_jobs from anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_ai_jobs to service_role;

create or replace function public.enqueue_whatsapp_ai_job(
  target_organization_id uuid,
  target_inbound_message_id uuid,
  target_conversation_id uuid
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
  if target_organization_id is null or target_inbound_message_id is null or target_conversation_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'whatsapp_ai_job_input_invalid');
  end if;

  if not exists (
    select 1
    from public.messages message
    join public.conversations conversation
      on conversation.organization_id = message.organization_id
     and conversation.id = message.conversation_id
    where message.organization_id = target_organization_id
      and message.id = target_inbound_message_id
      and message.direction = 'inbound'
      and message.conversation_id = target_conversation_id
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'whatsapp_ai_job_message_invalid');
  end if;

  insert into public.whatsapp_ai_jobs (organization_id, inbound_message_id, conversation_id)
  values (target_organization_id, target_inbound_message_id, target_conversation_id)
  on conflict (organization_id, inbound_message_id) do nothing
  returning id into resolved_job_id;

  if resolved_job_id is null then
    select id into resolved_job_id
    from public.whatsapp_ai_jobs
    where organization_id = target_organization_id
      and inbound_message_id = target_inbound_message_id;
  end if;

  return jsonb_build_object('ok', true, 'job_id', resolved_job_id);
end;
$function$;

create or replace function public.process_inbound_meta_message_with_ai_job(
  target_organization_id uuid,
  target_whatsapp_config_id uuid,
  target_sender_phone text,
  target_provider_message_id text,
  target_content text,
  target_created_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  pipeline_result jsonb;
  job_result jsonb;
  inbound_message_id uuid;
  resolved_conversation_id uuid;
begin
  pipeline_result := public.process_inbound_whatsapp_message(
    target_organization_id,
    target_whatsapp_config_id,
    target_sender_phone,
    target_provider_message_id,
    target_content,
    target_created_at,
    'meta_whatsapp_cloud'
  );

  if pipeline_result->>'ok' = 'true' then
    inbound_message_id := (pipeline_result->>'message_id')::uuid;
    resolved_conversation_id := (pipeline_result->>'conversation_id')::uuid;
  elsif pipeline_result->>'error_code' = 'whatsapp_duplicate_provider_message' then
    select message.id, message.conversation_id
      into inbound_message_id, resolved_conversation_id
    from public.messages message
    where message.organization_id = target_organization_id
      and message.provider = 'meta_whatsapp_cloud'
      and message.provider_message_id = target_provider_message_id
      and message.direction = 'inbound'
    limit 1;
  end if;

  if inbound_message_id is not null then
    job_result := public.enqueue_whatsapp_ai_job(
      target_organization_id,
      inbound_message_id,
      resolved_conversation_id
    );
    if coalesce((job_result->>'ok')::boolean, false) = false then
      raise exception 'could not enqueue inbound Meta AI job';
    end if;
  end if;

  return pipeline_result;
end;
$function$;

create or replace function public.claim_whatsapp_ai_jobs(target_batch_size integer default 10)
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
    return jsonb_build_object('ok', false, 'error_code', 'whatsapp_ai_job_input_invalid');
  end if;

  with claimable as (
    select job.id
    from public.whatsapp_ai_jobs job
    where job.status = 'pending'
      and job.next_attempt_at <= now()
      and job.attempt_count < job.max_attempts
    order by job.next_attempt_at, job.created_at
    limit target_batch_size
    for update skip locked
  ), claimed as (
    update public.whatsapp_ai_jobs job
    set status = 'processing', attempt_count = job.attempt_count + 1,
        claimed_at = now(), claim_expires_at = now() + interval '5 minutes', updated_at = now()
    from claimable
    where job.id = claimable.id
    returning job.id, job.organization_id, job.inbound_message_id, job.conversation_id,
      job.attempt_count, job.max_attempts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'job_id', claimed.id,
    'organization_id', claimed.organization_id,
    'inbound_message_id', claimed.inbound_message_id,
    'conversation_id', claimed.conversation_id,
    'attempt_count', claimed.attempt_count,
    'max_attempts', claimed.max_attempts
  )), '[]'::jsonb) into claimed_jobs
  from claimed;

  return jsonb_build_object('ok', true, 'jobs', claimed_jobs);
end;
$function$;

create or replace function public.complete_whatsapp_ai_job(target_job_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
begin
  update public.whatsapp_ai_jobs
  set status = 'completed', claimed_at = null, claim_expires_at = null, updated_at = now()
  where id = target_job_id and status = 'processing';
  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.reschedule_whatsapp_ai_job(
  target_job_id uuid,
  target_next_attempt_at timestamptz,
  target_error_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
begin
  update public.whatsapp_ai_jobs
  set status = case when attempt_count >= max_attempts then 'dead' else 'pending' end,
      claimed_at = null, claim_expires_at = null, next_attempt_at = target_next_attempt_at,
      last_error_code = target_error_code, updated_at = now()
  where id = target_job_id and status = 'processing';
  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.reap_whatsapp_ai_job_claims()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare released_count integer;
begin
  update public.whatsapp_ai_jobs
  set status = case when attempt_count >= max_attempts then 'dead' else 'pending' end,
      claimed_at = null, claim_expires_at = null, updated_at = now()
  where status = 'processing' and claim_expires_at < now();
  get diagnostics released_count = row_count;
  return jsonb_build_object('ok', true, 'released', released_count);
end;
$function$;

revoke all on function public.enqueue_whatsapp_ai_job(uuid, uuid, uuid) from public;
revoke all on function public.process_inbound_meta_message_with_ai_job(uuid, uuid, text, text, text, timestamptz) from public;
revoke all on function public.validate_whatsapp_reply_source() from public;
revoke all on function public.validate_whatsapp_ai_job_context() from public;
revoke all on function public.claim_whatsapp_ai_jobs(integer) from public;
revoke all on function public.complete_whatsapp_ai_job(uuid) from public;
revoke all on function public.reschedule_whatsapp_ai_job(uuid, timestamptz, text) from public;
revoke all on function public.reap_whatsapp_ai_job_claims() from public;
grant execute on function public.enqueue_whatsapp_ai_job(uuid, uuid, uuid) to service_role;
grant execute on function public.process_inbound_meta_message_with_ai_job(uuid, uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.claim_whatsapp_ai_jobs(integer) to service_role;
grant execute on function public.complete_whatsapp_ai_job(uuid) to service_role;
grant execute on function public.reschedule_whatsapp_ai_job(uuid, timestamptz, text) to service_role;
grant execute on function public.reap_whatsapp_ai_job_claims() to service_role;