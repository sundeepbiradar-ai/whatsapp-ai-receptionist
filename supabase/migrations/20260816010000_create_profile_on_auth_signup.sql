-- Phase 2.3: Create an application profile for every Supabase Auth user.
-- auth.users remains the authentication source of truth.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

comment on function public.handle_new_auth_user() is
  'Creates the application profile linked to a new Supabase Auth user without storing credentials.';
