-- Phase 5.1: organization-scoped WhatsApp configuration and Vault lookup boundary.
-- Provider secrets remain in Supabase Vault; application tables store only Vault IDs.

create table public.organization_whatsapp_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider = 'meta_whatsapp_cloud'),
  phone_number_id text not null check (char_length(trim(phone_number_id)) > 0),
  business_account_id text not null check (char_length(trim(business_account_id)) > 0),
  display_phone_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_whatsapp_configs_organization_id_id_key unique (organization_id, id),
  constraint organization_whatsapp_configs_provider_phone_key unique (provider, phone_number_id)
);

create table public.organization_whatsapp_secret_refs (
  config_id uuid primary key references public.organization_whatsapp_configs (id) on delete cascade,
  access_token_secret_id uuid not null,
  app_secret_secret_id uuid,
  verify_token_secret_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organization_whatsapp_configs_organization_id_idx
  on public.organization_whatsapp_configs (organization_id);

create index organization_whatsapp_configs_active_phone_idx
  on public.organization_whatsapp_configs (provider, phone_number_id)
  where is_active;

create trigger organization_whatsapp_configs_set_updated_at
before update on public.organization_whatsapp_configs
for each row execute function public.set_updated_at();

create trigger organization_whatsapp_secret_refs_set_updated_at
before update on public.organization_whatsapp_secret_refs
for each row execute function public.set_updated_at();

grant select, insert, update, delete
on table public.organization_whatsapp_configs
to anon, authenticated;
grant all on table public.organization_whatsapp_configs to service_role;

-- Secret references are never exposed through the Data API to application roles.
grant all on table public.organization_whatsapp_secret_refs to service_role;

alter table public.organization_whatsapp_configs enable row level security;
alter table public.organization_whatsapp_secret_refs enable row level security;

create or replace function public.is_organization_admin(
  target_organization_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.organization_members members
    where members.organization_id = target_organization_id
      and members.user_id = target_user_id
      and members.role in ('owner', 'admin')
  );
$function$;

revoke all on function public.is_organization_admin(uuid, uuid) from public;
grant execute on function public.is_organization_admin(uuid, uuid) to authenticated;

create policy organization_whatsapp_configs_select_members
on public.organization_whatsapp_configs
for select
to authenticated
using (public.is_organization_member(organization_id, auth.uid()));

create policy organization_whatsapp_configs_insert_admins
on public.organization_whatsapp_configs
for insert
to authenticated
with check (public.is_organization_admin(organization_id, auth.uid()));

create policy organization_whatsapp_configs_update_admins
on public.organization_whatsapp_configs
for update
to authenticated
using (public.is_organization_admin(organization_id, auth.uid()))
with check (public.is_organization_admin(organization_id, auth.uid()));

create policy organization_whatsapp_configs_delete_admins
on public.organization_whatsapp_configs
for delete
to authenticated
using (public.is_organization_admin(organization_id, auth.uid()));

-- The secret-reference table has no authenticated/anonymous policies and no grants.
-- Vault values are returned only by the service-role-only resolution RPC below.

create or replace function public.resolve_whatsapp_config(
  target_provider text,
  target_phone_number_id text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, vault
as $function$
  select jsonb_build_object(
    'config_id', config.id,
    'organization_id', config.organization_id,
    'provider', config.provider,
    'phone_number_id', config.phone_number_id,
    'business_account_id', config.business_account_id,
    'display_phone_number', config.display_phone_number,
    'access_token', access_secret.decrypted_secret,
    'app_secret', app_secret.decrypted_secret,
    'verify_token', verify_secret.decrypted_secret
  )
  from public.organization_whatsapp_configs config
  join public.organization_whatsapp_secret_refs refs
    on refs.config_id = config.id
  join vault.decrypted_secrets access_secret
    on access_secret.id = refs.access_token_secret_id
  left join vault.decrypted_secrets app_secret
    on app_secret.id = refs.app_secret_secret_id
  left join vault.decrypted_secrets verify_secret
    on verify_secret.id = refs.verify_token_secret_id
  where config.provider = target_provider
    and config.phone_number_id = target_phone_number_id
    and config.is_active;
$function$;

revoke all on function public.resolve_whatsapp_config(text, text) from public;
grant execute on function public.resolve_whatsapp_config(text, text) to service_role;

create or replace function public.resolve_whatsapp_config_for_organization(
  target_organization_id uuid,
  target_provider text default 'meta_whatsapp_cloud'
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, vault
as $function$
  select jsonb_build_object(
    'config_id', config.id,
    'organization_id', config.organization_id,
    'provider', config.provider,
    'phone_number_id', config.phone_number_id,
    'business_account_id', config.business_account_id,
    'display_phone_number', config.display_phone_number,
    'access_token', access_secret.decrypted_secret,
    'app_secret', app_secret.decrypted_secret,
    'verify_token', verify_secret.decrypted_secret
  )
  from public.organization_whatsapp_configs config
  join public.organization_whatsapp_secret_refs refs
    on refs.config_id = config.id
  join vault.decrypted_secrets access_secret
    on access_secret.id = refs.access_token_secret_id
  left join vault.decrypted_secrets app_secret
    on app_secret.id = refs.app_secret_secret_id
  left join vault.decrypted_secrets verify_secret
    on verify_secret.id = refs.verify_token_secret_id
  where config.organization_id = target_organization_id
    and config.provider = target_provider
    and config.is_active
  order by config.created_at asc
  limit 1;
$function$;

revoke all on function public.resolve_whatsapp_config_for_organization(uuid, text) from public;
grant execute on function public.resolve_whatsapp_config_for_organization(uuid, text) to service_role;

comment on table public.organization_whatsapp_configs is
  'Safe organization-owned WhatsApp provider metadata; provider secrets remain in Supabase Vault.';
comment on table public.organization_whatsapp_secret_refs is
  'Server-only references to Supabase Vault secrets; never exposed to anon or authenticated roles.';
comment on function public.resolve_whatsapp_config(text, text) is
  'Service-role-only lookup from provider phone number to an active organization and Vault secrets.';
comment on function public.resolve_whatsapp_config_for_organization(uuid, text) is
  'Service-role-only lookup from organization to its oldest active WhatsApp configuration and Vault secrets.';
