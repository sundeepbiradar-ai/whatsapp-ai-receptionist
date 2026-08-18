-- Phase 5.1: service-only Meta webhook verification lookup.
-- A verification token may route only when exactly one active configuration matches.

create or replace function public.resolve_whatsapp_verification_config(
  target_provider text,
  target_verify_token text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, vault
as $function$
  with matches as (
    select
      config.id,
      config.organization_id,
      config.provider,
      config.phone_number_id,
      config.business_account_id,
      config.display_phone_number,
      config.created_at
    from public.organization_whatsapp_configs config
    join public.organization_whatsapp_secret_refs refs
      on refs.config_id = config.id
    join vault.decrypted_secrets verify_secret
      on verify_secret.id = refs.verify_token_secret_id
    where config.provider = target_provider
      and config.is_active
      and verify_secret.decrypted_secret = target_verify_token
  )
  select jsonb_build_object(
    'config_id', matches.id,
    'organization_id', matches.organization_id,
    'provider', matches.provider,
    'phone_number_id', matches.phone_number_id,
    'business_account_id', matches.business_account_id,
    'display_phone_number', matches.display_phone_number
  )
  from matches
  where (select count(*) from matches) = 1;
$function$;

revoke all on function public.resolve_whatsapp_verification_config(text, text) from public;
grant execute on function public.resolve_whatsapp_verification_config(text, text) to service_role;

comment on function public.resolve_whatsapp_verification_config(text, text) is
  'Service-role-only lookup for a unique active Meta webhook verification token; never returns Vault secret values.';
