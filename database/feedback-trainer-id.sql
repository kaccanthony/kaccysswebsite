-- Fix trainer ID resolution when archiving feedback logs. The trainer name in
-- a live assignment can be a server nickname, Discord username, Roblox name,
-- role-prefixed name, or an unclaimed staff-roster name.

begin;

do $migration$
declare
  v_definition text;
  v_updated text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'profiles'
       and column_name = 'discord_server_name'
  ) then
    raise exception 'Run database/profile_upd_27-09.sql before this migration';
  end if;

  if to_regprocedure('public.archive_session_conclusion(integer,bigint)') is null then
    raise exception 'Expected public.archive_session_conclusion(integer,bigint) to exist';
  end if;

  select pg_get_functiondef('public.archive_session_conclusion(integer,bigint)'::regprocedure)
    into v_definition;

  if position('select discord_id from public.profiles' in v_definition) > 0
     and position('where lower(discord_username) = lower(t.trainer_name)' in v_definition) > 0 then
    v_updated := replace(
      v_definition,
      $old$      select discord_id from public.profiles
       where lower(discord_username) = lower(t.trainer_name)
       order by id limit 1$old$,
      $new$      select candidate.discord_id
        from (
          select profile.discord_id, 0 as source_order
            from public.profiles profile
           where regexp_replace(lower(btrim(profile.discord_username)), '^(\[[^]]+\][[:space:]]*)+', '') = regexp_replace(lower(btrim(t.trainer_name)), '^(\[[^]]+\][[:space:]]*)+', '')
              or regexp_replace(lower(btrim(profile.discord_server_name)), '^(\[[^]]+\][[:space:]]*)+', '') = regexp_replace(lower(btrim(t.trainer_name)), '^(\[[^]]+\][[:space:]]*)+', '')
              or regexp_replace(lower(btrim(profile.roblox_username)), '^(\[[^]]+\][[:space:]]*)+', '') = regexp_replace(lower(btrim(t.trainer_name)), '^(\[[^]]+\][[:space:]]*)+', '')
          union all
          select roster.discord_id, 1 as source_order
            from public.staff_roster roster
           where regexp_replace(lower(btrim(roster.discord_username)), '^(\[[^]]+\][[:space:]]*)+', '') = regexp_replace(lower(btrim(t.trainer_name)), '^(\[[^]]+\][[:space:]]*)+', '')
        ) candidate
       where case when candidate.discord_id ~ '^[0-9]{1,19}$'
         then candidate.discord_id::numeric between 1 and 9223372036854775807
         else false end
       order by candidate.source_order
       limit 1$new$
    );

    if v_updated = v_definition then
      raise exception 'Could not update the feedback trainer lookup in archive_session_conclusion';
    end if;
    execute v_updated;
  elsif position('profile.discord_server_name' in v_definition) = 0
     or position('public.staff_roster roster' in v_definition) = 0 then
    raise exception 'archive_session_conclusion has an unexpected trainer lookup; no data was changed';
  end if;
end;
$migration$;

-- Recover existing null trainer IDs where the same archived trainee already
-- has a trainer ID in session_full_logs. One set-based update avoids row loops.
with trainer_by_trainee as (
  select distinct on (session_id, trainee_id)
         session_id, trainee_id, trainer_id
    from public.session_full_logs
   where trainer_id is not null
   order by session_id, trainee_id, log_id desc
)
update public.session_feedback_logs feedback
   set trainer_id = trainer_by_trainee.trainer_id
  from trainer_by_trainee
 where feedback.trainer_id is null
   and feedback.session_id = trainer_by_trainee.session_id
   and feedback.trainee_id = trainer_by_trainee.trainee_id;

commit;

-- Verify:
-- select session_id, trainee_id, trainer_id
--   from public.session_feedback_logs
--  order by log_id desc
--  limit 50;
