-- Phase 5.2: narrow service-only persistence boundary for verified WhatsApp messages.
-- The function revalidates trusted config ownership before touching tenant data.

create or replace function public.process_inbound_whatsapp_message(
  target_organization_id uuid,
  target_whatsapp_config_id uuid,
  target_sender_phone text,
  target_provider_message_id text,
  target_content text,
  target_created_at timestamptz,
  target_provider text default 'meta_whatsapp_cloud'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  resolved_contact_id uuid;
  resolved_conversation_id uuid;
  resolved_message_id uuid;
begin
  if target_provider <> 'meta_whatsapp_cloud'
    or target_sender_phone is null
    or btrim(target_sender_phone) = ''
    or target_provider_message_id is null
    or btrim(target_provider_message_id) = ''
    or target_content is null
    or btrim(target_content) = ''
    or target_created_at is null
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

  select message.conversation_id, conversation.contact_id
    into resolved_conversation_id, resolved_contact_id
  from public.messages message
  join public.conversations conversation
    on conversation.organization_id = message.organization_id
   and conversation.id = message.conversation_id
  where message.organization_id = target_organization_id
    and message.provider = target_provider
    and message.provider_message_id = target_provider_message_id
  limit 1;

  if resolved_conversation_id is not null then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'whatsapp_duplicate_provider_message',
      'contact_id', resolved_contact_id,
      'conversation_id', resolved_conversation_id
    );
  end if;

  select contact.id into resolved_contact_id
  from public.contacts contact
  where contact.organization_id = target_organization_id
    and contact.phone = target_sender_phone
  limit 1;

  if resolved_contact_id is null then
    insert into public.contacts (organization_id, phone, name)
    values (target_organization_id, target_sender_phone, target_sender_phone)
    on conflict (organization_id, phone) do nothing
    returning id into resolved_contact_id;

    if resolved_contact_id is null then
      select contact.id into resolved_contact_id
      from public.contacts contact
      where contact.organization_id = target_organization_id
        and contact.phone = target_sender_phone
      limit 1;
    end if;
  end if;

  select conversation.id into resolved_conversation_id
  from public.conversations conversation
  where conversation.organization_id = target_organization_id
    and conversation.contact_id = resolved_contact_id
    and conversation.channel = 'whatsapp'
    and conversation.whatsapp_config_id = target_whatsapp_config_id
    and conversation.status = 'open'
  order by conversation.created_at asc, conversation.id asc
  limit 1;

  if resolved_conversation_id is null then
    insert into public.conversations (
      organization_id,
      contact_id,
      status,
      channel,
      whatsapp_config_id,
      last_message_at
    ) values (
      target_organization_id,
      resolved_contact_id,
      'open',
      'whatsapp',
      target_whatsapp_config_id,
      target_created_at
    )
    on conflict do nothing
    returning id into resolved_conversation_id;

    if resolved_conversation_id is null then
      select conversation.id into resolved_conversation_id
      from public.conversations conversation
      where conversation.organization_id = target_organization_id
        and conversation.contact_id = resolved_contact_id
        and conversation.channel = 'whatsapp'
        and conversation.whatsapp_config_id = target_whatsapp_config_id
        and conversation.status = 'open'
      order by conversation.created_at asc, conversation.id asc
      limit 1;
    end if;
  else
    update public.conversations
    set last_message_at = greatest(coalesce(last_message_at, target_created_at), target_created_at)
    where id = resolved_conversation_id
      and organization_id = target_organization_id;
  end if;

  begin
    insert into public.messages (
      organization_id,
      conversation_id,
      direction,
      content,
      provider,
      provider_message_id,
      created_at
    ) values (
      target_organization_id,
      resolved_conversation_id,
      'inbound',
      target_content,
      target_provider,
      target_provider_message_id,
      target_created_at
    ) returning id into resolved_message_id;
  exception when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'whatsapp_duplicate_provider_message',
      'contact_id', resolved_contact_id,
      'conversation_id', resolved_conversation_id
    );
  end;

  return jsonb_build_object(
    'ok', true,
    'contact_id', resolved_contact_id,
    'conversation_id', resolved_conversation_id,
    'message_id', resolved_message_id,
    'provider_message_id', target_provider_message_id
  );
end;
$function$;

revoke all on function public.process_inbound_whatsapp_message(uuid, uuid, text, text, text, timestamptz, text) from public;
grant execute on function public.process_inbound_whatsapp_message(uuid, uuid, text, text, text, timestamptz, text) to service_role;

comment on function public.process_inbound_whatsapp_message(uuid, uuid, text, text, text, timestamptz, text) is
  'Service-only atomic persistence boundary for trusted normalized inbound WhatsApp text messages; reliability workflows are deferred.';
