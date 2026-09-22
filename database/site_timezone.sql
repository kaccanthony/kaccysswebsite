-- Global site timezone mode. Supabase/Postgres remains UTC; this value controls
-- how session and event wall-clock values are interpreted by the website.

create table if not exists public.site_settings (
  setting_key text primary key,
  setting_value text not null,
  updated_at timestamp with time zone not null default now(),
  updated_by uuid references auth.users(id),
  constraint site_settings_timezone_value check (
    setting_key <> 'timezone_mode' or setting_value in ('GMT', 'BST')
  )
);

alter table public.site_settings enable row level security;

grant select, update on public.site_settings to authenticated;

insert into public.site_settings (setting_key, setting_value)
values ('timezone_mode', 'BST')
on conflict (setting_key) do nothing;

drop policy if exists "authenticated users can view site settings" on public.site_settings;
create policy "authenticated users can view site settings"
  on public.site_settings for select
  to authenticated
  using (true);

drop policy if exists "authorized managers can update site timezone" on public.site_settings;
create policy "authorized managers can update site timezone"
  on public.site_settings for update
  to authenticated
  using (
    setting_key = 'timezone_mode'
    and (
      exists (
        select 1 from public.site_admins
        where id = auth.uid()
          and admin_role in ('owner', 'developer', 'moderator')
      )
      or exists (
        select 1 from public.staff_profiles
        where id = auth.uid()
          and staff_rank in ('Operations Manager', 'Community Manager')
      )
    )
  )
  with check (
    setting_key = 'timezone_mode'
    and setting_value in ('GMT', 'BST')
    and (
      exists (
        select 1 from public.site_admins
        where id = auth.uid()
          and admin_role in ('owner', 'developer', 'moderator')
      )
      or exists (
        select 1 from public.staff_profiles
        where id = auth.uid()
          and staff_rank in ('Operations Manager', 'Community Manager')
      )
    )
  );
