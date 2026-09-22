-- OPTIONAL hardening/cleanup for the exact schema in current_db.sql.
-- The Next.js sync route does not require new tables or staff/trainee columns.
-- It writes the existing normalized tables through a guarded server endpoint.

begin;

update public.session_ongoing
set live_state = '{}'::jsonb
where live_state is null;

alter table public.session_ongoing
  alter column live_state set default '{}'::jsonb,
  alter column live_state set not null;

update public.session_ongoing
set last_updated = now()
where last_updated is null;

alter table public.session_ongoing
  alter column last_updated set default now(),
  alter column last_updated set not null;

-- current_db.sql already has rank-based INSERT/UPDATE/DELETE policies. This
-- additional FOR ALL policy makes those restrictions ineffective because RLS
-- policies are ORed: any authenticated user can currently mutate the table.
drop policy if exists session_ongoing_rw on public.session_ongoing;

-- Remove the earlier incompatible policy if it was ever created. The guarded
-- Next.js endpoint authorizes assignment before using service_role for writes.
drop policy if exists "assigned staff can update ongoing sessions"
  on public.session_ongoing;

alter table public.session_ongoing replica identity full;

commit;

-- Verification only. Expected: jsonb / NO / true, timestamptz / NO, and
-- has_open_authenticated_write_policy = false.
select
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'session_ongoing'
  and c.column_name in ('live_state', 'last_updated')
order by c.column_name;

select
  exists (
    select 1
    from pg_publication_tables pt
    where pt.pubname = 'supabase_realtime'
      and pt.schemaname = 'public'
      and pt.tablename = 'session_ongoing'
  ) as realtime_enabled,
  exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'session_ongoing'
      and p.policyname = 'session_ongoing_rw'
  ) as has_open_authenticated_write_policy;
