-- Add a stable Roblox user ID for Hall of Fame profiles.
-- Run this once before former_staff_data_seed.sql.
-- Roblox usernames remain as a fallback for rows whose ID has not been filled yet.

ALTER TABLE public.staff_archived
ADD COLUMN IF NOT EXISTS staff_roblox_id bigint;

COMMENT ON COLUMN public.staff_archived.staff_roblox_id IS
  'Stable Roblox user ID used for avatar and profile URLs; staff_roblox_name is a fallback.';

CREATE INDEX IF NOT EXISTS staff_archived_roblox_id_idx
ON public.staff_archived (staff_roblox_id)
WHERE staff_roblox_id IS NOT NULL;
