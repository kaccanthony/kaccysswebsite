<?php
declare(strict_types=1);

ini_set('session.gc_maxlifetime', 86400);
session_set_cookie_params([
    'lifetime' => 86400,
    'path'     => '/',
    'secure'   => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

require_once __DIR__ . '/cnn.php';

$error   = $_SESSION['error']   ?? '';
$success = $_SESSION['success'] ?? '';
unset($_SESSION['error'], $_SESSION['success']);

if (isset($_SESSION['user'])) {
    header('Location: /dashboard/dashboard.php');
    exit;
}

// ── Remember-me cookie (staff only, same as before — just PDO now) ──
if (isset($_COOKIE['remember_token'])) {
    $stmt = $conn->prepare("
        SELECT s.user_id, s.user_name, l.staff_rank, l.staff_perm_level, l.staff_roblox_name
        FROM pp_staff_pp s
        LEFT JOIN staff_list l ON l.staff_id = s.user_id
        WHERE s.remember_token = :token
    ");
    $stmt->execute(['token' => $_COOKIE['remember_token']]);
    $row = $stmt->fetch();

    if ($row) {
        $_SESSION['user'] = [
            'id'          => $row['user_id'],
            'username'    => $row['user_name'],
            'role'        => $row['staff_rank'],
            'perm_level'  => $row['staff_perm_level'],
            'roblox_name' => $row['staff_roblox_name'],
            'is_staff'    => true,
        ];
        header('Location: /dashboard/dashboard.php');
        exit;
    }

    setcookie('remember_token', '', time() - 3600, '/', '', true, true);
}

$pageTitle      = 'YSS - Login';
$pageStylesheet = 'login.css';
$pageScript     = 'login.js';
include __DIR__ . '/includes/header.php';
?>

<div id="bg-glow"></div>

<div class="card login-card">
    <h1>Yoshi's Signalling Server Web</h1>
    <p class="subtitle">Sign in to continue</p>

    <?php if ($error): ?><div class="alert alert-error"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="alert alert-success"><?= htmlspecialchars($success) ?></div><?php endif; ?>

    <a href="/oauth/discord.php" class="btn-login btn-discord">
        <i class="fa-brands fa-discord"></i> Continue with Discord
    </a>

    <p class="login-note">
        First time here? Signing in with Discord creates your account automatically.
        You can link your Roblox account afterward from your dashboard settings.
    </p>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>