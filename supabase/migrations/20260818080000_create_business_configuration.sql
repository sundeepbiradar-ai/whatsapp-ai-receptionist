-- Phase 7: organization-managed business configuration.
-- Profile text and receptionist instructions are tenant-authored, non-secret
-- data. Provider secrets remain untouched in Vault.

alter table public.organizations
  add column description text,
  add column public_email text,
  add column public_phone text,
  add column address text;

alter table public.organizations
  add constraint organizations_description_length
  check (description is null or char_length(description) <= 2000),
  add constraint organizations_public_email_length
  check (public_email is null or char_length(trim(public_email)) between 3 and 320),
  add constraint organizations_public_phone_length
  check (public_phone is null or char_length(trim(public_phone)) between 3 and 50),
  add constraint organizations_address_length
  check (address is null or char_length(address) <= 500);

comment on column public.organizations.description is
  'Tenant-authored business description. Non-secret and safe to show to customers.';

-- Owners and admins may edit profile text only. Column-level grants keep the
-- tenant identity columns (id, name-critical slug) out of client reach.
revoke update on table public.organizations from authenticated;
grant update (description, public_email, public_phone, address, name)
  on table public.organizations to authenticated;

drop policy organizations_update_denied on public.organizations;

create policy organizations_update_admins
on public.organizations
for update
to authenticated
using (public.is_organization_admin(id, auth.uid()))
with check (public.is_organization_admin(id, auth.uid()));

-- Receptionist instructions live apart from provider configuration so that
-- tenant-authored text can never sit next to secret references.
create table public.organization_receptionist_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  instructions text,
  faq text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receptionist_instructions_length
    check (instructions is null or char_length(instructions) <= 4000),
  constraint receptionist_faq_length
    check (faq is null or char_length(faq) <= 4000)
);

create trigger organization_receptionist_settings_set_updated_at
before update on public.organization_receptionist_settings
for each row execute function public.set_updated_at();

grant select, insert, update, delete
  on table public.organization_receptionist_settings to authenticated;
grant all on table public.organization_receptionist_settings to service_role;

alter table public.organization_receptionist_settings enable row level security;

create policy receptionist_settings_select_members
on public.organization_receptionist_settings
for select
to authenticated
using (public.is_organization_member(organization_id, auth.uid()));

create policy receptionist_settings_insert_admins
on public.organization_receptionist_settings
for insert
to authenticated
with check (public.is_organization_admin(organization_id, auth.uid()));

create policy receptionist_settings_update_admins
on public.organization_receptionist_settings
for update
to authenticated
using (public.is_organization_admin(organization_id, auth.uid()))
with check (public.is_organization_admin(organization_id, auth.uid()));

create policy receptionist_settings_delete_admins
on public.organization_receptionist_settings
for delete
to authenticated
using (public.is_organization_admin(organization_id, auth.uid()));

comment on table public.organization_receptionist_settings is
  'Tenant-authored receptionist guidance. Treated as untrusted content by the AI layer; never a source of system instructions or secrets.';

-- Phase 4 shipped scheduling configuration writes to every member. Business
-- configuration is an owner/admin responsibility, so writes are tightened here.
-- Read access for members is unchanged.
drop policy scheduling_settings_insert_members on public.organization_scheduling_settings;
drop policy scheduling_settings_update_members on public.organization_scheduling_settings;
drop policy scheduling_settings_delete_members on public.organization_scheduling_settings;

create policy scheduling_settings_insert_admins
on public.organization_scheduling_settings
for insert
to authenticated
with check (public.is_organization_admin(organization_id, auth.uid()));

create policy scheduling_settings_update_admins
on public.organization_scheduling_settings
for update
to authenticated
using (public.is_organization_admin(organization_id, auth.uid()))
with check (public.is_organization_admin(organization_id, auth.uid()));

create policy scheduling_settings_delete_admins
on public.organization_scheduling_settings
for delete
to authenticated
using (public.is_organization_admin(organization_id, auth.uid()));

drop policy blocked_periods_insert_members on public.organization_blocked_periods;
drop policy blocked_periods_update_members on public.organization_blocked_periods;
drop policy blocked_periods_delete_members on public.organization_blocked_periods;

create policy blocked_periods_insert_admins
on public.organization_blocked_periods
for insert
to authenticated
with check (public.is_organization_admin(organization_id, auth.uid()));

create policy blocked_periods_update_admins
on public.organization_blocked_periods
for update
to authenticated
using (public.is_organization_admin(organization_id, auth.uid()))
with check (public.is_organization_admin(organization_id, auth.uid()));

create policy blocked_periods_delete_admins
on public.organization_blocked_periods
for delete
to authenticated
using (public.is_organization_admin(organization_id, auth.uid()));
