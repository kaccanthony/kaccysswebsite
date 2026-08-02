<?php
declare(strict_types=1);
session_start();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../cnn.php';

if (!isset($_GET['state']) || $_GET['state'] !== ($_SESSION['oauth_state'] ?? null)) {
    $_SESSION['error'] = 'OAuth state mismatch, please try again.';
    header('Location: /login.php'); exit;
}
unset($_SESSION['oauth_state']);

if (!isset($_GET['code'])) {
    $_SESSION['error'] = 'Discord authorization was cancelled.';
    header('Location: /login.php'); exit;
}

// ── Exchange the authorization code for an access token ──
$ch = curl_init('https://discord.com/api/oauth2/token');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POSTFIELDS     => http_build_query([
        'client_id'     => DISCORD_CLIENT_ID,
        'client_secret' => DISCORD_CLIENT_SECRET,
        'grant_type'    => 'authorization_code',
        'code'          => $_GET['code'],
        'redirect_uri'  => DISCORD_REDIRECT_URI,
    ]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
]);
$token = json_decode((string) curl_exec($ch), true);
curl_close($ch);

if (!isset($token['access_token'])) {
    $_SESSION['error'] = 'Could not authenticate with Discord.';
    header('Location: /login.php'); exit;
}

// ── Fetch the Discord identity ──
$ch = curl_init('https://discord.com/api/users/@me');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $token['access_token']],
]);
$discordUser = json_decode((string) curl_exec($ch), true);
curl_close($ch);

$discordId   = (int) $discordUser['id']; // snowflakes fit comfortably in bigint
$discordName = $discordUser['username'];
$displayName = $discordUser['global_name'] ?? $discordName;
$avatarHash  = $discordUser['avatar'] ?? null;

// ── Upsert the account — one statement instead of the old
//    "check exists, then insert-or-update across two tables" logic ──
$stmt = $conn->prepare("
    INSERT INTO accounts (discord_id, discord_username, discord_display_name, discord_avatar_hash)
    VALUES (:id, :username, :display_name, :avatar)
    ON CONFLICT (discord_id) DO UPDATE
        SET discord_username = EXCLUDED.discord_username,
            discord_display_name = EXCLUDED.discord_display_name,
            discord_avatar_hash = EXCLUDED.discord_avatar_hash,
            updated_at = now()
");
$stmt->execute([
    'id'           => $discordId,
    'username'     => $discordName,
    'display_name' => $displayName,
    'avatar'       => $avatarHash,
]);

// ── Pull staff + admin status in one round trip ──
$stmt = $conn->prepare("
    SELECT
        a.discord_id, a.discord_username, a.discord_avatar_hash, a.roblox_username,
        sp.staff_rank, sp.staff_perm_level,
        adm.admin_role
    FROM accounts a
    LEFT JOIN staff_profiles sp ON sp.discord_id = a.discord_id
    LEFT JOIN site_admins adm ON adm.discord_id = a.discord_id
    WHERE a.discord_id = :id
");
$stmt->execute(['id' => $discordId]);
$row = $stmt->fetch();

$_SESSION['user'] = [
    'id'          => (string) $row['discord_id'],
    'username'    => $row['discord_username'],
    'avatar'      => $row['discord_avatar_hash'],
    'roblox_name' => $row['roblox_username'] ?? '',
    'role'        => $row['staff_rank'] ?? '',
    'perm_level'  => $row['staff_perm_level'] ?? 0,
    'is_staff'    => $row['staff_rank'] !== null,
    'is_admin'    => $row['admin_role'] !== null,
    'admin_role'  => $row['admin_role'] ?? '',
];

// ── Remember-me: now works for everyone, not just staff (the old
//    pp_user_pp.remember_token column was mistyped as int(64) and
//    was effectively unusable — this fixes that by design) ──
$rememberToken = bin2hex(random_bytes(32));
$conn->prepare("
    UPDATE accounts
    SET remember_token = :token, remember_token_expires = now() + interval '30 days'
    WHERE discord_id = :id
")->execute(['token' => $rememberToken, 'id' => $discordId]);

setcookie('remember_token', $rememberToken, [
    'expires'  => time() + (30 * 24 * 60 * 60),
    'path'     => '/',
    'secure'   => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);

header('Location: /dashboard/dashboard.php');
exit;