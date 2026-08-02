// ── Shared: auto-dismiss flash alerts (login errors/success, etc.) ──
document.querySelectorAll('.alert').forEach(alert => {
    setTimeout(() => { alert.style.display = 'none'; }, 6000);
});