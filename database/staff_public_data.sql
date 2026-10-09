-- Workbook snapshots keyed by Discord ID. Apply before staff_public_data_seed.sql.
-- Only public metrics and Roblox IDs live here. Flag images and nationality are excluded.
CREATE TABLE IF NOT EXISTS public.staff_public_data (
  discord_id text PRIMARY KEY,
  roblox_id bigint,
  operations jsonb NOT NULL DEFAULT '{}'::jsonb,
  community jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_as_of date NOT NULL,
  CONSTRAINT staff_public_data_operations_object CHECK (jsonb_typeof(operations) = 'object'),
  CONSTRAINT staff_public_data_community_object CHECK (jsonb_typeof(community) = 'object')
);

ALTER TABLE public.staff_public_data ENABLE ROW LEVEL SECURITY;
-- Public reads go through the server getter, which returns an explicit allowlist.
REVOKE ALL ON public.staff_public_data FROM anon, authenticated;
GRANT SELECT ON public.staff_public_data TO service_role;
