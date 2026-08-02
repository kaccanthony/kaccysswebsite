<?php
declare(strict_types=1);
session_start();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../cnn.php';

if (!isset($_SESSION['user'])) {
    header('Location: /login.php'); exit;
}

if (!isset($_GET['state']) || $_GET['state'] !== ($_SESSION['oauth_state'] ?? null)) {
    $_SESSION['error'] = 'OAuth state mismatch, please try again.';
    header('Location: /dashboard/settings.php'); exit;
}
unset($_SESSION['oauth_state']);

if (!isset($_GET['code'])) {
    $_SESSION['error'] = 'Roblox authorization was cancelled.';
    header('Location: /dashboard/settings.php'); exit;
}

// ── Exchange the authorization code for an access token ──
$ch = curl_init('https://apis.roblox.com/oauth/v1/token');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POSTFIELDS     => http_build_query([
        'client_id'     => ROBLOX_CLIENT_ID,
        'client_secret' => ROBLOX_CLIENT_SECRET,
        'grant_type'    => 'authorization_code',
        'code'          => $_GET['code'],
        'redirect_uri'  => ROBLOX_REDIRECT_URI,
    ]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
]);
$token = json_decode((string) curl_exec($ch), true);
curl_close($ch);

if (!isset($token['access_token'])) {
    $_SESSION['error'] = 'Could not authenticate with Roblox.';
    header('Location: /dashboard/settings.php'); exit;
}

// ── Fetch the Roblox identity ──
$ch = curl_init('https://apis.roblox.com/oauth/v1/userinfo');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $token['access_token']],
]);
$robloxUser = json_decode((string) curl_exec($ch), true);
curl_close($ch);

$robloxId       = (int) $robloxUser['sub']; // Roblox user ID
$robloxUsername = $robloxUser['preferred_username'] ?? $robloxUser['name'];

$stmt = $conn->prepare("
    UPDATE accounts
    SET roblox_id = :rid, roblox_username = :rname, roblox_verified_at = now(), updated_at = now()
    WHERE discord_id = :id
");
$stmt->execute([
    'rid'   => $robloxId,
    'rname' => $robloxUsername,
    'id'    => $_SESSION['user']['id'],
]);

$_SESSION['user']['roblox_name'] = $robloxUsername;
$_SESSION['success'] = 'Roblox account linked successfully.';
header('Location: /dashboard/settings.php');
exit;