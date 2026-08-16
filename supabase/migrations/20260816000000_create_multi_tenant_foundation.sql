-- Phase 2.2: Multi-tenant database foundation
--
-- The organization is the tenant boundary. Future organization-owned tables must
-- include organization_id UUID NOT NULL unless explicitly documented otherwise.
-- Direct organization and membership mutations are intentionally denied to the
-- client in this milestone; a trusted server workflow will be added later.

create extension if not exists "pgcrypto";

create type public.organization_role as enum ('owner', 'admin', 'member');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_length check (char_length(trim(name)) between 1 and 200),
  constraint organizations_slug_format check (
    char_length(slug) between 1 and 100
    and slug = lower(slug)
    and slug ~ '^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$'
  )
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.organization_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_organization_user_key unique (organization_id, user_id)
);

create index organization_members_organization_id_idx
  on public.organization_members (organization_id);

create index organization_members_user_id_idx
  on public.organization_members (user_id);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger organization_members_set_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();

-- Explicit grants keep table exposure independent of the Supabase project's
-- auto-exposure setting. RLS remains responsible for row-level authorization.
grant usage on schema public to anon, authenticated, service_role;
grant usage on type public.organization_role to anon, authenticated, service_role;
grant select, insert, update, delete
on table public.profiles, public.organizations, public.organization_members
to anon, authenticated;
grant all
on table public.profiles, public.organizations, public.organization_members
to service_role;

-- This helper is SECURITY DEFINER so its membership lookup does not recursively
-- evaluate organization_members RLS while an organization policy is evaluated.
-- It returns only a boolean and is executable by authenticated users only.
create or replace function public.is_organization_member(
  target_organization_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.organization_members as members
    where members.organization_id = target_organization_id
      and members.user_id = target_user_id
  );
$function$;

revoke all on function public.is_organization_member(uuid, uuid) from public;
grant execute on function public.is_organization_member(uuid, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

-- Profiles are limited to the authenticated user's own application profile.
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Profile deletion is reserved for a trusted account-deletion workflow.
create policy profiles_delete_denied
on public.profiles
for delete
to authenticated
using (false);

-- Organizations are readable only by members. All direct client mutations are
-- denied until a trusted organization-management workflow exists.
create policy organizations_select_member
on public.organizations
for select
to authenticated
using (public.is_organization_member(id));

create policy organizations_insert_denied
on public.organizations
for insert
to authenticated
with check (false);

create policy organizations_update_denied
on public.organizations
for update
to authenticated
using (false)
with check (false);

create policy organizations_delete_denied
on public.organizations
for delete
to authenticated
using (false);

-- Members may read membership records only for organizations they belong to.
-- Membership writes are reserved for a trusted server workflow so users cannot
-- create memberships, alter roles, or remove members through the client.
create policy organization_members_select_member
on public.organization_members
for select
to authenticated
using (public.is_organization_member(organization_id));

create policy organization_members_insert_denied
on public.organization_members
for insert
to authenticated
with check (false);

create policy organization_members_update_denied
on public.organization_members
for update
to authenticated
using (false)
with check (false);

create policy organization_members_delete_denied
on public.organization_members
for delete
to authenticated
using (false);

comment on table public.profiles is
  'Application profile associated with a Supabase Auth user; auth.users remains the authentication source of truth.';
comment on table public.organizations is
  'Tenant boundary for organization-owned business data.';
comment on table public.organization_members is
  'User membership and constrained role within an organization.';
comment on column public.organization_members.role is
  'Initial roles are owner, admin, and member; broader permissions are deferred.';
comment on function public.is_organization_member(uuid, uuid) is
  'RLS helper that checks membership without recursively evaluating organization_members policies.';
