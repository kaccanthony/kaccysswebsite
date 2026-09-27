-- Apply before deploying the conclude route. The archive writes only columns
-- present in current_db.sql; session slot numbers are intentionally not stored
-- in session_full_logs. The archive RPC batches trainee-cache refreshes and
-- records the authenticated actor as a fallback trainer identity.
-- Rollback: restore the prior app/RPC. The trainee_assessed column is dropped
-- permanently by request, so its old values cannot be recovered.

begin;

alter table public.session_post_logs
  add column if not exists session_time text,
  add column if not exists additional_slots_provided smallint,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz;

alter table public.session_full_logs
  drop column if exists trainee_assessed;

alter table public.session_full_logs
  alter column trainee_id drop not null,
  alter column trainee_roblox drop not null,
  alter column trainee_zone drop not null,
  alter column trainee_attendance drop not null,
  alter column trainer_id drop not null,
  alter column trainee_feedback drop not null,
  alter column feedback_sent drop not null;

-- Live assignments allow unknown identities and zone. An archive
-- must preserve that absence, not invent a Discord ID or score of zero.
alter table public.session_feedback_logs
  alter column trainee_id drop not null;

create index if not exists session_full_logs_session_id_idx
  on public.session_full_logs (session_id);
create index if not exists session_feedback_logs_session_id_idx
  on public.session_feedback_logs (session_id);
create index if not exists session_trainees_session_id_idx
  on public.session_trainees (session_id);
create index if not exists session_staff_session_id_idx
  on public.session_staff (session_id);
create index if not exists session_drivers_session_id_idx
  on public.session_drivers (session_id);
create index if not exists profiles_discord_username_lower_idx
  on public.profiles (lower(discord_username));
create index if not exists known_trainees_discord_id_idx
  on public.known_trainees (discord_id);
create index if not exists known_trainees_discord_username_lower_idx
  on public.known_trainees (lower(discord_username));

-- Refresh all session trainees with two set-based statements in one RPC call.
-- A transaction advisory lock prevents concurrent session endings from adding
-- duplicate cache rows while the table has no unique constraint.
create or replace function public.upsert_known_trainees_batch(p_entries jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $function$
begin
  perform pg_advisory_xact_lock(hashtext('public.known_trainees'));

  with parsed as (
    select nullif(btrim(entry->>'discordId'), '') as discord_id,
           nullif(btrim(entry->>'discordUsername'), '') as discord_username,
           nullif(btrim(entry->>'robloxUsername'), '') as roblox_username
      from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) as input_entries(entry)
  ), entries as (
    select distinct on (coalesce('name:' || lower(discord_username), 'id:' || discord_id))
           discord_id, discord_username, roblox_username
      from parsed
     where discord_id is not null or discord_username is not null
     order by coalesce('name:' || lower(discord_username), 'id:' || discord_id),
              (discord_username is not null) desc, (roblox_username is not null) desc
  ), matches as (
    select entry.*,
           existing.row_id
      from entries entry
      left join lateral (
        select known.row_id
          from public.known_trainees known
         where (entry.discord_id is not null and known.discord_id = entry.discord_id)
            or (entry.discord_username is not null and lower(known.discord_username) = lower(entry.discord_username))
         order by case when entry.discord_id is not null and known.discord_id = entry.discord_id then 0 else 1 end,
                  known.row_id
         limit 1
      ) existing on true
  )
  update public.known_trainees known
     set discord_id = coalesce(matches.discord_id, known.discord_id),
         discord_username = coalesce(matches.discord_username, known.discord_username),
         roblox_username = coalesce(matches.roblox_username, known.roblox_username),
         last_seen_at = clock_timestamp()
    from matches
   where matches.row_id = known.row_id;

  with parsed as (
    select nullif(btrim(entry->>'discordId'), '') as discord_id,
           nullif(btrim(entry->>'discordUsername'), '') as discord_username,
           nullif(btrim(entry->>'robloxUsername'), '') as roblox_username
      from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) as input_entries(entry)
  ), entries as (
    select distinct on (coalesce('name:' || lower(discord_username), 'id:' || discord_id))
           discord_id, discord_username, roblox_username
      from parsed
     where discord_id is not null or discord_username is not null
     order by coalesce('name:' || lower(discord_username), 'id:' || discord_id),
              (discord_username is not null) desc, (roblox_username is not null) desc
  )
  insert into public.known_trainees
    (discord_id, discord_username, roblox_username, created_at, last_seen_at)
  select entry.discord_id, coalesce(entry.discord_username, ''), entry.roblox_username,
         clock_timestamp(), clock_timestamp()
    from entries entry
   where not exists (
     select 1
       from public.known_trainees known
      where (entry.discord_id is not null and known.discord_id = entry.discord_id)
         or (entry.discord_username is not null and lower(known.discord_username) = lower(entry.discord_username))
   );
end;
$function$;

revoke all on function public.upsert_known_trainees_batch(jsonb) from public, anon;
grant execute on function public.upsert_known_trainees_batch(jsonb) to authenticated, service_role;

drop function if exists public.archive_session_conclusion(integer);
create or replace function public.archive_session_conclusion(
  p_session_id integer,
  p_actor_discord_id bigint
)
returns void
language plpgsql
security invoker
set search_path = public
as $function$
declare
  s public.session_ongoing%rowtype;
  v_ended_at timestamptz := clock_timestamp();
  v_host text;
  v_known_entries jsonb;
begin
  select * into s
    from public.session_ongoing
   where session_id = p_session_id
   for update;
  if not found then
    raise exception 'Ongoing session % was not found', p_session_id;
  end if;
  if exists (select 1 from public.session_post_logs where session_id = p_session_id) then
    raise exception 'Session % is already archived', p_session_id;
  end if;

  select staff_name into v_host
    from public.session_staff
   where session_id = p_session_id and (role = 'HOST' or role like 'HOST,%')
   order by case when role = 'HOST' then 0 else 1 end, staff_row_id
   limit 1;
  if nullif(btrim(v_host), '') is null then
    raise exception 'Session % has no host assignment', p_session_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'discordId', trainee.discord_id,
           'discordUsername', trainee.discord_username,
           'robloxUsername', trainee.roblox_username
         )), '[]'::jsonb)
    into v_known_entries
    from (
      select t.trainee_discord_id::text as discord_id,
             nullif(btrim(t.trainee_discord), '') as discord_username,
             nullif(btrim(t.trainee_roblox_username), '') as roblox_username
        from public.session_trainees t
       where t.session_id = p_session_id
      union all
      select nullif(u.data->>'discordId', ''),
             nullif(btrim(u.data->>'discord'), ''),
             nullif(btrim(u.data->>'roblox'), '')
        from jsonb_array_elements(
          case when jsonb_typeof(s.live_state->'unallocatedTrainees') = 'array'
            then s.live_state->'unallocatedTrainees' else '[]'::jsonb end
        ) as u(data)
    ) trainee
   where trainee.discord_id is not null or trainee.discord_username is not null;

  perform public.upsert_known_trainees_batch(v_known_entries);

  insert into public.session_post_logs (
    session_id, session_name, session_desc, session_status, session_date,
    session_time, session_duration_expected, session_runtime_actual,
    num_slots, actual_slots_provided, additional_slots_provided,
    additional_notes, main_ast_notes, started, ended,
    started_at, ended_at, concluded_at
  )
  select s.session_id, s.session_name, s.session_desc, s.session_status, s.session_date,
         s.session_time, s.session_duration,
         case when s.started_at is null then null
              else greatest(0, floor(extract(epoch from v_ended_at - s.started_at)))::integer end,
         s.num_slots,
         (select count(*) from public.session_trainees t
           where t.session_id = p_session_id and not t.is_standby),
         (select count(*) from public.session_trainees t
           where t.session_id = p_session_id and t.is_standby),
         s.additional_notes, s.live_state->>'mainAstNotes',
         (s.started_at at time zone 'UTC')::time,
         (v_ended_at at time zone 'UTC')::time,
         s.started_at, v_ended_at, v_ended_at;

  insert into public.session_staff_logs (
    session_id, host, cohost_1, cohost_2, cohost_3, cohost_4_supervisor,
    assistant_1, assistant_2, assistant_3, assistant_4, full_staff_json
  )
  select p_session_id, v_host,
         max(staff_name) filter (where role = 'CH_1' or role like 'CH_1,%'),
         max(staff_name) filter (where role = 'CH_2' or role like 'CH_2,%'),
         max(staff_name) filter (where role = 'CH_3' or role like 'CH_3,%'),
         max(staff_name) filter (where role = 'CH_4' or role like 'CH_4,%'),
         max(staff_name) filter (where role = 'AST_1' or role like 'AST_1,%'),
         max(staff_name) filter (where role = 'AST_2' or role like 'AST_2,%'),
         max(staff_name) filter (where role = 'AST_3' or role like 'AST_3,%'),
         max(staff_name) filter (where role = 'AST_4' or role like 'AST_4,%'),
         coalesce(jsonb_agg(to_jsonb(st) order by st.staff_row_id)
           filter (where st.staff_row_id is not null), '[]'::jsonb)
    from public.session_staff st
   where st.session_id = p_session_id;

  -- One set-based insert each. Missing identities remain null; IDs stay bigint.
  insert into public.session_full_logs (
    session_id, trainee_id, trainee_roblox, trainee_zone, trainee_attendance, trainer_id,
    trainee_notes, staff_notes, trainee_feedback, feedback_sent
  )
  select p_session_id, t.trainee_discord_id,
         coalesce(t.trainee_roblox_username, ''), coalesce(t.zone, 0), t.attended,
         coalesce(case when p.discord_id ~ '^[0-9]{1,19}$'
              then case when p.discord_id::numeric between 1 and 9223372036854775807
                then p.discord_id::bigint end end, p_actor_discord_id),
         t.note, null,
         case when exists (
           select 1 from jsonb_each_text(
             case when jsonb_typeof(s.live_state->'feedbackData'->((t.slot_number - 1)::text)) = 'object'
               then s.live_state->'feedbackData'->((t.slot_number - 1)::text)
               else '{}'::jsonb end
           ) as field(key, value)
           where nullif(btrim(field.value), '') is not null
         ) or (s.live_state->'timers'->((t.slot_number - 1)::text)) ? 'setupSeconds'
           then true else false end,
         null
    from public.session_trainees t
    left join lateral (
      select candidate.discord_id
        from (
          select profile.discord_id, 0 as source_order
            from public.profiles profile
           where lower(btrim(profile.discord_username)) = regexp_replace(lower(btrim(t.trainer_name)), '^(\[[^]]+\][[:space:]]*)+', '')
              or lower(btrim(profile.roblox_username)) = regexp_replace(lower(btrim(t.trainer_name)), '^(\[[^]]+\][[:space:]]*)+', '')
          union all
          select roster.discord_id, 1 as source_order
            from public.staff_roster roster
           where lower(btrim(roster.discord_username)) = regexp_replace(lower(btrim(t.trainer_name)), '^(\[[^]]+\][[:space:]]*)+', '')
        ) candidate
       where case when candidate.discord_id ~ '^[0-9]{1,19}$'
         then candidate.discord_id::numeric between 1 and 9223372036854775807
         else false end
       order by candidate.source_order
       limit 1
    ) p on true
   where t.session_id = p_session_id
     and (nullif(btrim(t.trainee_discord), '') is not null
       or nullif(btrim(t.trainee_roblox_username), '') is not null
       or t.trainee_discord_id is not null);

  -- Unallocated trainees participate in the live report but have no child
  -- table row. Preserve them before live_state is removed.
  insert into public.session_full_logs (
    session_id, trainee_id, trainee_roblox, trainee_zone, trainee_attendance,
    trainer_id, trainee_notes, staff_notes, trainee_feedback, feedback_sent
  )
  select p_session_id,
         case when u.data->>'discordId' ~ '^[0-9]{1,19}$'
              then case when (u.data->>'discordId')::numeric between 1 and 9223372036854775807
                then (u.data->>'discordId')::bigint end end,
         coalesce(nullif(u.data->>'roblox', ''), ''),
         case when regexp_replace(coalesce(u.data->>'zone', ''), '^Zone ', '', 'i') ~ '^[0-9]{1,5}$'
              then case when regexp_replace(u.data->>'zone', '^Zone ', '', 'i')::numeric <= 32767
                then regexp_replace(u.data->>'zone', '^Zone ', '', 'i')::smallint else 0 end else 0 end,
         false,
         coalesce(case when p.discord_id ~ '^[0-9]{1,19}$'
              then case when p.discord_id::numeric between 1 and 9223372036854775807
                then p.discord_id::bigint end end, p_actor_discord_id),
         nullif(u.data->>'notes', ''), null, false, false
    from jsonb_array_elements(
      case when jsonb_typeof(s.live_state->'unallocatedTrainees') = 'array'
        then s.live_state->'unallocatedTrainees' else '[]'::jsonb end
    ) as u(data)
    left join lateral (
      select candidate.discord_id
        from (
          select profile.discord_id, 0 as source_order
            from public.profiles profile
           where lower(btrim(profile.discord_username)) = regexp_replace(lower(btrim(u.data->>'trainerName')), '^(\[[^]]+\][[:space:]]*)+', '')
              or lower(btrim(profile.roblox_username)) = regexp_replace(lower(btrim(u.data->>'trainerName')), '^(\[[^]]+\][[:space:]]*)+', '')
          union all
          select roster.discord_id, 1 as source_order
            from public.staff_roster roster
           where lower(btrim(roster.discord_username)) = regexp_replace(lower(btrim(u.data->>'trainerName')), '^(\[[^]]+\][[:space:]]*)+', '')
        ) candidate
       where case when candidate.discord_id ~ '^[0-9]{1,19}$'
         then candidate.discord_id::numeric between 1 and 9223372036854775807
         else false end
       order by candidate.source_order
       limit 1
    ) p on true
   where nullif(btrim(u.data->>'roblox'), '') is not null
      or nullif(btrim(u.data->>'discordId'), '') is not null;

  insert into public.session_feedback_logs (
    session_id, trainee_id, trainer_id, trains, setup, conflict, priority,
    rbtiming, overall, notes, setup_seconds, created_at, updated_at
  )
  select p_session_id, t.trainee_discord_id,
         case when p.discord_id ~ '^[0-9]{1,19}$'
              then case when p.discord_id::numeric between 1 and 9223372036854775807
                then p.discord_id::bigint end end,
         case when fb.data->>'trains' ~ '^[0-9]{1,5}$'
              then case when (fb.data->>'trains')::numeric <= 32767
                then (fb.data->>'trains')::smallint end end,
         nullif(fb.data->>'setup', ''), nullif(fb.data->>'conflict', ''),
         nullif(fb.data->>'priority', ''), nullif(fb.data->>'rbtiming', ''),
         nullif(fb.data->>'overall', ''), nullif(fb.data->>'notes', ''),
         case when timer.data->>'setupSeconds' ~ '^[0-9]{1,10}$'
              then case when (timer.data->>'setupSeconds')::numeric <= 2147483647
                then (timer.data->>'setupSeconds')::integer end end,
         v_ended_at, v_ended_at
    from public.session_trainees t
    left join lateral (
      select candidate.discord_id
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
       limit 1
    ) p on true
    cross join lateral (
      select case when jsonb_typeof(s.live_state->'feedbackData'->((t.slot_number - 1)::text)) = 'object'
        then s.live_state->'feedbackData'->((t.slot_number - 1)::text)
        else '{}'::jsonb end as data
    ) fb
    cross join lateral (
      select case when jsonb_typeof(s.live_state->'timers'->((t.slot_number - 1)::text)) = 'object'
        then s.live_state->'timers'->((t.slot_number - 1)::text)
        else '{}'::jsonb end as data
    ) timer
   where t.session_id = p_session_id
     and (nullif(btrim(t.trainee_discord), '') is not null
       or nullif(btrim(t.trainee_roblox_username), '') is not null
       or t.trainee_discord_id is not null)
     and (exists (
       select 1 from jsonb_each_text(fb.data) as field(key, value)
        where nullif(btrim(field.value), '') is not null
     ) or timer.data ? 'setupSeconds');

  insert into public.session_driver_logs
    (session_id, discord_username, roblox_name, attendance)
  select p_session_id, discord_username, roblox_username, attended
    from public.session_drivers
   where session_id = p_session_id;

  delete from public.session_bell_state where session_id = p_session_id;
  delete from public.session_drivers where session_id = p_session_id;
  delete from public.session_trainees where session_id = p_session_id;
  delete from public.session_staff where session_id = p_session_id;
  delete from public.session_ongoing where session_id = p_session_id;
end;
$function$;

-- Keep the previous RPC signature available during the application rollout.
create or replace function public.archive_session_conclusion(p_session_id integer)
returns void
language sql
security invoker
set search_path = public
as $function$
  select public.archive_session_conclusion(p_session_id, null::bigint);
$function$;

revoke all on function public.archive_session_conclusion(integer) from public, anon, authenticated;
grant execute on function public.archive_session_conclusion(integer) to service_role;
revoke all on function public.archive_session_conclusion(integer, bigint) from public, anon, authenticated;
grant execute on function public.archive_session_conclusion(integer, bigint) to service_role;

-- Recover older summaries when the previous RPC left session_trainees behind.
-- Existing full logs are never replaced. Missing live_state/started_at cannot
-- be reconstructed from child rows, so those values remain unknown.
update public.session_post_logs p
   set actual_slots_provided = coalesce(p.actual_slots_provided, (
         select count(*) from public.session_trainees t
          where t.session_id = p.session_id and not t.is_standby
       )),
       additional_slots_provided = coalesce(p.additional_slots_provided, (
         select count(*) from public.session_trainees t
          where t.session_id = p.session_id and t.is_standby
       ))
 where exists (select 1 from public.session_trainees t where t.session_id = p.session_id)
   and (p.actual_slots_provided is null or p.additional_slots_provided is null);

  insert into public.session_full_logs (
    session_id, trainee_id, trainee_roblox, trainee_zone, trainee_attendance,
    trainer_id, trainee_notes, staff_notes, trainee_feedback, feedback_sent
)
select t.session_id, t.trainee_discord_id,
       coalesce(t.trainee_roblox_username, ''), coalesce(t.zone, 0), t.attended,
       coalesce(case when p.discord_id ~ '^[0-9]{1,19}$'
            then case when p.discord_id::numeric between 1 and 9223372036854775807
              then p.discord_id::bigint end end, null),
       t.note, null, false, false
  from public.session_trainees t
  join public.session_post_logs archived on archived.session_id = t.session_id
  left join lateral (
    select discord_id from public.profiles
     where lower(discord_username) = lower(t.trainer_name)
     order by id limit 1
  ) p on true
 where not exists (
   select 1 from public.session_full_logs existing
    where existing.session_id = t.session_id
 )
   and (nullif(btrim(t.trainee_discord), '') is not null
     or nullif(btrim(t.trainee_roblox_username), '') is not null
     or t.trainee_discord_id is not null);

commit;

-- Deployment verification (read-only after running the migration):
-- select routine_name from information_schema.routines
--  where routine_schema = 'public' and routine_name = 'archive_session_conclusion';
-- select column_name, is_nullable from information_schema.columns
--  where table_schema = 'public' and table_name = 'session_full_logs'
--  order by ordinal_position;
-- select p.session_id, p.actual_slots_provided, p.additional_slots_provided,
--        count(f.log_id) as archived_trainees
--   from public.session_post_logs p
--   left join public.session_full_logs f on f.session_id = p.session_id
--  group by p.session_id, p.actual_slots_provided, p.additional_slots_provided;
