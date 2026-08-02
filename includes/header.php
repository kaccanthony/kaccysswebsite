<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/png" href="/assets/images/YSS Logo.png">
    <title><?= htmlspecialchars($pageTitle ?? 'YSS') ?></title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;600&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="/assets/css/base.css?v=<?= filemtime(__DIR__ . '/../assets/css/base.css') ?>" />

    <?php if (!empty($pageStylesheet)): ?>
    <link rel="stylesheet"
          href="/assets/css/<?= htmlspecialchars($pageStylesheet) ?>?v=<?= filemtime(__DIR__ . '/../assets/css/' . $pageStylesheet) ?>" />
    <?php endif; ?>
</head>
<body>
<div id="bg"></div>
<div id="bg-glow"></div>