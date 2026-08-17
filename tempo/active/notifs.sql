-- 1. Extend notifications with an audience descriptor
ALTER TABLE public.notifications
  ADD COLUMN audience_type text NOT NULL DEFAULT 'everyone'
    CHECK (audience_type = ANY (ARRAY['everyone', 'rank', 'department', 'users'])),
  ADD COLUMN audience_rank text,        -- used when audience_type = 'rank' — matches staff_profiles.staff_rank
  ADD COLUMN audience_department text;  -- used when audience_type = 'department' — 'operations' | 'community'

-- 2. Explicit targeting — covers both "one user" and "multiple users" the same way
CREATE TABLE public.notification_recipients (
  notif_id integer NOT NULL REFERENCES public.notifications(notif_id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (notif_id, profile_id)
);

-- 3. Per-user read state — decoupled from audience type, since even "everyone"
--    notifications need to track who's actually seen them (this is what
--    powers an unread badge count later)
CREATE TABLE public.notification_reads (
  notif_id integer NOT NULL REFERENCES public.notifications(notif_id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (notif_id, profile_id)
);

CREATE OR REPLACE FUNCTION public.get_notifications_for(p_profile_id uuid)
RETURNS SETOF public.notifications
LANGUAGE sql STABLE
AS $$
  SELECT n.*
  FROM public.notifications n
  LEFT JOIN public.staff_profiles sp ON sp.id = p_profile_id
  WHERE n.audience_type = 'everyone'
     OR (n.audience_type = 'rank' AND n.audience_rank = sp.staff_rank)
     OR (n.audience_type = 'department' AND (
           (n.audience_department = 'operations' AND sp.op_dept)
        OR (n.audience_department = 'community' AND sp.comm_dept)
     ))
     OR (n.audience_type = 'users' AND EXISTS (
           SELECT 1 FROM public.notification_recipients r
           WHERE r.notif_id = n.notif_id AND r.profile_id = p_profile_id
        ))
  ORDER BY n.posted_at DESC;
$$;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications visible to intended audience"
ON public.notifications FOR SELECT
USING (
  audience_type = 'everyone'
  OR (audience_type = 'rank' AND audience_rank = (SELECT staff_rank FROM staff_profiles WHERE id = auth.uid()))
  OR (audience_type = 'department' AND (
        (audience_department = 'operations' AND (SELECT op_dept FROM staff_profiles WHERE id = auth.uid()))
     OR (audience_department = 'community' AND (SELECT comm_dept FROM staff_profiles WHERE id = auth.uid()))
  ))
  OR (audience_type = 'users' AND EXISTS (
        SELECT 1 FROM notification_recipients WHERE notif_id = notifications.notif_id AND profile_id = auth.uid()
     ))
);

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage their own read receipts"
ON public.notification_reads FOR ALL
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());