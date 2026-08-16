-- Phase 3.2: Core tenant-scoped domain tables.
-- Every relationship carrying organization_id is composite so PostgreSQL rejects
-- cross-tenant references before application code runs.

create type public.conversation_status as enum ('open', 'closed');
create type public.message_direction as enum ('inbound', 'outbound');
create type public.appointment_status as enum ('pending', 'confirmed', 'cancelled', 'completed');

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  phone text not null,
  name text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_organization_id_id_key unique (organization_id, id),
  constraint contacts_organization_phone_key unique (organization_id, phone)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null,
  status public.conversation_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint conversations_organization_id_id_key unique (organization_id, id),
  constraint conversations_organization_contact_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id)
    on delete cascade
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null,
  direction public.message_direction not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint messages_organization_conversation_fk
    foreign key (organization_id, conversation_id)
    references public.conversations (organization_id, id)
    on delete cascade
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null,
  conversation_id uuid,
  status public.appointment_status not null default 'pending',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_organization_id_id_key unique (organization_id, id),
  constraint appointments_organization_contact_fk
    foreign key (organization_id, contact_id)
    references public.contacts (organization_id, id)
    on delete cascade,
  constraint appointments_organization_conversation_fk
    foreign key (organization_id, conversation_id)
    references public.conversations (organization_id, id)
    on delete set null (conversation_id),
  constraint appointments_valid_time check (ends_at > starts_at)
);

create index contacts_organization_id_idx
  on public.contacts (organization_id);

create index conversations_organization_id_idx
  on public.conversations (organization_id);

create index conversations_organization_contact_idx
  on public.conversations (organization_id, contact_id);

create index conversations_organization_last_message_idx
  on public.conversations (organization_id, last_message_at);

create index messages_organization_id_idx
  on public.messages (organization_id);

create index messages_organization_conversation_idx
  on public.messages (organization_id, conversation_id);

create index messages_organization_conversation_created_idx
  on public.messages (organization_id, conversation_id, created_at);

create index appointments_organization_id_idx
  on public.appointments (organization_id);

create index appointments_organization_contact_idx
  on public.appointments (organization_id, contact_id);

create index appointments_organization_starts_idx
  on public.appointments (organization_id, starts_at);

create index appointments_organization_status_idx
  on public.appointments (organization_id, status);

create index appointments_organization_conversation_idx
  on public.appointments (organization_id, conversation_id);

create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create trigger appointments_set_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

grant usage on type public.conversation_status to anon, authenticated, service_role;
grant usage on type public.message_direction to anon, authenticated, service_role;
grant usage on type public.appointment_status to anon, authenticated, service_role;
grant select, insert, update, delete
on table public.contacts, public.conversations, public.messages, public.appointments
to anon, authenticated;
grant all
on table public.contacts, public.conversations, public.messages, public.appointments
to service_role;

alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.appointments enable row level security;

create policy contacts_select_members
on public.contacts
for select
to authenticated
using (public.is_organization_member(organization_id, auth.uid()));

create policy contacts_insert_members
on public.contacts
for insert
to authenticated
with check (public.is_organization_member(organization_id, auth.uid()));

create policy contacts_update_members
on public.contacts
for update
to authenticated
using (public.is_organization_member(organization_id, auth.uid()))
with check (public.is_organization_member(organization_id, auth.uid()));

create policy contacts_delete_members
on public.contacts
for delete
to authenticated
using (public.is_organization_member(organization_id, auth.uid()));

create policy conversations_select_members
on public.conversations
for select
to authenticated
using (public.is_organization_member(organization_id, auth.uid()));

create policy conversations_insert_members
on public.conversations
for insert
to authenticated
with check (public.is_organization_member(organization_id, auth.uid()));

create policy conversations_update_members
on public.conversations
for update
to authenticated
using (public.is_organization_member(organization_id, auth.uid()))
with check (public.is_organization_member(organization_id, auth.uid()));

create policy conversations_delete_members
on public.conversations
for delete
to authenticated
using (public.is_organization_member(organization_id, auth.uid()));

create policy messages_select_members
on public.messages
for select
to authenticated
using (public.is_organization_member(organization_id, auth.uid()));

create policy messages_insert_members
on public.messages
for insert
to authenticated
with check (public.is_organization_member(organization_id, auth.uid()));

create policy messages_update_members
on public.messages
for update
to authenticated
using (public.is_organization_member(organization_id, auth.uid()))
with check (public.is_organization_member(organization_id, auth.uid()));

create policy messages_delete_members
on public.messages
for delete
to authenticated
using (public.is_organization_member(organization_id, auth.uid()));

create policy appointments_select_members
on public.appointments
for select
to authenticated
using (public.is_organization_member(organization_id, auth.uid()));

create policy appointments_insert_members
on public.appointments
for insert
to authenticated
with check (public.is_organization_member(organization_id, auth.uid()));

create policy appointments_update_members
on public.appointments
for update
to authenticated
using (public.is_organization_member(organization_id, auth.uid()))
with check (public.is_organization_member(organization_id, auth.uid()));

create policy appointments_delete_members
on public.appointments
for delete
to authenticated
using (public.is_organization_member(organization_id, auth.uid()));

comment on table public.contacts is 'Tenant-scoped contacts; phone is unique within an organization.';
comment on table public.conversations is 'Tenant-scoped conversations with same-organization contacts.';
comment on table public.messages is 'Tenant-scoped messages with same-organization conversations.';
comment on table public.appointments is 'Tenant-scoped appointments with same-organization contacts and optional conversations.';
