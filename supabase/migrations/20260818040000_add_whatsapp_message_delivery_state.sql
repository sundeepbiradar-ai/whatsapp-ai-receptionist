-- Phase 5.3: durable delivery state for provider-correlated WhatsApp messages.
-- Legacy and internal messages keep a null delivery_status and are unaffected.

alter table public.messages
  add column delivery_status text,
  add column delivery_status_at timestamptz,
  add column delivery_error_code text,
  add column delivery_error_message text;

alter table public.messages
  add constraint messages_delivery_status_check
  check (
    delivery_status is null
    or delivery_status in ('pending', 'sent', 'delivered', 'read', 'failed')
  );

alter table public.messages
  add constraint messages_delivery_status_at_check
  check ((delivery_status is null) = (delivery_status_at is null));

-- Error metadata is only meaningful for a failed delivery.
alter table public.messages
  add constraint messages_delivery_error_check
  check (
    coalesce(delivery_status, '') = 'failed'
    or (delivery_error_code is null and delivery_error_message is null)
  );

create index messages_organization_delivery_status_idx
  on public.messages (organization_id, delivery_status)
  where delivery_status is not null;

comment on column public.messages.delivery_status is
  'Durable delivery state: pending (persisted, provider outcome unknown), sent, delivered, read, failed. Null for legacy/internal messages.';
comment on column public.messages.delivery_status_at is
  'Timestamp of the current delivery_status; provider timestamp for provider-reported states.';
comment on column public.messages.delivery_error_code is
  'Stable failure code for a failed delivery; provider error code or application failure classification.';
comment on column public.messages.delivery_error_message is
  'Human-readable failure detail for a failed delivery. Never contains credentials.';

create or replace function public.whatsapp_delivery_status_rank(target_status text)
returns integer
language sql
immutable
set search_path = pg_catalog, public
as $function$
  select case target_status
    when 'pending' then 0
    when 'sent' then 1
    when 'delivered' then 2
    when 'read' then 3
    else -1
  end;
$function$;

comment on function public.whatsapp_delivery_status_rank(text) is
  'Monotonic ordering for normal WhatsApp delivery progression; failed is handled separately as a terminal state.';

-- Service-only correlation boundary for trusted normalized provider status events.
-- Correlation is always organization + provider + provider_message_id + owning
-- WhatsApp configuration. A provider message id alone can never mutate a message.
create or replace function public.apply_whatsapp_message_status(
  target_organization_id uuid,
  target_whatsapp_config_id uuid,
  target_provider_message_id text,
  target_status text,
  target_status_at timestamptz,
  target_error_code text default null,
  target_error_message text default null,
  target_provider text default 'meta_whatsapp_cloud'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  resolved_message_id uuid;
  resolved_direction public.message_direction;
  current_status text;
  effective_current text;
  outcome text;
begin
  if target_provider <> 'meta_whatsapp_cloud'
    or target_organization_id is null
    or target_whatsapp_config_id is null
    or target_provider_message_id is null
    or btrim(target_provider_message_id) = ''
    or target_status is null
    or target_status not in ('sent', 'delivered', 'read', 'failed')
    or target_status_at is null
  then
    return jsonb_build_object('ok', false, 'error_code', 'whatsapp_pipeline_input_invalid');
  end if;

  if not exists (
    select 1
    from public.organization_whatsapp_configs config
    where config.id = target_whatsapp_config_id
      and config.organization_id = target_organization_id
      and config.provider = target_provider
      and config.is_active
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'whatsapp_tenant_mismatch');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      target_organization_id::text || ':' || target_provider || ':' || target_provider_message_id,
      0
    )
  );

  select message.id, message.direction, message.delivery_status
    into resolved_message_id, resolved_direction, current_status
  from public.messages message
  join public.conversations conversation
    on conversation.organization_id = message.organization_id
   and conversation.id = message.conversation_id
  where message.organization_id = target_organization_id
    and message.provider = target_provider
    and message.provider_message_id = target_provider_message_id
    and conversation.whatsapp_config_id = target_whatsapp_config_id
  limit 1;

  if resolved_message_id is null then
    return jsonb_build_object('ok', true, 'outcome', 'unknown_message');
  end if;

  if resolved_direction <> 'outbound' then
    return jsonb_build_object(
      'ok', true,
      'outcome', 'ignored_non_outbound',
      'message_id', resolved_message_id
    );
  end if;

  effective_current := coalesce(current_status, 'pending');

  if effective_current = 'failed' then
    outcome := case when target_status = 'failed' then 'ignored_duplicate' else 'ignored_terminal' end;
  elsif target_status = 'failed' then
    outcome := case
      when public.whatsapp_delivery_status_rank(effective_current)
        >= public.whatsapp_delivery_status_rank('delivered')
      then 'ignored_stale'
      else 'applied'
    end;
  elsif target_status = effective_current then
    outcome := 'ignored_duplicate';
  elsif public.whatsapp_delivery_status_rank(target_status)
    <= public.whatsapp_delivery_status_rank(effective_current) then
    outcome := 'ignored_stale';
  else
    outcome := 'applied';
  end if;

  if outcome = 'applied' then
    update public.messages
    set delivery_status = target_status,
        delivery_status_at = target_status_at,
        delivery_error_code = case when target_status = 'failed' then target_error_code else null end,
        delivery_error_message = case when target_status = 'failed' then target_error_message else null end
    where id = resolved_message_id
      and organization_id = target_organization_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'outcome', outcome,
    'message_id', resolved_message_id,
    'previous_status', current_status,
    'status', case when outcome = 'applied' then target_status else current_status end
  );
end;
$function$;

revoke all on function public.apply_whatsapp_message_status(uuid, uuid, text, text, timestamptz, text, text, text) from public;
grant execute on function public.apply_whatsapp_message_status(uuid, uuid, text, text, timestamptz, text, text, text) to service_role;

comment on function public.apply_whatsapp_message_status(uuid, uuid, text, text, timestamptz, text, text, text) is
  'Service-only organization-scoped WhatsApp delivery-status correlation with monotonic, idempotent transitions.';
