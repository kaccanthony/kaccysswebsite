-- Current staff rank progression exported from Townhall!B7:AF25 on 2026-10-09.
-- staff_display_name preserves the sheet name. Missing account or timeline values are
-- written as '[TO BE ADDED]' so they can be located and completed later.
-- Nationality and flag data are deliberately excluded.

CREATE TABLE IF NOT EXISTS public.staff_rank_progression (
  discord_id text PRIMARY KEY,
  discord_username text NOT NULL DEFAULT '[TO BE ADDED]',
  staff_display_name text NOT NULL,
  days_as_staff integer NOT NULL,
  role_timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_as_of date NOT NULL,
  CONSTRAINT staff_rank_progression_timeline_array
    CHECK (jsonb_typeof(role_timeline) = 'array')
);

ALTER TABLE public.staff_rank_progression ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_rank_progression FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_rank_progression TO service_role;

INSERT INTO public.staff_rank_progression (
  discord_id,
  discord_username,
  staff_display_name,
  days_as_staff,
  role_timeline,
  source_as_of
)
VALUES
  ('1289533889815253073', 'yoshi5336.', 'Yoshi5336', 586, '[{"sequence":1,"staff_rank":"Operations Manager","started_on":"2025-02-27","ended_on":"Present","duration_days":586}]'::jsonb, DATE '2026-10-09'),
  ('775004984352964608', 'trickzy_gg', 'Trickzy', 586, '[{"sequence":1,"staff_rank":"Co-Host Authorized","started_on":"2025-02-27","ended_on":"2025-03-13","duration_days":14},{"sequence":2,"staff_rank":"Head Staff","started_on":"2025-03-13","ended_on":"2025-05-17","duration_days":65},{"sequence":3,"staff_rank":"Operations Manager","started_on":"2025-05-17","ended_on":"Present","duration_days":507}]'::jsonb, DATE '2026-10-09'),
  ('753274076323119125', 'vijnan_2506', 'Myself_Vijnan', 586, '[{"sequence":1,"staff_rank":"Assistant Authorized","started_on":"2025-02-27","ended_on":"2025-04-16","duration_days":48},{"sequence":2,"staff_rank":"Co-Host Authorized","started_on":"2025-04-16","ended_on":"2025-09-18","duration_days":155},{"sequence":3,"staff_rank":"Head Staff","started_on":"2025-09-18","ended_on":"2025-10-12","duration_days":24},{"sequence":4,"staff_rank":"Community Manager","started_on":"2025-10-12","ended_on":"Present","duration_days":359}]'::jsonb, DATE '2026-10-09'),
  ('1355223896261136584', 'peerione_', 'Peerione', 479, '[{"sequence":1,"staff_rank":"Assistant Authorized","started_on":"2025-06-14","ended_on":"2025-12-10","duration_days":179},{"sequence":2,"staff_rank":"Co-Host Authorized","started_on":"2025-12-10","ended_on":"2026-06-27","duration_days":199},{"sequence":3,"staff_rank":"Head Staff","started_on":"2026-06-27","ended_on":"2026-07-31","duration_days":34},{"sequence":4,"staff_rank":"Community Manager","started_on":"2026-07-31","ended_on":"Present","duration_days":67}]'::jsonb, DATE '2026-10-09'),
  ('479880148842184725', 'vlackarzmsk', 'Vlackar', 552, '[{"sequence":1,"staff_rank":"Assistant Authorized","started_on":"2025-04-02","ended_on":"2025-08-22","duration_days":142},{"sequence":2,"staff_rank":"Co-Host Authorized","started_on":"2025-08-22","ended_on":"2026-02-22","duration_days":184},{"sequence":3,"staff_rank":"Head Staff","started_on":"2026-02-22","ended_on":"Present","duration_days":226}]'::jsonb, DATE '2026-10-09'),
  ('1172924379135492238', 'zig14zag.', 'zig14zag', 561, '[{"sequence":1,"staff_rank":"Assistant Authorized","started_on":"2025-03-24","ended_on":"2025-08-22","duration_days":151},{"sequence":2,"staff_rank":"Co-Host Authorized","started_on":"2025-08-22","ended_on":"2026-02-22","duration_days":184},{"sequence":3,"staff_rank":"Head Staff","started_on":"2026-02-22","ended_on":"Present","duration_days":226}]'::jsonb, DATE '2026-10-09'),
  ('786911272351956993', 'void_tuna_', 'Tuna', 555, '[{"sequence":1,"staff_rank":"Assistant Authorized","started_on":"2025-03-30","ended_on":"2025-04-16","duration_days":17},{"sequence":2,"staff_rank":"Co-Host Authorized","started_on":"2025-04-16","ended_on":"2026-06-27","duration_days":437},{"sequence":3,"staff_rank":"Head Staff","started_on":"2026-06-27","ended_on":"Present","duration_days":101}]'::jsonb, DATE '2026-10-09'),
  ('707604709099307009', 'jtrms11', 'JTrms', 548, '[{"sequence":1,"staff_rank":"Assistant Authorized","started_on":"2025-04-06","ended_on":"2025-08-22","duration_days":138},{"sequence":2,"staff_rank":"Co-Host Authorized","started_on":"2025-08-22","ended_on":"2026-06-27","duration_days":309},{"sequence":3,"staff_rank":"Head Staff","started_on":"2026-06-27","ended_on":"Present","duration_days":101}]'::jsonb, DATE '2026-10-09'),
  ('1233819553562103918', 'ykkreflex', 'ykreflex', 441, '[{"sequence":1,"staff_rank":"Assistant Authorized","started_on":"2025-03-30","ended_on":"2025-04-16","duration_days":17},{"sequence":2,"staff_rank":"Co-Host Authorized","started_on":"2025-04-16","ended_on":"2025-11-26","duration_days":224},{"sequence":3,"staff_rank":"Assistant Authorized","started_on":"2026-03-20","ended_on":"2026-06-27","duration_days":99},{"sequence":4,"staff_rank":"Head Staff","started_on":"2026-06-27","ended_on":"Present","duration_days":101}]'::jsonb, DATE '2026-10-09'),
  ('928892932625416242', 'definitelynotroman', 'Romanko', 345, '[{"sequence":1,"staff_rank":"Assistant Authorized","started_on":"2025-10-26","ended_on":"2026-02-26","duration_days":123},{"sequence":2,"staff_rank":"Co-Host Authorized","started_on":"2026-02-26","ended_on":"Present","duration_days":222}]'::jsonb, DATE '2026-10-09'),
  ('779274835213156363', 'cathaypacific_111', 'TChai', 479, '[{"sequence":1,"staff_rank":"Assistant Authorized","started_on":"2025-06-14","ended_on":"Present","duration_days":479}]'::jsonb, DATE '2026-10-09'),
  ('1155435768580423700', 'ericjackofficial', 'EricJack', 479, '[{"sequence":1,"staff_rank":"Assistant Authorized","started_on":"2025-06-14","ended_on":"Present","duration_days":479}]'::jsonb, DATE '2026-10-09'),
  ('775666746093862952', 'martys5732', 'Martysovec1234', 200, '[{"sequence":1,"staff_rank":"Assistant Authorized","started_on":"2026-03-20","ended_on":"Present","duration_days":200}]'::jsonb, DATE '2026-10-09'),
  ('1089179220212715550', 'germanketchup', 'IamHappyKetchup', 200, '[{"sequence":1,"staff_rank":"Assistant Authorized","started_on":"2026-03-20","ended_on":"Present","duration_days":200}]'::jsonb, DATE '2026-10-09'),
  ('977611575512944651', 'immediatedivider', 'ImmediateDivider', 45, '[{"sequence":1,"staff_rank":"Assistant Authorized","started_on":"2026-08-22","ended_on":"Present","duration_days":45}]'::jsonb, DATE '2026-10-09'),
  ('1007312984244224040', 'rostysman', 'rostysman', 45, '[{"sequence":1,"staff_rank":"Assistant Authorized","started_on":"2026-08-22","ended_on":"Present","duration_days":45}]'::jsonb, DATE '2026-10-09'),
  ('1443891124233048176', 'captain_ts08', 'captain_ts08', 153, '[{"sequence":1,"staff_rank":"Assistant Authorized","started_on":"2026-03-20","ended_on":"2026-07-06","duration_days":108},{"sequence":2,"staff_rank":"Assistant Authorized","started_on":"2026-08-22","ended_on":"2026-09-06","duration_days":15},{"sequence":3,"staff_rank":"Event Authorized","started_on":"2026-09-06","ended_on":"Present","duration_days":30}]'::jsonb, DATE '2026-10-09'),
  ('1226496755764559872', 'marciaafr', 'marciaafr', 30, '[{"sequence":1,"staff_rank":"Event Authorized","started_on":"2026-09-06","ended_on":"Present","duration_days":30}]'::jsonb, DATE '2026-10-09')
ON CONFLICT (discord_id) DO UPDATE SET
  discord_username = EXCLUDED.discord_username,
  staff_display_name = EXCLUDED.staff_display_name,
  days_as_staff = EXCLUDED.days_as_staff,
  role_timeline = EXCLUDED.role_timeline,
  source_as_of = EXCLUDED.source_as_of;
