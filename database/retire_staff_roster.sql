-- Move the three retired accounts out of staff_roster and into staff_archived.
-- Run after staff_public_data.sql. This migration is transactional and verifies the move.
-- opboy's days and highest rank come from Townhall; the other two use their roster data
-- and are calculated through the source date so their totals do not keep increasing.
-- Nationality and flag data are deliberately excluded.

BEGIN;

WITH retiring(discord_id, override_days, override_rank) AS (
  VALUES
    ('759646190999961621', 307, 'Co-Host Authorized'), -- _opboy_
    ('1378997661562175518', NULL::integer, NULL::text), -- timscrperson
    ('1144620459267211295', NULL::integer, NULL::text)  -- your_average_goose
)
INSERT INTO public.staff_archived (
  staff_id,
  staff_name,
  staff_display_name,
  staff_roblox_name,
  staff_rank,
  staff_days,
  staff_num_sesh_attend,
  hide_stats
)
SELECT
  roster.discord_id::bigint,
  roster.discord_username,
  roster.discord_username,
  '[TO BE ADDED]',
  COALESCE(retiring.override_rank, roster.staff_rank),
  COALESCE(retiring.override_days, GREATEST(DATE '2026-10-09' - roster.staff_joined, 0)),
  COALESCE((public_data.operations ->> 'sessions_attended')::numeric::integer, 0),
  false
FROM public.staff_roster AS roster
JOIN retiring ON retiring.discord_id = roster.discord_id
LEFT JOIN public.staff_public_data AS public_data ON public_data.discord_id = roster.discord_id
ON CONFLICT (staff_id) DO UPDATE SET
  staff_name = EXCLUDED.staff_name,
  staff_display_name = EXCLUDED.staff_display_name,
  staff_rank = EXCLUDED.staff_rank,
  staff_days = EXCLUDED.staff_days,
  staff_num_sesh_attend = EXCLUDED.staff_num_sesh_attend,
  hide_stats = EXCLUDED.hide_stats,
  archived_at = now();

DELETE FROM public.staff_roster
WHERE discord_id IN (
  '759646190999961621',
  '1378997661562175518',
  '1144620459267211295'
);

DELETE FROM public.staff_public_data
WHERE discord_id IN (
  '759646190999961621',
  '1378997661562175518',
  '1144620459267211295'
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.staff_roster
    WHERE discord_id IN (
      '759646190999961621',
      '1378997661562175518',
      '1144620459267211295'
    )
  ) THEN
    RAISE EXCEPTION 'Retirement verification failed: a retired account remains in staff_roster.';
  END IF;

  IF (
    SELECT count(*) FROM public.staff_archived
    WHERE staff_id IN (
      759646190999961621,
      1378997661562175518,
      1144620459267211295
    )
  ) <> 3 THEN
    RAISE EXCEPTION 'Retirement verification failed: expected all three staff_archived rows.';
  END IF;
END $$;

COMMIT;
