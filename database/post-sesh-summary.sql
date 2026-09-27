-- Post-session summary timestamp cleanup.
-- Keeps full UTC timestamps (started_at / ended_at), removes duplicate
-- time-only started/ended fields and concluded_at, and updates the archive RPC.
-- The old values are copied to session_post_logs_legacy_timestamps first.

begin;

alter table public.session_post_logs
  add column if not exists session_time text,
  add column if not exists additional_slots_provided smallint,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz;

create table if not exists public.session_post_logs_legacy_timestamps (
  session_id integer primary key,
  started time without time zone,
  ended time without time zone,
  concluded_at timestamptz,
  archived_at timestamptz not null default now()
);
alter table public.session_post_logs_legacy_timestamps enable row level security;
revoke all on table public.session_post_logs_legacy_timestamps from public, anon, authenticated;
grant all on table public.session_post_logs_legacy_timestamps to service_role;

do $migration$
declare
  v_definition text;
  v_updated text;
begin
  -- Preserve existing values so the dropped columns can be restored if needed.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'session_post_logs' and column_name = 'started'
  ) and exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'session_post_logs' and column_name = 'ended'
  ) and exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'session_post_logs' and column_name = 'concluded_at'
  ) then
    execute $copy$
      insert into public.session_post_logs_legacy_timestamps (session_id, started, ended, concluded_at)
      select session_id, started, ended, concluded_at
        from public.session_post_logs
      on conflict (session_id) do nothing
    $copy$;
  end if;

  -- The existing PL/pgSQL RPC inserts the legacy fields. Remove those insert
  -- columns and corresponding values before dropping the columns themselves.
  if to_regprocedure('public.archive_session_conclusion(integer,bigint)') is null then
    raise exception 'Expected public.archive_session_conclusion(integer,bigint) to exist';
  end if;

  select pg_get_functiondef('public.archive_session_conclusion(integer,bigint)'::regprocedure)
    into v_definition;

  if position('concluded_at' in v_definition) > 0 or position('started, ended' in v_definition) > 0 then
    v_updated := regexp_replace(
      v_definition,
      'additional_notes,\s*main_ast_notes,\s*started,\s*ended,\s*started_at,\s*ended_at,\s*concluded_at',
      'additional_notes, main_ast_notes, started_at, ended_at',
      'g'
    );
    v_updated := regexp_replace(
      v_updated,
      '\(s\.started_at at time zone ''UTC''\)::time,\s*\(v_ended_at at time zone ''UTC''\)::time,\s*s\.started_at,\s*v_ended_at,\s*v_ended_at;',
      's.started_at, v_ended_at;',
      'g'
    );

    if position('concluded_at' in v_updated) > 0
       or position('started, ended' in v_updated) > 0
       or position('at time zone ''UTC'')::time' in v_updated) > 0 then
      raise exception 'Could not safely update archive_session_conclusion; no columns were dropped';
    end if;

    execute v_updated;
  end if;
end;
$migration$;

alter table public.session_post_logs
  drop column if exists started,
  drop column if exists ended,
  drop column if exists concluded_at;

commit;

-- Verify after applying:
-- select column_name, data_type
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'session_post_logs'
--  order by ordinal_position;
-- select count(*) from public.session_post_logs_legacy_timestamps;
--
-- To restore the legacy columns and their values (the updated archive RPC will
-- continue to ignore them):
-- alter table public.session_post_logs
--   add column started time without time zone,
--   add column ended time without time zone,
--   add column concluded_at timestamptz;
-- update public.session_post_logs p
--    set started = old.started, ended = old.ended, concluded_at = old.concluded_at
--   from public.session_post_logs_legacy_timestamps old
--  where old.session_id = p.session_id;
