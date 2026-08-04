-- =====================================================================
-- Run this AFTER enabling the Discord provider in Supabase Auth.
--
-- Why this changes from the earlier schema.sql: back when the PHP
-- version hand-rolled the OAuth flow, our own `accounts` table WAS the
-- identity table (Discord ID as primary key). Now that Supabase Auth
-- does the OAuth exchange for us, Supabase already owns identity in its
-- built-in `auth.users` table (keyed by a uuid, not the Discord ID
-- directly). `profiles` is a thin table in your own `public` schema
-- that mirrors the Discord-specific fields, 1:1 with auth.users — and
-- staff_profiles/site_admins now reference THIS table's `id` (uuid)
-- instead of a raw discord_id bigint.
-- =====================================================================

CREATE TABLE profiles (
    id                    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    discord_id              text UNIQUE,             -- Discord snowflake, as a string (from identity.id)
    discord_username           text NOT NULL DEFAULT '',
    discord_avatar_url            text,
    roblox_id                       bigint,
    roblox_username                   text,
    roblox_verified_at                  timestamptz,
    nationality                            text,
    num_sessions_attended                    smallint NOT NULL DEFAULT 0,
    hide_stats                                 boolean NOT NULL DEFAULT false,
    notif_prefs                                  jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at                                     timestamptz NOT NULL DEFAULT now(),
    updated_at                                       timestamptz NOT NULL DEFAULT now()
);

-- Row Level Security is NOT optional now — the browser talks to Supabase
-- directly with the anon key, unlike the old PHP setup where PDO bypassed it.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- =====================================================================
-- staff_profiles / site_admins — same tables as before, just re-pointed
-- at profiles(id) instead of a raw discord_id bigint. If you already ran
-- the earlier schema.sql, drop and recreate these two rather than trying
-- to ALTER the column type, since bigint -> uuid isn't a direct cast.
-- =====================================================================

DROP TABLE IF EXISTS staff_profiles;
CREATE TABLE staff_profiles (
    id                 uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    staff_rank           text NOT NULL,
    staff_joined           date NOT NULL,
    staff_loa                 boolean NOT NULL DEFAULT false,
    staff_quota_met             boolean NOT NULL DEFAULT false,
    staff_perm_level               smallint NOT NULL DEFAULT 0
);
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read staff list"
    ON staff_profiles FOR SELECT
    USING (auth.role() = 'authenticated');

DROP TABLE IF EXISTS site_admins;
CREATE TABLE site_admins (
    id           uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    admin_role     text NOT NULL DEFAULT 'developer'
        CHECK (admin_role IN ('owner', 'developer', 'moderator')),
    granted_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE site_admins ENABLE ROW LEVEL SECURITY;
-- Intentionally no public read policy — only accessible via server-side
-- code using the service_role key (e.g. an admin-only Server Component).