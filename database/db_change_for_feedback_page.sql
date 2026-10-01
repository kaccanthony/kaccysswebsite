-- Run after for-feedback-r2-bucket.sql and link-feedback-images-to-trainees.sql.
-- Standalone feedback has no session trainee row. Session feedback retains its
-- existing session/slot links. Images for either kind use feedback_log_id.
begin;

alter table public.session_feedback_logs
  add column if not exists feedback_origin text not null default 'session',
  add column if not exists trainee_name text;
alter table public.session_feedback_logs
  alter column session_id drop not null,
  alter column trainee_id drop not null;
alter table public.session_feedback_logs
  drop constraint if exists session_feedback_logs_origin_check;
alter table public.session_feedback_logs
  add constraint session_feedback_logs_origin_check check (
    (feedback_origin = 'session' and session_id is not null)
    or (feedback_origin = 'standalone' and session_id is null and slot_number is null
        and nullif(btrim(trainee_name), '') is not null)
  );

alter table public.feedback_images
  alter column session_id drop not null,
  alter column slot_number drop not null;
alter table public.feedback_images
  drop constraint if exists feedback_images_context_check;
alter table public.feedback_images
  add constraint feedback_images_context_check check (
    (session_id is not null and slot_number is not null)
    or feedback_log_id is not null
  );
create unique index if not exists feedback_images_log_position_idx
  on public.feedback_images (feedback_log_id, position)
  where feedback_log_id is not null;

-- The live upload trigger still captures a trainee from session_id + slot_number.
-- A log-linked upload has already selected its feedback entry and skips that lookup.
create or replace function public.capture_feedback_image_trainee()
returns trigger language plpgsql security invoker set search_path = public
as $function$
declare
  v_trainee public.session_trainees%rowtype;
begin
  if new.feedback_log_id is not null then return new; end if;
  select * into v_trainee from public.session_trainees
    where session_id = new.session_id and slot_number = new.slot_number;
  if not found then raise exception 'Trainee slot not found for feedback image'; end if;
  if v_trainee.trainee_discord_id is null
     and nullif(btrim(v_trainee.trainee_discord), '') is null
     and nullif(btrim(v_trainee.trainee_roblox_username), '') is null then
    raise exception 'Select a trainee before uploading feedback images';
  end if;
  if new.trainee_row_id is not null and new.trainee_row_id <> v_trainee.trainee_row_id then
    raise exception 'Feedback image trainee does not match this slot';
  end if;
  new.trainee_row_id := v_trainee.trainee_row_id;
  new.trainee_discord_id := v_trainee.trainee_discord_id;
  new.trainee_discord := nullif(btrim(v_trainee.trainee_discord), '');
  new.trainee_roblox_username := nullif(btrim(v_trainee.trainee_roblox_username), '');
  return new;
end;
$function$;

-- slot_number remains necessary for live-session identity capture and archive
-- linking; it is not an R2 object index. position controls display order and
-- the ten-image cap, including log-linked standalone uploads.
commit;
