-- Store each user's nickname for this Discord server separately from their
-- account-level Discord username. Null means no server-specific nickname or
-- the user is not a member of the configured server.

alter table public.profiles
  add column if not exists discord_server_name text;
