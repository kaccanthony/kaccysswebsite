-- Apply to Supabase before using the saved links in Manage Sessions.
-- Existing sessions keep NULL links until a manager fills them in.
ALTER TABLE public.session_upcoming
  ADD COLUMN IF NOT EXISTS event_link text,
  ADD COLUMN IF NOT EXISTS forum_link text,
  ADD COLUMN IF NOT EXISTS private_server_link text;
