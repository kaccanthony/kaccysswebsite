-- Enable database-change notifications for the global ongoing-activity pill.
-- session_ongoing is already in the publication in current_db.sql.
-- Safe to apply again after event_panel.sql has created event_runs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'event_runs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_runs;
  END IF;
END
$$;
