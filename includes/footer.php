<script src="https://kit.fontawesome.com/6c33013ae6.js" crossorigin="anonymous"></script>
<script src="/assets/js/main.js"></script>

<?php if (!empty($pageScript)): ?>
<script src="/assets/js/<?= htmlspecialchars($pageScript) ?>"></script>
<?php endif; ?>

<?php include __DIR__ . '/../assets/version_badge.php'; ?>
</body>
</html>