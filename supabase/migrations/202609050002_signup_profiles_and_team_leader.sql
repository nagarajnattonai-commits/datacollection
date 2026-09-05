create table if not exists public.fieldnote_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  occupation text check (
    occupation is null or occupation in (
      'homemaker',
      'professional',
      'self_employed',
      'student',
      'retired',
      'other'
    )
  ),
  work_details text,
  organization text,
  city text,
  country text,
  requested_role text check (
    requested_role is null or requested_role in (
      'contributor',
      'qa',
      'team_leader',
      'admin'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (full_name is null or char_length(full_name) between 2 and 100),
  check (phone is null or char_length(phone) between 8 and 16),
  check (work_details is null or char_length(work_details) <= 100),
  check (organization is null or char_length(organization) <= 120),
  check (city is null or char_length(city) <= 80),
  check (country is null or char_length(country) <= 80)
);

alter table public.fieldnote_profiles enable row level security;
revoke all on table public.fieldnote_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.fieldnote_profiles to service_role;

create or replace function public.fieldnote_sync_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.fieldnote_profiles (
    user_id,
    full_name,
    phone,
    occupation,
    work_details,
    organization,
    city,
    country,
    requested_role,
    updated_at
  ) values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'occupation'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'work_details'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'organization'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'city'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'country'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'requested_role'), ''),
    now()
  )
  on conflict (user_id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    occupation = excluded.occupation,
    work_details = excluded.work_details,
    organization = excluded.organization,
    city = excluded.city,
    country = excluded.country,
    requested_role = excluded.requested_role,
    updated_at = now();
  return new;
end;
$$;

revoke all on function public.fieldnote_sync_auth_profile() from public, anon, authenticated;

drop trigger if exists fieldnote_auth_profile_sync on auth.users;
create trigger fieldnote_auth_profile_sync
after insert or update of raw_user_meta_data on auth.users
for each row execute function public.fieldnote_sync_auth_profile();

insert into public.fieldnote_profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

comment on table public.fieldnote_profiles is
  'Private signup profile data. requested_role is informational and never grants authorization.';
