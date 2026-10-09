CREATE TABLE public.staff_roster (
  discord_id text NOT NULL,
  discord_username text NOT NULL,
  staff_rank text NOT NULL,
  staff_joined date NOT NULL,
  op_dept boolean NOT NULL,
  host_auth boolean NOT NULL,
  cohost_auth boolean NOT NULL,
  asst_auth boolean NOT NULL,
  comm_dept boolean NOT NULL,
  eventh_auth boolean NOT NULL,
  eventch_auth boolean NOT NULL,
  ih_auth boolean NOT NULL,
  staff_perm_level smallint NOT NULL,
  claimed boolean NOT NULL,
  claimed_at timestamp with time zone
);

CREATE TABLE public.known_trainees (
  row_id integer NOT NULL,
  discord_id text,
  discord_username text NOT NULL,
  roblox_username text,
  created_at timestamp with time zone NOT NULL,
  last_seen_at timestamp with time zone NOT NULL
);

CREATE TABLE public.session_staff (
  staff_row_id integer NOT NULL,
  session_id integer NOT NULL,
  role text NOT NULL,
  staff_name text NOT NULL,
  attended boolean NOT NULL,
  notes text
);

CREATE TABLE public.session_ongoing (
  session_id integer NOT NULL,
  session_status character varying NOT NULL,
  session_name character varying,
  session_desc text,
  session_duration character varying NOT NULL,
  num_slots smallint NOT NULL,
  trainer_assignment_mode character varying NOT NULL,
  session_date date NOT NULL,
  session_time character varying NOT NULL,
  started_at timestamp with time zone,
  additional_notes text,
  live_state jsonb,
  last_updated timestamp with time zone,
  trainee_timer smallint NOT NULL
);

CREATE TABLE public.site_scripts_history (
  history_id bigint NOT NULL,
  script_key text NOT NULL,
  content text NOT NULL,
  saved_at timestamp with time zone NOT NULL,
  saved_by uuid
);

CREATE TABLE public.site_scripts (
  script_key text NOT NULL,
  label text NOT NULL,
  content text NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  updated_by uuid
);

CREATE TABLE public.notifications (
  notif_id integer NOT NULL,
  category character varying NOT NULL,
  title character varying NOT NULL,
  description text NOT NULL,
  posted_by uuid,
  posted_at timestamp with time zone NOT NULL,
  audience_type text NOT NULL,
  audience_rank text,
  audience_department text
);

CREATE TABLE public.staff_archived (
  staff_id bigint NOT NULL,
  staff_name character varying NOT NULL,
  staff_display_name character varying NOT NULL,
  staff_roblox_name character varying NOT NULL,
  staff_roblox_id bigint,
  staff_nationality character varying,
  staff_rank character varying NOT NULL,
  staff_days integer NOT NULL,
  staff_num_sesh_attend integer NOT NULL,
  hide_stats boolean NOT NULL,
  archived_at timestamp with time zone NOT NULL
);

CREATE TABLE public.session_bell_state (
  session_id integer NOT NULL,
  active boolean NOT NULL,
  initiator_role text,
  initiator_client text,
  acks jsonb NOT NULL,
  ring_started_at timestamp with time zone,
  last_ring_at timestamp with time zone,
  ring_count smallint NOT NULL,
  cooldown_until timestamp with time zone,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.staff_quota (
  quota_id character varying NOT NULL,
  profile_id uuid NOT NULL,
  quota_level smallint NOT NULL,
  quota_period character varying NOT NULL,
  quota_assist smallint NOT NULL,
  quota_co_host smallint NOT NULL,
  quota_session_host smallint NOT NULL,
  quota_event_host smallint NOT NULL,
  quota_event_co_host smallint NOT NULL,
  quota_remark text,
  quota_exemption boolean NOT NULL
);

CREATE TABLE public.staff_timeline (
  profile_id uuid NOT NULL,
  days_as_staff integer NOT NULL,
  staff_nationality character varying,
  assist_auth_start date NOT NULL,
  assist_auth_end date NOT NULL,
  cohost_auth_start date,
  cohost_auth_end date,
  host_auth_start date,
  host_auth_end date,
  manager_start date,
  manager_end date
);

CREATE TABLE public.event_upcoming (
  event_id integer NOT NULL,
  host text NOT NULL,
  co_hosts text,
  event_name character varying NOT NULL,
  event_date date NOT NULL,
  event_time time without time zone NOT NULL,
  game_or_location character varying NOT NULL,
  event_details text NOT NULL,
  event_additional_notes text,
  event_attendees text
);

CREATE TABLE public.event_log_archives (
  event_id integer NOT NULL,
  host text NOT NULL,
  co_hosts text,
  event_name character varying NOT NULL,
  event_date date NOT NULL,
  event_time time without time zone NOT NULL,
  game_or_location character varying NOT NULL,
  event_details text NOT NULL,
  event_additional_notes text,
  event_attendees text NOT NULL,
  host_notes text,
  status character varying NOT NULL
);

CREATE TABLE public.session_upcoming (
  session_id integer NOT NULL,
  session_status character varying NOT NULL,
  session_booked boolean NOT NULL,
  session_name character varying,
  session_desc text,
  session_duration character varying NOT NULL,
  num_slots smallint NOT NULL,
  trainer_assignment_mode character varying NOT NULL,
  session_date date NOT NULL,
  session_time character varying NOT NULL,
  additional_notes text,
  trainee_timer smallint NOT NULL
);

CREATE TABLE public.session_post_logs (
  session_id integer NOT NULL,
  session_name character varying,
  session_desc text,
  session_status character varying,
  session_date date,
  session_duration_expected character varying,
  session_runtime_actual integer,
  num_slots smallint,
  actual_slots_provided smallint,
  additional_notes text,
  main_ast_notes text,
  started time without time zone,
  ended time without time zone,
  concluded_at timestamp with time zone
);

CREATE TABLE public.session_staff_logs (
  session_id integer NOT NULL,
  host character varying NOT NULL,
  cohost_1 character varying,
  cohost_2 character varying,
  cohost_3 character varying,
  cohost_4_supervisor character varying,
  assistant_1 character varying,
  assistant_2 character varying,
  assistant_3 character varying,
  assistant_4 character varying,
  full_staff_json jsonb
);

CREATE TABLE public.session_full_logs (
  log_id integer NOT NULL,
  session_id integer NOT NULL,
  trainee_id bigint NOT NULL,
  trainee_roblox character varying NOT NULL,
  trainee_zone smallint NOT NULL,
  trainee_attendance boolean NOT NULL,
  trainer_id bigint NOT NULL,
  trainee_notes text,
  staff_notes text,
  trainee_feedback boolean NOT NULL,
  feedback_sent boolean NOT NULL
);

CREATE TABLE public.session_driver_logs (
  log_id integer NOT NULL,
  session_id integer NOT NULL,
  discord_username character varying,
  roblox_name character varying,
  attendance boolean NOT NULL
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  discord_id text,
  discord_username text NOT NULL,
  discord_server_name text,
  discord_avatar_url text,
  roblox_id bigint,
  roblox_username text,
  roblox_verified_at timestamp with time zone,
  nationality text,
  num_sessions_attended smallint NOT NULL,
  hide_stats boolean NOT NULL,
  notif_prefs jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  roblox_avatar_url text
);

CREATE TABLE public.staff_profiles (
  id uuid NOT NULL,
  staff_rank text NOT NULL,
  staff_joined date NOT NULL,
  staff_loa boolean NOT NULL,
  staff_quota_met boolean NOT NULL,
  staff_perm_level smallint NOT NULL,
  op_dept boolean NOT NULL,
  host_auth boolean NOT NULL,
  cohost_auth boolean NOT NULL,
  asst_auth boolean NOT NULL,
  comm_dept boolean NOT NULL,
  eventh_auth boolean NOT NULL,
  eventch_auth boolean NOT NULL,
  ih_auth boolean NOT NULL
);

CREATE TABLE public.site_admins (
  id uuid NOT NULL,
  admin_role text NOT NULL,
  granted_at timestamp with time zone NOT NULL
);

CREATE TABLE public.notification_recipients (
  notif_id integer NOT NULL,
  profile_id uuid NOT NULL
);

CREATE TABLE public.admin_view_as_logs (
  log_id bigint NOT NULL,
  admin_id uuid NOT NULL,
  viewed_rank text NOT NULL,
  started_at timestamp with time zone NOT NULL,
  ended_at timestamp with time zone,
  reason text
);

CREATE TABLE public.session_feedback_logs (
  log_id integer NOT NULL,
  session_id integer NOT NULL,
  trainee_id bigint NOT NULL,
  trainer_id bigint,
  created_at timestamp with time zone,
  trains smallint,
  setup text,
  conflict text,
  priority text,
  rbtiming text,
  overall text,
  notes text,
  setup_seconds integer,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.notification_reads (
  notif_id integer NOT NULL,
  profile_id uuid NOT NULL,
  read_at timestamp with time zone NOT NULL
);

CREATE TABLE public.session_trainees (
  trainee_row_id integer NOT NULL,
  session_id integer NOT NULL,
  slot_number smallint NOT NULL,
  is_standby boolean NOT NULL,
  trainee_roblox_username text,
  trainee_discord text,
  trainee_discord_id bigint,
  zone smallint,
  note text,
  trainer_name text,
  attended boolean NOT NULL
);

CREATE TABLE public.session_drivers (
  driver_row_id integer NOT NULL,
  session_id integer NOT NULL,
  discord_username text,
  roblox_username text,
  attended boolean NOT NULL
);

ALTER TABLE public.staff_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.known_trainees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_ongoing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_scripts_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_archived ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_quota ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_bell_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_upcoming ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_log_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_post_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_staff_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_full_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_upcoming ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_driver_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_view_as_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_feedback_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_trainees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read the staff roster" ON public.staff_roster FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Anyone signed in can view session_ongoing" ON public.session_ongoing FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Staff perm>=10 can insert into session_ongoing" ON public.session_ongoing FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=10 can update session_ongoing" ON public.session_ongoing FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=15 can delete from session_ongoing" ON public.session_ongoing FOR DELETE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 15)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY session_ongoing_rw ON public.session_ongoing FOR ALL USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "Anyone signed in can view session_staff" ON public.session_staff FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Staff perm>=10 can insert into session_staff" ON public.session_staff FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=10 can update session_staff" ON public.session_staff FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=15 can delete from session_staff" ON public.session_staff FOR DELETE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 15)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY site_scripts_admin_all ON public.site_scripts FOR ALL USING ((EXISTS ( SELECT 1
   FROM site_admins sa
  WHERE (sa.id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM site_admins sa
  WHERE (sa.id = auth.uid()))));
CREATE POLICY site_scripts_history_admin_select ON public.site_scripts_history FOR SELECT USING ((EXISTS ( SELECT 1
   FROM site_admins sa
  WHERE (sa.id = auth.uid()))));
CREATE POLICY "Anyone signed in can view notifications" ON public.notifications FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Staff perm>=10 can insert into notifications" ON public.notifications FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=10 can update notifications" ON public.notifications FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=15 can delete from notifications" ON public.notifications FOR DELETE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 15)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "notifications visible to intended audience" ON public.notifications FOR SELECT USING (((audience_type = 'everyone'::text) OR ((audience_type = 'rank'::text) AND (audience_rank = ( SELECT staff_profiles.staff_rank
   FROM staff_profiles
  WHERE (staff_profiles.id = auth.uid())))) OR ((audience_type = 'department'::text) AND (((audience_department = 'operations'::text) AND ( SELECT staff_profiles.op_dept
   FROM staff_profiles
  WHERE (staff_profiles.id = auth.uid()))) OR ((audience_department = 'community'::text) AND ( SELECT staff_profiles.comm_dept
   FROM staff_profiles
  WHERE (staff_profiles.id = auth.uid()))))) OR ((audience_type = 'users'::text) AND (EXISTS ( SELECT 1
   FROM notification_recipients
  WHERE ((notification_recipients.notif_id = notifications.notif_id) AND (notification_recipients.profile_id = auth.uid())))))));
CREATE POLICY "Anyone signed in can view staff_archived" ON public.staff_archived FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Staff perm>=15 can delete from staff_archived" ON public.staff_archived FOR DELETE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 15)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=15 can insert into staff_archived" ON public.staff_archived FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 15)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=15 can update staff_archived" ON public.staff_archived FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 15)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Anyone signed in can view staff_quota" ON public.staff_quota FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Staff perm>=10 can insert into staff_quota" ON public.staff_quota FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=10 can update staff_quota" ON public.staff_quota FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=15 can delete from staff_quota" ON public.staff_quota FOR DELETE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 15)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Anyone signed in can view staff_timeline" ON public.staff_timeline FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Staff perm>=10 can insert into staff_timeline" ON public.staff_timeline FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=10 can update staff_timeline" ON public.staff_timeline FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=15 can delete from staff_timeline" ON public.staff_timeline FOR DELETE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 15)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY bell_state_rw ON public.session_bell_state FOR ALL USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "Anyone signed in can view event_upcoming" ON public.event_upcoming FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Staff perm>=15 can delete from event_upcoming" ON public.event_upcoming FOR DELETE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 15)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=7 can insert into event_upcoming" ON public.event_upcoming FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 7)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=7 can update event_upcoming" ON public.event_upcoming FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 7)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Anyone signed in can view event_log_archives" ON public.event_log_archives FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Staff perm>=15 can delete from event_log_archives" ON public.event_log_archives FOR DELETE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 15)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=7 can insert into event_log_archives" ON public.event_log_archives FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 7)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=7 can update event_log_archives" ON public.event_log_archives FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 7)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Anyone signed in can view session_post_logs" ON public.session_post_logs FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Staff perm>=10 can insert into session_post_logs" ON public.session_post_logs FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=10 can update session_post_logs" ON public.session_post_logs FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=15 can delete from session_post_logs" ON public.session_post_logs FOR DELETE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 15)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Anyone signed in can view session_staff_logs" ON public.session_staff_logs FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Staff perm>=10 can insert into session_staff_logs" ON public.session_staff_logs FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=10 can update session_staff_logs" ON public.session_staff_logs FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=15 can delete from session_staff_logs" ON public.session_staff_logs FOR DELETE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 15)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Anyone signed in can view session_full_logs" ON public.session_full_logs FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Staff perm>=10 can insert into session_full_logs" ON public.session_full_logs FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=10 can update session_full_logs" ON public.session_full_logs FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=15 can delete from session_full_logs" ON public.session_full_logs FOR DELETE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 15)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Anyone signed in can view session_upcoming" ON public.session_upcoming FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Staff perm>=10 can insert into session_upcoming" ON public.session_upcoming FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=10 can update session_upcoming" ON public.session_upcoming FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=15 can delete from session_upcoming" ON public.session_upcoming FOR DELETE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 15)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Anyone signed in can view session_driver_logs" ON public.session_driver_logs FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Staff perm>=10 can delete from session_driver_logs" ON public.session_driver_logs FOR DELETE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=5 can insert into session_driver_logs" ON public.session_driver_logs FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 5)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=5 can update session_driver_logs" ON public.session_driver_logs FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 5)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Anyone signed in can read staff list" ON public.staff_profiles FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Users can insert their own staff profile" ON public.staff_profiles FOR INSERT WITH CHECK ((auth.uid() = id));
CREATE POLICY "Users can update their own staff profile" ON public.staff_profiles FOR UPDATE USING ((auth.uid() = id));
CREATE POLICY "Users can insert their own admin grant via role sync" ON public.site_admins FOR INSERT WITH CHECK ((auth.uid() = id));
CREATE POLICY "Users can read their own admin status" ON public.site_admins FOR SELECT USING ((auth.uid() = id));
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));
CREATE POLICY "Users can read their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));
CREATE POLICY admin_view_as_logs_insert_self ON public.admin_view_as_logs FOR INSERT WITH CHECK (((auth.uid() = admin_id) AND (EXISTS ( SELECT 1
   FROM site_admins sa
  WHERE (sa.id = auth.uid())))));
CREATE POLICY admin_view_as_logs_select_admins ON public.admin_view_as_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM site_admins sa
  WHERE (sa.id = auth.uid()))));
CREATE POLICY admin_view_as_logs_update_self ON public.admin_view_as_logs FOR UPDATE USING ((auth.uid() = admin_id)) WITH CHECK ((auth.uid() = admin_id));
CREATE POLICY "Anyone signed in can view session_feedback_logs" ON public.session_feedback_logs FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Staff perm>=15 can delete from session_feedback_logs" ON public.session_feedback_logs FOR DELETE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 15)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=8 can insert into session_feedback_logs" ON public.session_feedback_logs FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 8)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=8 can update session_feedback_logs" ON public.session_feedback_logs FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 8)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "users manage their own read receipts" ON public.notification_reads FOR ALL USING ((profile_id = auth.uid())) WITH CHECK ((profile_id = auth.uid()));
CREATE POLICY "Anyone signed in can view session_trainees" ON public.session_trainees FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Staff perm>=10 can insert into session_trainees" ON public.session_trainees FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=10 can update session_trainees" ON public.session_trainees FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=15 can delete from session_trainees" ON public.session_trainees FOR DELETE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 15)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Anyone signed in can view session_drivers" ON public.session_drivers FOR SELECT USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Staff perm>=5 can delete from session_drivers" ON public.session_drivers FOR DELETE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 5)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=5 can insert into session_drivers" ON public.session_drivers FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 5)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));
CREATE POLICY "Staff perm>=5 can update session_drivers" ON public.session_drivers FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE ((staff_profiles.id = auth.uid()) AND (staff_profiles.staff_perm_level >= 10)))) OR (EXISTS ( SELECT 1
   FROM site_admins
  WHERE (site_admins.id = auth.uid())))));

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_ongoing;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_feedback_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_staff;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_trainees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_bell_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_drivers;
