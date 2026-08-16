-- Phase 2.5: Secure organization creation for authenticated users.
-- The function derives the creator from auth.uid() and atomically creates the
-- organization and owner membership. It does not accept user_id or role input.

create or replace function public.create_organization(
  organization_name text,
  organization_slug text
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_organization public.organizations;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.organizations (name, slug)
  values (organization_name, organization_slug)
  returning * into created_organization;

  insert into public.organization_members (organization_id, user_id, role)
  values (created_organization.id, current_user_id, 'owner');

  return created_organization;
end;
$$;

revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

comment on function public.create_organization(text, text) is
  'Atomically creates an organization and owner membership for auth.uid(); never accepts a client user_id or role.';
