-- Apply after database/event_panel.sql (and the existing event_upcoming table).
-- Safe to rerun. Existing attendee text remains available to older pages.
BEGIN;

ALTER TABLE public.event_upcoming
  ADD COLUMN IF NOT EXISTS event_status text NOT NULL DEFAULT 'Scheduled';
ALTER TABLE public.event_upcoming
  ADD COLUMN IF NOT EXISTS event_attendees_data jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.event_upcoming
  ADD COLUMN IF NOT EXISTS event_additional_staff jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.event_upcoming
  ADD COLUMN IF NOT EXISTS event_type text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_upcoming_status_check'
    AND conrelid = 'public.event_upcoming'::regclass) THEN
    ALTER TABLE public.event_upcoming ADD CONSTRAINT event_upcoming_status_check
      CHECK (event_status IN ('Requested', 'Scheduled', 'Published', 'Cancelled', 'Postponed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_upcoming_attendees_data_check'
    AND conrelid = 'public.event_upcoming'::regclass) THEN
    ALTER TABLE public.event_upcoming ADD CONSTRAINT event_upcoming_attendees_data_check
      CHECK (jsonb_typeof(event_attendees_data) = 'array');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_upcoming_additional_staff_check'
    AND conrelid = 'public.event_upcoming'::regclass) THEN
    ALTER TABLE public.event_upcoming ADD CONSTRAINT event_upcoming_additional_staff_check
      CHECK (jsonb_typeof(event_additional_staff) = 'array');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_upcoming_type_check'
    AND conrelid = 'public.event_upcoming'::regclass) THEN
    ALTER TABLE public.event_upcoming ADD CONSTRAINT event_upcoming_type_check
      CHECK (event_type IN ('Competitive Event', 'Speedrun Event',
        'Creative Collab Event - Dynamic', 'Creative Collab Event - Static', 'Chill Event'));
  END IF;
END $$;

-- Existing permission-tier policies remain in place; this adds access for
-- Event Host and Event Co-Host authorized staff at any staff permission level.
DROP POLICY IF EXISTS "Event authorized staff can insert event_upcoming" ON public.event_upcoming;
CREATE POLICY "Event authorized staff can insert event_upcoming" ON public.event_upcoming
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.staff_profiles sp WHERE sp.id = auth.uid()
      AND (sp.eventh_auth OR sp.eventch_auth)));

DROP POLICY IF EXISTS "Event authorized staff can update event_upcoming" ON public.event_upcoming;
CREATE POLICY "Event authorized staff can update event_upcoming" ON public.event_upcoming
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.staff_profiles sp WHERE sp.id = auth.uid()
      AND (sp.eventh_auth OR sp.eventch_auth)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.staff_profiles sp WHERE sp.id = auth.uid()
      AND (sp.eventh_auth OR sp.eventch_auth)));

DROP POLICY IF EXISTS "Event authorized staff can delete event_upcoming" ON public.event_upcoming;
CREATE POLICY "Event authorized staff can delete event_upcoming" ON public.event_upcoming
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.staff_profiles sp WHERE sp.id = auth.uid()
      AND (sp.eventh_auth OR sp.eventch_auth)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_upcoming TO authenticated;

COMMIT;

-- Rollback, if needed after preserving new status/identity data:
-- DROP POLICY IF EXISTS "Event authorized staff can delete event_upcoming" ON public.event_upcoming;
-- DROP POLICY IF EXISTS "Event authorized staff can update event_upcoming" ON public.event_upcoming;
-- DROP POLICY IF EXISTS "Event authorized staff can insert event_upcoming" ON public.event_upcoming;
-- ALTER TABLE public.event_upcoming DROP COLUMN IF EXISTS event_type, DROP COLUMN IF EXISTS event_additional_staff, DROP COLUMN IF EXISTS event_attendees_data, DROP COLUMN IF EXISTS event_status;
