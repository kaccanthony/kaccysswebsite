<?php
/**
 * Supabase (Postgres) connection settings.
 *
 * Find these under: Supabase Dashboard → Project Settings → Database → Connection string.
 * Use the "Session pooler" (port 6543) or "Transaction pooler" URI if your host limits
 * concurrent DB connections (most shared PHP hosting does) — NOT the direct connection
 * on port 5432, which has a low connection cap.
 *
 * Never hardcode real values here — pull from environment variables so this file is
 * safe to commit. Set the actual values in your host's env config / .env (gitignored).
 */

define('DB_HOST', getenv('SUPABASE_DB_HOST'));      // e.g. aws-0-us-east-1.pooler.supabase.com
define('DB_PORT', getenv('SUPABASE_DB_PORT') ?: '6543');
define('DB_NAME', getenv('SUPABASE_DB_NAME') ?: 'postgres');
define('DB_USER', getenv('SUPABASE_DB_USER'));       // e.g. postgres.xxxxxxxxxxxx
define('DB_PASS', getenv('SUPABASE_DB_PASS'));

/**
 * Discord OAuth2 (Discord Developer Portal → your app → OAuth2).
 */
define('DISCORD_CLIENT_ID', getenv('DISCORD_CLIENT_ID'));
define('DISCORD_CLIENT_SECRET', getenv('DISCORD_CLIENT_SECRET'));
define('DISCORD_REDIRECT_URI', 'https://yourdomain.com/oauth/discord_callback.php');

/**
 * Roblox OAuth2 (Roblox Creator Hub → Open Cloud → OAuth2 apps).
 */
define('ROBLOX_CLIENT_ID', getenv('ROBLOX_CLIENT_ID'));
define('ROBLOX_CLIENT_SECRET', getenv('ROBLOX_CLIENT_SECRET'));
define('ROBLOX_REDIRECT_URI', 'https://yourdomain.com/oauth/roblox_callback.php');