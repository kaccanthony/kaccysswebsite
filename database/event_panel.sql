-- Event panel foundation. Apply once in the Supabase SQL editor before using /eventsetup.
-- This expands the existing event_upcoming/event_log_archives model without moving or deleting rows.
-- event_upcoming.event_id is deliberately a snapshot key, not a foreign key: the legacy
-- upcoming row may later be moved into event_log_archives while the run stays available.
-- Scoring rules from the Community Department workbook:
--   Timed ranked events: missed round = participant_count + 1; lower position
--   total ranks first (ties share rank); base = 1 + floor((count - rank) * 1.5);
--   multiplier = 1 through 1 hour, then 1 + base_rate * (sqrt(hours) - 1);
--   final = greatest(base, round(base * multiplier)).
--   Static: entered leaderboard rank uses the same base formula, no multiplier.
--   Chill: attended = 3 base, final = round(3 + greatest(0, hours - 1) * 1.5, 1).
-- The displayed 3-hour maximum is enforced by the web panel's eligibility rule.

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_runs (
  event_run_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_event_id integer NOT NULL UNIQUE,
  event_type text NOT NULL CHECK (event_type IN (
    'Competitive Event', 'Speedrun Event', 'Creative Collab Event - Dynamic',
    'Creative Collab Event - Static', 'Chill Event'
  )),
  event_name text NOT NULL,
  event_date date NOT NULL,
  event_time time without time zone NOT NULL,
  timezone_mode text NOT NULL CHECK (timezone_mode IN ('BST', 'GMT')),
  game_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  additional_notes text NOT NULL DEFAULT '',
  planned_attendees text NOT NULL DEFAULT '',
  host text NOT NULL,
  co_hosts text NOT NULL DEFAULT '',
  additional_staff text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'running', 'concluded')),
  started_at timestamptz,
  ended_at timestamptz,
  concluded_at timestamptz,
  round_count smallint NOT NULL DEFAULT 10 CHECK (round_count BETWEEN 1 AND 10),
  multiplier_base_rate numeric(6, 4) NOT NULL DEFAULT 0.35 CHECK (multiplier_base_rate >= 0),
  min_runtime_minutes smallint NOT NULL DEFAULT 45 CHECK (min_runtime_minutes > 0),
  max_runtime_minutes smallint NOT NULL DEFAULT 180 CHECK (max_runtime_minutes > 0),
  considered boolean NOT NULL DEFAULT false,
  results_message text,
  report_message text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_runs_time_order CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at),
  CONSTRAINT event_runs_runtime_order CHECK (max_runtime_minutes >= min_runtime_minutes)
);

ALTER TABLE public.event_runs ADD COLUMN IF NOT EXISTS planned_attendees text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.event_run_participants (
  participant_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_run_id bigint NOT NULL REFERENCES public.event_runs(event_run_id) ON DELETE CASCADE,
  participant_name text NOT NULL CHECK (length(btrim(participant_name)) > 0),
  attended boolean NOT NULL DEFAULT false,
  leaderboard_rank integer CHECK (leaderboard_rank > 0),
  position_total integer CHECK (position_total >= 0),
  final_rank integer CHECK (final_rank > 0),
  base_points numeric(10, 1) CHECK (base_points >= 0),
  final_points numeric(10, 1) CHECK (final_points >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_run_id, participant_name)
);

CREATE TABLE IF NOT EXISTS public.event_round_results (
  participant_id bigint NOT NULL REFERENCES public.event_run_participants(participant_id) ON DELETE CASCADE,
  round_number smallint NOT NULL CHECK (round_number BETWEEN 1 AND 10),
  position integer NOT NULL CHECK (position > 0),
  PRIMARY KEY (participant_id, round_number)
);

CREATE INDEX IF NOT EXISTS event_runs_host_date_idx ON public.event_runs (lower(host), event_date DESC);
CREATE INDEX IF NOT EXISTS event_runs_status_idx ON public.event_runs (status, event_date DESC);
CREATE INDEX IF NOT EXISTS event_run_participants_run_idx ON public.event_run_participants (event_run_id);

-- A run can be changed only by its authorized host or a site admin. This uses
-- the same staff_profiles.eventh_auth flag already present in the site schema.
CREATE OR REPLACE FUNCTION public.can_manage_event_run(p_event_run_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.site_admins sa WHERE sa.id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.event_runs er
      JOIN public.profiles p ON p.id = auth.uid()
      JOIN public.staff_profiles sp ON sp.id = p.id
      WHERE er.event_run_id = p_event_run_id
        AND sp.eventh_auth
        AND lower(btrim(er.host)) IN (
          lower(btrim(p.discord_username)),
          lower(btrim(coalesce(p.discord_server_name, '')))
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.event_runs er
      JOIN public.profiles p ON p.id = auth.uid()
      JOIN public.staff_profiles sp ON sp.id = p.id
      CROSS JOIN LATERAL regexp_split_to_table(
        replace(er.co_hosts, chr(10), ','), '[,;]'
      ) AS cohost(name)
      WHERE er.event_run_id = p_event_run_id
        AND sp.eventch_auth
        AND lower(btrim(cohost.name)) IN (
          lower(btrim(p.discord_username)),
          lower(btrim(coalesce(p.discord_server_name, '')))
        )
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_event_run(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_event_run(bigint) TO authenticated;

-- Atomic and retry-safe: opening the same scheduled event always returns the
-- same run, even if two authorized requests arrive together.
CREATE OR REPLACE FUNCTION public.start_event_run(
  p_event_id integer,
  p_event_type text,
  p_timezone_mode text
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_event public.event_upcoming%ROWTYPE;
  v_run_id bigint;
  v_authorized boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before setting up an event.'; END IF;
  IF p_event_type NOT IN (
    'Competitive Event', 'Speedrun Event', 'Creative Collab Event - Dynamic',
    'Creative Collab Event - Static', 'Chill Event'
  ) THEN RAISE EXCEPTION 'Choose a valid event type.'; END IF;
  IF p_timezone_mode NOT IN ('BST', 'GMT') THEN RAISE EXCEPTION 'Choose BST or GMT.'; END IF;

  SELECT * INTO v_event FROM public.event_upcoming WHERE event_id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scheduled event not found.'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.site_admins WHERE id = auth.uid()) OR EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.staff_profiles sp ON sp.id = p.id
    WHERE p.id = auth.uid() AND sp.eventh_auth
      AND lower(btrim(v_event.host)) IN (
        lower(btrim(p.discord_username)), lower(btrim(coalesce(p.discord_server_name, '')))
  )) INTO v_authorized;
  IF NOT v_authorized THEN RAISE EXCEPTION 'Only the assigned event host can set up this event.'; END IF;

  INSERT INTO public.event_runs (
    source_event_id, event_type, event_name, event_date, event_time,
    timezone_mode, game_name, description, additional_notes, planned_attendees, host, co_hosts, created_by
  ) VALUES (
    v_event.event_id, p_event_type, v_event.event_name, v_event.event_date, v_event.event_time,
    p_timezone_mode, v_event.game_or_location, v_event.event_details,
    coalesce(v_event.event_additional_notes, ''), coalesce(v_event.event_attendees, ''),
    v_event.host, coalesce(v_event.co_hosts, ''), auth.uid()
  ) ON CONFLICT (source_event_id) DO NOTHING
  RETURNING event_run_id INTO v_run_id;

  IF v_run_id IS NULL THEN
    SELECT event_run_id INTO v_run_id FROM public.event_runs WHERE source_event_id = p_event_id;
  END IF;
  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_event_run(integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_event_run(integer, text, text) TO authenticated;

ALTER TABLE public.event_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_run_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_round_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_runs_read ON public.event_runs;
CREATE POLICY event_runs_read ON public.event_runs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS event_runs_update ON public.event_runs;
CREATE POLICY event_runs_update ON public.event_runs FOR UPDATE TO authenticated
  USING (public.can_manage_event_run(event_run_id))
  WITH CHECK (public.can_manage_event_run(event_run_id));

DROP POLICY IF EXISTS event_run_participants_read ON public.event_run_participants;
CREATE POLICY event_run_participants_read ON public.event_run_participants FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS event_run_participants_write ON public.event_run_participants;
CREATE POLICY event_run_participants_write ON public.event_run_participants FOR ALL TO authenticated
  USING (public.can_manage_event_run(event_run_id))
  WITH CHECK (public.can_manage_event_run(event_run_id));

DROP POLICY IF EXISTS event_round_results_read ON public.event_round_results;
CREATE POLICY event_round_results_read ON public.event_round_results FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS event_round_results_write ON public.event_round_results;
CREATE POLICY event_round_results_write ON public.event_round_results FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.event_run_participants p
    WHERE p.participant_id = event_round_results.participant_id
      AND public.can_manage_event_run(p.event_run_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.event_run_participants p
    WHERE p.participant_id = event_round_results.participant_id
      AND public.can_manage_event_run(p.event_run_id)));

GRANT SELECT, UPDATE ON public.event_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_run_participants, public.event_round_results TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.event_runs_event_run_id_seq,
  public.event_run_participants_participant_id_seq TO authenticated;

COMMIT;

-- Verification after applying:
-- SELECT to_regclass('public.event_runs'), to_regclass('public.event_run_participants'),
--        to_regclass('public.event_round_results');
-- Rollback, only if these tables contain no event data you need:
-- DROP FUNCTION IF EXISTS public.start_event_run(integer, text, text);
-- DROP FUNCTION IF EXISTS public.can_manage_event_run(bigint);
-- DROP TABLE IF EXISTS public.event_round_results, public.event_run_participants, public.event_runs;
