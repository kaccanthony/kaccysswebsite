-- Keep the permanent Discord staff roster independent of disposable login rows.
-- Apply in the Supabase SQL editor. Safe to run more than once.
-- Deleting a profile will still remove its account-specific staff_profiles row.

BEGIN;

-- current_db.sql shows no roster -> profile foreign key, but its table snapshot
-- omits constraints. Remove any such key in the live database, including a
-- possible ON DELETE CASCADE key, without touching other roster constraints.
DO $$
DECLARE
  link record;
BEGIN
  FOR link IN
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid = 'public.staff_roster'::regclass
      AND confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE public.staff_roster DROP CONSTRAINT %I', link.conname);
    RAISE NOTICE 'Removed account-linked staff_roster constraint: % (%)', link.conname, link.definition;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.unclaim_staff_roster_on_profile_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.discord_id IS NOT NULL THEN
    UPDATE public.staff_roster
    SET claimed = false, claimed_at = NULL
    WHERE discord_id = OLD.discord_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS unclaim_staff_roster_on_profile_delete ON public.profiles;
CREATE TRIGGER unclaim_staff_roster_on_profile_delete
AFTER DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.unclaim_staff_roster_on_profile_delete();

-- Repair rows left claimed by earlier test-account deletions. This does not
-- recreate staff_roster rows that were already physically deleted.
UPDATE public.staff_roster AS roster
SET claimed = false, claimed_at = NULL
WHERE roster.claimed
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles AS profile
    WHERE profile.discord_id = roster.discord_id
  );

COMMIT;

-- Verify after applying:
-- SELECT r.discord_id, r.discord_username, r.claimed, p.id AS profile_id
-- FROM public.staff_roster AS r
-- LEFT JOIN public.profiles AS p ON p.discord_id = r.discord_id
-- ORDER BY r.discord_username;
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.staff_roster'::regclass AND contype = 'f';
-- Check for separately installed triggers that might DELETE from staff_roster:
-- SELECT table_name.relname, trigger_row.tgname,
--        pg_get_functiondef(trigger_function.oid)
-- FROM pg_trigger AS trigger_row
-- JOIN pg_class AS table_name ON table_name.oid = trigger_row.tgrelid
-- JOIN pg_proc AS trigger_function ON trigger_function.oid = trigger_row.tgfoid
-- WHERE trigger_row.tgrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
--   AND NOT trigger_row.tgisinternal;

-- Rollback for the new trigger. If the migration reported a removed foreign
-- key, restore it with ALTER TABLE public.staff_roster ADD CONSTRAINT <name>
-- <definition> using the exact name and definition printed in the SQL output.
-- DROP TRIGGER IF EXISTS unclaim_staff_roster_on_profile_delete ON public.profiles;
-- DROP FUNCTION IF EXISTS public.unclaim_staff_roster_on_profile_delete();
