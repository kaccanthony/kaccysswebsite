-- Deploy before application code. Both functions run with caller privileges.
-- Rollback: restore callers first, then drop these two functions.

create or replace function public.delete_upcoming_session(p_session_id integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  delete from public.session_staff where session_id = p_session_id;
  delete from public.session_trainees where session_id = p_session_id;
  delete from public.session_upcoming where session_id = p_session_id;
end;
$function$;

create or replace function public.replace_session_children(
  p_session_id integer,
  p_staff jsonb,
  p_trainees jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  delete from public.session_staff where session_id = p_session_id;
  insert into public.session_staff (session_id, role, staff_name, attended, notes)
  select p_session_id, row.role, row.staff_name, row.attended, row.notes
    from jsonb_to_recordset(p_staff) as row(role text, staff_name text, attended boolean, notes text);

  delete from public.session_trainees where session_id = p_session_id;
  insert into public.session_trainees (
    session_id, slot_number, is_standby, trainee_roblox_username,
    trainee_discord, trainee_discord_id, zone, note, trainer_name, attended
  )
  select p_session_id, row.slot_number, row.is_standby, row.trainee_roblox_username,
         row.trainee_discord, row.trainee_discord_id, row.zone, row.note,
         row.trainer_name, row.attended
    from jsonb_to_recordset(p_trainees) as row(
      slot_number smallint, is_standby boolean, trainee_roblox_username text,
      trainee_discord text, trainee_discord_id bigint, zone smallint,
      note text, trainer_name text, attended boolean
    );
end;
$function$;

create or replace function public.upsert_known_trainees_batch(p_entries jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  entry jsonb;
  existing_id integer;
  entry_discord_id text;
  entry_discord_username text;
  entry_roblox_username text;
begin
  for entry in select value from jsonb_array_elements(p_entries) loop
    entry_discord_id := nullif(entry->>'discordId', '');
    entry_discord_username := coalesce(entry->>'discordUsername', '');
    entry_roblox_username := entry->>'robloxUsername';
    if entry_discord_id is null and entry_discord_username = '' then
      continue;
    end if;

    begin
    existing_id := null;
    if entry_discord_id is not null then
      select row_id into existing_id from public.known_trainees
       where known_trainees.discord_id = entry_discord_id limit 1;
    else
      select row_id into existing_id from public.known_trainees
       where known_trainees.discord_username ilike entry_discord_username limit 1;
    end if;

    if existing_id is not null then
      update public.known_trainees as known
         set discord_username = entry_discord_username,
             roblox_username = entry_roblox_username,
             discord_id = coalesce(entry_discord_id, known.discord_id),
             last_seen_at = clock_timestamp()
       where row_id = existing_id;
    else
      insert into public.known_trainees (discord_id, discord_username, roblox_username, last_seen_at)
      values (entry_discord_id, entry_discord_username, entry_roblox_username, clock_timestamp());
    end if;
    exception when others then
      -- Individual cache errors did not interrupt the original save flow.
      null;
    end;
  end loop;
end;
$function$;

revoke all on function public.delete_upcoming_session(integer) from public;
revoke all on function public.replace_session_children(integer, jsonb, jsonb) from public;
revoke all on function public.upsert_known_trainees_batch(jsonb) from public;

grant execute on function public.delete_upcoming_session(integer) to authenticated;
grant execute on function public.replace_session_children(integer, jsonb, jsonb) to authenticated;
grant execute on function public.upsert_known_trainees_batch(jsonb) to authenticated;
