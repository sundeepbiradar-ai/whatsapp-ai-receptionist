-- Phase 5.3: tenant-safe message key and the unconfirmed delivery state.
-- unconfirmed means Meta may have accepted the outbound message but the
-- application could not durably correlate the provider response. It is never
-- retried automatically and never regresses to pending.

alter table public.messages
  add constraint messages_organization_id_id_key unique (organization_id, id);

alter table public.messages
  drop constraint messages_delivery_status_check;

alter table public.messages
  add constraint messages_delivery_status_check
  check (
    delivery_status is null
    or delivery_status in ('pending', 'unconfirmed', 'sent', 'delivered', 'read', 'failed')
  );

alter table public.messages
  drop constraint messages_delivery_error_check;

alter table public.messages
  add constraint messages_delivery_error_check
  check (
    coalesce(delivery_status, '') in ('failed', 'unconfirmed')
    or (delivery_error_code is null and delivery_error_message is null)
  );

comment on column public.messages.delivery_status is
  'Durable delivery state: pending (reserved, provider outcome unknown), unconfirmed (provider may have accepted but correlation failed; requires reconciliation), sent, delivered, read, failed. Null for legacy/internal messages.';

-- unconfirmed ranks above pending and below sent so a later trusted provider
-- status event can reconcile it under the existing monotonic rules.
create or replace function public.whatsapp_delivery_status_rank(target_status text)
returns integer
language sql
immutable
set search_path = pg_catalog, public
as $function$
  select case target_status
    when 'pending' then 0
    when 'unconfirmed' then 1
    when 'sent' then 2
    when 'delivered' then 3
    when 'read' then 4
    else -1
  end;
$function$;

comment on function public.whatsapp_delivery_status_rank(text) is
  'Monotonic ordering for WhatsApp delivery progression; failed is handled separately as a terminal state.';
