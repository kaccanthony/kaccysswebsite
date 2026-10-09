-- Global public staff-profile visibility mode.
-- full: show department donuts/rankings; basic: show identity and basic tenure data only.

CREATE TABLE IF NOT EXISTS public.site_settings (
  setting_key text PRIMARY KEY,
  setting_value text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.site_settings (setting_key, setting_value)
VALUES ('public_staff_stats_visibility', 'full')
ON CONFLICT (setting_key) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_settings_staff_stats_visibility_value'
      AND conrelid = 'public.site_settings'::regclass
  ) THEN
    ALTER TABLE public.site_settings
      ADD CONSTRAINT site_settings_staff_stats_visibility_value
      CHECK (
        setting_key <> 'public_staff_stats_visibility'
        OR setting_value IN ('full', 'basic')
      );
  END IF;
END $$;

GRANT SELECT, UPDATE ON public.site_settings TO authenticated;

DROP POLICY IF EXISTS "authenticated users can view site settings"
  ON public.site_settings;
CREATE POLICY "authenticated users can view site settings"
  ON public.site_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authorized managers can update public staff stats visibility"
  ON public.site_settings;
CREATE POLICY "authorized managers can update public staff stats visibility"
  ON public.site_settings FOR UPDATE
  TO authenticated
  USING (
    setting_key = 'public_staff_stats_visibility'
    AND (
      EXISTS (
        SELECT 1 FROM public.site_admins
        WHERE id = auth.uid()
          AND admin_role IN ('owner', 'developer', 'moderator')
      )
      OR EXISTS (
        SELECT 1 FROM public.staff_profiles
        WHERE id = auth.uid()
          AND staff_rank IN ('Operations Manager', 'Community Manager')
      )
    )
  )
  WITH CHECK (
    setting_key = 'public_staff_stats_visibility'
    AND setting_value IN ('full', 'basic')
    AND (
      EXISTS (
        SELECT 1 FROM public.site_admins
        WHERE id = auth.uid()
          AND admin_role IN ('owner', 'developer', 'moderator')
      )
      OR EXISTS (
        SELECT 1 FROM public.staff_profiles
        WHERE id = auth.uid()
          AND staff_rank IN ('Operations Manager', 'Community Manager')
      )
    )
  );
