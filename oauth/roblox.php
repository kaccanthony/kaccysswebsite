<?php
declare(strict_types=1);
session_start();
require_once __DIR__ . '/../config.php';

if (!isset($_SESSION['user'])) {
    header('Location: /login.php'); exit;
}

$state = bin2hex(random_bytes(16));
$_SESSION['oauth_state'] = $state;

$params = http_build_query([
    'client_id'     => ROBLOX_CLIENT_ID,
    'redirect_uri'  => ROBLOX_REDIRECT_URI,
    'response_type' => 'code',
    'scope'         => 'openid profile',
    'state'         => $state,
]);

header('Location: https://apis.roblox.com/oauth/v2/authorize?' . $params);
exit;