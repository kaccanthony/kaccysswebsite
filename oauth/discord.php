<?php
declare(strict_types=1);
session_start();
require_once __DIR__ . '/../config.php';

$state = bin2hex(random_bytes(16));
$_SESSION['oauth_state'] = $state;

$params = http_build_query([
    'client_id'     => DISCORD_CLIENT_ID,
    'redirect_uri'  => DISCORD_REDIRECT_URI,
    'response_type' => 'code',
    'scope'         => 'identify',
    'state'         => $state,
]);

header('Location: https://discord.com/oauth2/authorize?' . $params);
exit;