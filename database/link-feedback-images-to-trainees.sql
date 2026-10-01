  -- Apply after for-feedback-r2-bucket.sql and archive_session_conclusion.sql.
  -- Reapply after reinstalling archive_session_conclusion.sql, which replaces
  -- the archive RPC body.
  -- Re-runnable. Live row IDs and identity snapshots prevent slot reuse from
  -- assigning an image to a different trainee. Archived feedback log IDs are
  -- the permanent relationship after session_trainees is deleted.
  -- Rollback: restore the previous archive RPC definition and drop these
  -- triggers/functions/columns only after exporting any existing links.
  begin;

  alter table public.feedback_images
    add column if not exists trainee_row_id integer,
    add column if not exists trainee_discord_id bigint,
    add column if not exists trainee_discord text,
    add column if not exists trainee_roblox_username text,
    add column if not exists feedback_log_id integer;

  alter table public.session_feedback_logs
    add column if not exists slot_number smallint;

  -- Capture exact bigint IDs inside PostgreSQL; JavaScript numbers cannot safely
  -- round-trip Discord snowflakes. Existing slot-only images stay unlinked:
  -- a slot may have been reused, so assigning them automatically is unsafe.

  do $migration$
  begin
    if not exists (
      select 1 from pg_constraint
      where conname = 'feedback_images_feedback_log_id_fkey'
        and conrelid = 'public.feedback_images'::regclass
    ) then
      alter table public.feedback_images
        add constraint feedback_images_feedback_log_id_fkey
        foreign key (feedback_log_id)
        references public.session_feedback_logs(log_id)
        on delete set null not valid;
    end if;
  end;
  $migration$;

  create index if not exists feedback_images_feedback_log_idx
    on public.feedback_images (feedback_log_id) where feedback_log_id is not null;
  create unique index if not exists session_feedback_logs_session_slot_idx
    on public.session_feedback_logs (session_id, slot_number)
    where slot_number is not null;

  create or replace function public.capture_feedback_image_trainee()
  returns trigger language plpgsql security invoker set search_path = public
  as $function$
  declare
    v_trainee public.session_trainees%rowtype;
  begin
    select * into v_trainee
      from public.session_trainees
    where session_id = new.session_id and slot_number = new.slot_number;
    if not found then
      raise exception 'Trainee slot not found for feedback image';
    end if;
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

  drop trigger if exists feedback_images_capture_trainee on public.feedback_images;
  create trigger feedback_images_capture_trainee
  before insert on public.feedback_images
  for each row execute function public.capture_feedback_image_trainee();

  create or replace function public.feedback_image_matches_trainee(
    p_image public.feedback_images, p_trainee public.session_trainees
  )
  returns boolean language sql stable security invoker set search_path = public
  as $function$
    select (p_image).session_id = (p_trainee).session_id
      and (p_image).slot_number = (p_trainee).slot_number
      and (p_image).trainee_row_id = (p_trainee).trainee_row_id
      and case
        when (p_image).trainee_discord_id is not null
          then (p_image).trainee_discord_id = (p_trainee).trainee_discord_id
        when nullif(btrim((p_image).trainee_discord), '') is not null
          then lower(btrim((p_image).trainee_discord)) = lower(btrim((p_trainee).trainee_discord))
        else nullif(lower(btrim((p_image).trainee_roblox_username)), '') =
              nullif(lower(btrim((p_trainee).trainee_roblox_username)), '')
      end;
  $function$;

  create or replace function public.attach_feedback_images_to_log()
  returns trigger language plpgsql security invoker set search_path = public
  as $function$
  begin
    if new.slot_number is null then return new; end if;
    update public.feedback_images i
      set feedback_log_id = new.log_id
      from public.session_trainees t
    where t.session_id = new.session_id
      and t.slot_number = new.slot_number
      and i.status = 'ready'
      and i.feedback_log_id is null
      and public.feedback_image_matches_trainee(i, t);
    return new;
  end;
  $function$;

  drop trigger if exists session_feedback_logs_attach_images on public.session_feedback_logs;
  create trigger session_feedback_logs_attach_images
  after insert on public.session_feedback_logs
  for each row execute function public.attach_feedback_images_to_log();

  -- Patch the installed archive RPC in place, preserving independent patches
  -- such as feedback-trainer-id.sql and post-sesh-summary.sql.
  do $migration$
  declare
    v_definition text;
    v_updated text;
  begin
    if to_regprocedure('public.archive_session_conclusion(integer,bigint)') is null then
      raise exception 'Apply archive_session_conclusion.sql before this migration';
    end if;
    select pg_get_functiondef('public.archive_session_conclusion(integer,bigint)'::regprocedure)
      into v_definition;
    v_definition := replace(v_definition, chr(13) || chr(10), chr(10));
    if position('session_id, slot_number, trainee_id, trainer_id, trains' in v_definition) > 0 then
      if position('public.feedback_image_matches_trainee(i, t)' in v_definition) = 0 then
        raise exception 'Archive RPC has a partial image linkage; inspect it before retrying';
      end if;
      return;
    end if;

    if position('session_id, trainee_id, trainer_id, trains, setup, conflict, priority,' in v_definition) = 0
      or position('select p_session_id, t.trainee_discord_id,' || chr(10) || '         case when p.discord_id' in v_definition) = 0
      or position('or timer.data ? ''setupSeconds'');' in v_definition) = 0 then
      raise exception 'Archive RPC format is unexpected; no schema or function changes were saved';
    end if;

    v_updated := replace(v_definition,
      'session_id, trainee_id, trainer_id, trains, setup, conflict, priority,',
      'session_id, slot_number, trainee_id, trainer_id, trains, setup, conflict, priority,');
    v_updated := replace(v_updated,
      'select p_session_id, t.trainee_discord_id,' || chr(10) || '         case when p.discord_id',
      'select p_session_id, t.slot_number, t.trainee_discord_id,' || chr(10) || '         case when p.discord_id');
    v_updated := replace(v_updated,
      'or timer.data ? ''setupSeconds'');',
      $old$or timer.data ? 'setupSeconds'
        or exists (
          select 1 from public.feedback_images i
            where i.status = 'ready'
              and public.feedback_image_matches_trainee(i, t)
        ));$old$);
    execute v_updated;
  end;
  $migration$;

  commit;

  -- Verify after applying:
  -- select count(*) from public.feedback_images where status = 'ready' and trainee_row_id is null;
  -- select id, session_id, slot_number, file_name from public.feedback_images
  --  where status = 'ready' and trainee_row_id is null order by created_at;
  -- select count(*) from public.feedback_images where feedback_log_id is not null;
  -- select session_id, slot_number, log_id from public.session_feedback_logs
  --  where slot_number is not null order by log_id desc limit 20;
