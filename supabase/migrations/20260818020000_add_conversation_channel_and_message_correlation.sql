-- Phase 5.2: schema foundation for WhatsApp conversation identity and message correlation.
-- Legacy conversations/messages remain valid because all new fields are nullable.

alter table public.messages
  add column provider text,
  add column provider_message_id text;

alter table public.messages
  add constraint messages_provider_check
  check (provider is null or provider = 'meta_whatsapp_cloud');

create unique index messages_organization_provider_message_key
  on public.messages (organization_id, provider, provider_message_id)
  where provider is not null and provider_message_id is not null;

alter table public.conversations
  add column channel text,
  add column whatsapp_config_id uuid;

alter table public.conversations
  add constraint conversations_whatsapp_identity_check
  check ((channel = 'whatsapp') = (whatsapp_config_id is not null));

alter table public.conversations
  add constraint conversations_organization_whatsapp_config_fk
  foreign key (organization_id, whatsapp_config_id)
  references public.organization_whatsapp_configs (organization_id, id)
  on delete set null;

create index conversations_organization_channel_idx
  on public.conversations (organization_id, channel);

create index conversations_organization_whatsapp_config_idx
  on public.conversations (organization_id, whatsapp_config_id);

-- Preserve historical closed conversations while allowing one active WhatsApp
-- conversation per organization/contact/configuration for future pipeline reuse.
create unique index conversations_active_whatsapp_identity_key
  on public.conversations (organization_id, contact_id, whatsapp_config_id)
  where channel = 'whatsapp'
    and status = 'open'
    and whatsapp_config_id is not null;

comment on column public.messages.provider is
  'Origin provider for externally correlated messages; currently meta_whatsapp_cloud or null for legacy/internal messages.';
comment on column public.messages.provider_message_id is
  'Provider message identifier for correlation; durable deduplication/reliability remains deferred.';
comment on column public.conversations.channel is
  'Optional channel identity; WhatsApp conversations use channel=whatsapp.';
comment on column public.conversations.whatsapp_config_id is
  'Organization-owned WhatsApp configuration used for a WhatsApp conversation.';
