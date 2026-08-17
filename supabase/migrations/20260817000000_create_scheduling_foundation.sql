-- Phase 4.3: organization-scoped scheduling configuration and transactional foundation.

create or replace function public.is_valid_timezone(target_timezone text)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from pg_timezone_names
    where name = target_timezone
  );
$$;

create or replace function public.is_valid_scheduling_hours(
  target_working_days jsonb,
  target_business_hours jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  day_name text;
  day_names constant text[] := array['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  hours jsonb;
  start_text text;
  end_text text;
  start_time time;
  end_time time;
begin
  if jsonb_typeof(target_working_days) <> 'array'
    or jsonb_typeof(target_business_hours) <> 'object'
  then
    return false;
  end if;

  if jsonb_array_length(target_working_days) <> (
    select count(*) from jsonb_array_elements_text(target_working_days) as days(value)
    where value = any(day_names)
  )
  or jsonb_array_length(target_working_days) <> (
    select count(distinct value) from jsonb_array_elements_text(target_working_days) as days(value)
  )
  then
    return false;
  end if;

  for day_name in select value from jsonb_array_elements_text(target_working_days) as days(value)
  loop
    hours := target_business_hours -> day_name;
    if jsonb_typeof(hours) <> 'object'
      or not (hours ? 'start')
      or not (hours ? 'end')
      or (select count(*) from jsonb_object_keys(hours)) <> 2
    then
      return false;
    end if;

    start_text := hours ->> 'start';
    end_text := hours ->> 'end';
    if start_text !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
      or end_text !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
    then
      return false;
    end if;

    start_time := start_text::time;
    end_time := end_text::time;
    if start_time >= end_time then
      return false;
    end if;
  end loop;

  for day_name in select unnest(day_names)
  loop
    if not (target_working_days ? day_name) and target_business_hours ? day_name then
      return false;
    end if;
  end loop;

  return true;
end;
$function$;

create table public.organization_scheduling_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  timezone text not null default 'UTC',
  working_days jsonb not null default '["monday", "tuesday", "wednesday", "thursday", "friday"]'::jsonb,
  business_hours jsonb not null default '{"monday":{"start":"09:00","end":"17:00"},"tuesday":{"start":"09:00","end":"17:00"},"wednesday":{"start":"09:00","end":"17:00"},"thursday":{"start":"09:00","end":"17:00"},"friday":{"start":"09:00","end":"17:00"}}'::jsonb,
  default_duration_minutes integer not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduling_settings_duration_range check (default_duration_minutes between 1 and 1440),
  constraint scheduling_settings_timezone_valid check (public.is_valid_timezone(timezone)),
  constraint scheduling_settings_hours_valid check (public.is_valid_scheduling_hours(working_days, business_hours))
);

create table public.organization_blocked_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blocked_period_valid_time check (ends_at > starts_at)
);

create index scheduling_settings_organization_id_idx
  on public.organization_scheduling_settings (organization_id);

create index blocked_periods_organization_time_idx
  on public.organization_blocked_periods (organization_id, starts_at, ends_at);

create trigger scheduling_settings_set_updated_at
before update on public.organization_scheduling_settings
for each row execute function public.set_updated_at();

create trigger blocked_periods_set_updated_at
before update on public.organization_blocked_periods
for each row execute function public.set_updated_at();

grant select, insert, update, delete
on table public.organization_scheduling_settings, public.organization_blocked_periods
to authenticated;
grant all
on table public.organization_scheduling_settings, public.organization_blocked_periods
to service_role;

alter table public.organization_scheduling_settings enable row level security;
alter table public.organization_blocked_periods enable row level security;

create policy scheduling_settings_select_members
on public.organization_scheduling_settings
for select
to authenticated
using (public.is_organization_member(organization_id, auth.uid()));

create policy scheduling_settings_insert_members
on public.organization_scheduling_settings
for insert
to authenticated
with check (public.is_organization_member(organization_id, auth.uid()));

create policy scheduling_settings_update_members
on public.organization_scheduling_settings
for update
to authenticated
using (public.is_organization_member(organization_id, auth.uid()))
with check (public.is_organization_member(organization_id, auth.uid()));

create policy scheduling_settings_delete_members
on public.organization_scheduling_settings
for delete
to authenticated
using (public.is_organization_member(organization_id, auth.uid()));

create policy blocked_periods_select_members
on public.organization_blocked_periods
for select
to authenticated
using (public.is_organization_member(organization_id, auth.uid()));

create policy blocked_periods_insert_members
on public.organization_blocked_periods
for insert
to authenticated
with check (public.is_organization_member(organization_id, auth.uid()));

create policy blocked_periods_update_members
on public.organization_blocked_periods
for update
to authenticated
using (public.is_organization_member(organization_id, auth.uid()))
with check (public.is_organization_member(organization_id, auth.uid()));

create policy blocked_periods_delete_members
on public.organization_blocked_periods
for delete
to authenticated
using (public.is_organization_member(organization_id, auth.uid()));

grant execute on function public.is_valid_timezone(text) to authenticated, service_role;
grant execute on function public.is_valid_scheduling_hours(jsonb, jsonb) to authenticated, service_role;

drop function if exists public.book_or_reschedule_appointment(
  text, uuid, uuid, uuid, timestamptz, timestamptz, uuid, text
);

create or replace function public.book_or_reschedule_appointment(
  operation text,
  target_organization_id uuid,
  target_contact_id uuid,
  target_conversation_id uuid,
  target_starts_at timestamptz,
  target_ends_at timestamptz,
  target_appointment_id uuid default null,
  target_notes text default null,
  target_status public.appointment_status default 'pending'
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $function$
declare
  settings_row public.organization_scheduling_settings%rowtype;
  existing_appointment public.appointments%rowtype;
  appointment_id uuid;
  local_start timestamp;
  local_end timestamp;
  day_name text;
  hours jsonb;
begin
  if not public.is_organization_member(target_organization_id, auth.uid()) then
    return jsonb_build_object('ok', false, 'error_code', 'appointment_relationship_invalid');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_organization_id::text, 0));

  if target_starts_at is null or target_ends_at is null or target_ends_at <= target_starts_at then
    return jsonb_build_object('ok', false, 'error_code', 'appointment_time_invalid');
  end if;

  if target_ends_at - target_starts_at > interval '24 hours' then
    return jsonb_build_object('ok', false, 'error_code', 'appointment_duration_invalid');
  end if;

  if target_starts_at <= now() then
    return jsonb_build_object('ok', false, 'error_code', 'appointment_past');
  end if;

  select * into settings_row
  from public.organization_scheduling_settings
  where organization_id = target_organization_id;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'scheduling_configuration_unavailable');
  end if;

  if not exists (
    select 1 from public.contacts
    where organization_id = target_organization_id and id = target_contact_id
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'appointment_relationship_invalid');
  end if;

  if target_conversation_id is not null and not exists (
    select 1 from public.conversations
    where organization_id = target_organization_id
      and id = target_conversation_id
      and contact_id = target_contact_id
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'appointment_relationship_invalid');
  end if;

  local_start := target_starts_at at time zone settings_row.timezone;
  local_end := target_ends_at at time zone settings_row.timezone;
  day_name := (array['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])[
    extract(isodow from local_start)::integer
  ];
  if local_start::date <> local_end::date or not (settings_row.working_days ? day_name) then
    return jsonb_build_object('ok', false, 'error_code', 'appointment_outside_business_hours');
  end if;

  hours := settings_row.business_hours -> day_name;
  if local_start::time < (hours ->> 'start')::time
    or local_end::time > (hours ->> 'end')::time
  then
    return jsonb_build_object('ok', false, 'error_code', 'appointment_outside_business_hours');
  end if;

  if exists (
    select 1 from public.organization_blocked_periods
    where organization_id = target_organization_id
      and starts_at < target_ends_at
      and ends_at > target_starts_at
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'appointment_blocked_period');
  end if;

  if operation = 'reschedule' then
    if target_appointment_id is null then
      return jsonb_build_object('ok', false, 'error_code', 'appointment_reschedule_invalid');
    end if;

    select * into existing_appointment
    from public.appointments
    where organization_id = target_organization_id and id = target_appointment_id
    for update;
    if not found then
      return jsonb_build_object('ok', false, 'error_code', 'not_found');
    end if;

    if existing_appointment.status in ('cancelled', 'completed')
      or existing_appointment.starts_at <= now()
    then
      return jsonb_build_object('ok', false, 'error_code', 'appointment_reschedule_invalid');
    end if;
  elsif operation <> 'book' then
    return jsonb_build_object('ok', false, 'error_code', 'appointment_operation_invalid');
  end if;

  if exists (
    select 1 from public.appointments
    where organization_id = target_organization_id
      and status in ('pending', 'confirmed')
      and starts_at < target_ends_at
      and ends_at > target_starts_at
      and (operation <> 'reschedule' or id <> target_appointment_id)
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'appointment_conflict');
  end if;

  if operation = 'book' then
    insert into public.appointments (
      organization_id, contact_id, conversation_id, status, starts_at, ends_at, notes
    ) values (
      target_organization_id, target_contact_id, target_conversation_id, target_status,
      target_starts_at, target_ends_at, target_notes
    ) returning id into appointment_id;
  else
    update public.appointments
    set contact_id = target_contact_id,
        conversation_id = target_conversation_id,
        starts_at = target_starts_at,
        ends_at = target_ends_at,
        notes = target_notes
    where organization_id = target_organization_id and id = target_appointment_id
    returning id into appointment_id;
  end if;

  return jsonb_build_object('ok', true, 'appointment_id', appointment_id);
end;
$function$;

revoke all on function public.book_or_reschedule_appointment(
  text, uuid, uuid, uuid, timestamptz, timestamptz, uuid, text, public.appointment_status
) from public;
grant execute on function public.book_or_reschedule_appointment(
  text, uuid, uuid, uuid, timestamptz, timestamptz, uuid, text, public.appointment_status
) to authenticated;

comment on table public.organization_scheduling_settings is
  'Organization-scoped scheduling configuration; availability is configured lazily.';
comment on table public.organization_blocked_periods is
  'Non-recurring organization-scoped periods that block appointment availability.';
comment on function public.book_or_reschedule_appointment(text, uuid, uuid, uuid, timestamptz, timestamptz, uuid, text, public.appointment_status) is
  'SECURITY INVOKER transactional foundation for organization-scoped appointment booking and rescheduling.';