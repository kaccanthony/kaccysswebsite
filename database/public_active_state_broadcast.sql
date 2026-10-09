-- Run after event_panel.sql. Broadcast only row IDs to the public /active page;
-- private session, trainee, and event columns remain protected by RLS.
create or replace function public.broadcast_public_active_state()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  changed_session_id integer;
begin
  if tg_table_name = 'event_runs' then
    if tg_op = 'INSERT' then
      if new.status = 'running' then
        perform realtime.send('{}'::jsonb, 'activity-changed', 'public-active-state', false);
      end if;
    elsif tg_op = 'DELETE' then
      if old.status = 'running' then
        perform realtime.send('{}'::jsonb, 'activity-changed', 'public-active-state', false);
      end if;
    elsif new.status is distinct from old.status or new.event_name is distinct from old.event_name then
      perform realtime.send('{}'::jsonb, 'activity-changed', 'public-active-state', false);
    end if;
  else
    if tg_op = 'DELETE' then
      changed_session_id := old.session_id;
    else
      changed_session_id := new.session_id;
    end if;
    perform realtime.send(
      jsonb_build_object('session_id', changed_session_id),
      'changed', 'public-active-state', false
    );
    if tg_table_name = 'session_ongoing' then
      if tg_op <> 'UPDATE' then
        perform realtime.send('{}'::jsonb, 'activity-changed', 'public-active-state', false);
      elsif new.session_name is distinct from old.session_name then
        perform realtime.send('{}'::jsonb, 'activity-changed', 'public-active-state', false);
      end if;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists public_active_session_changed on public.session_ongoing;
create trigger public_active_session_changed
after insert or update or delete on public.session_ongoing
for each row execute function public.broadcast_public_active_state();

drop trigger if exists public_active_trainee_changed on public.session_trainees;
create trigger public_active_trainee_changed
after insert or update or delete on public.session_trainees
for each row execute function public.broadcast_public_active_state();

drop trigger if exists public_active_event_changed on public.event_runs;
create trigger public_active_event_changed
after insert or update or delete on public.event_runs
for each row execute function public.broadcast_public_active_state();
