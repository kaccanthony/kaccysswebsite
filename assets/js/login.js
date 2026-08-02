// ── Login-page only: lagging background glow blob ──
const blob = document.getElementById('bg-glow');

if (blob) {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let blobX = mouseX;
    let blobY = mouseY;

    const LERP = 0.07; // lower = more lag (0.04 dreamy · 0.07 default · 0.15 snappy)

    document.addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    function animateBlob() {
        blobX += (mouseX - blobX) * LERP;
        blobY += (mouseY - blobY) * LERP;
        blob.style.left = blobX + 'px';
        blob.style.top = blobY + 'px';
        requestAnimationFrame(animateBlob);
    }

    animateBlob();
}

// ── Login-page only: loading state on the Discord button ──
const discordBtn = document.querySelector('.btn-discord');

if (discordBtn) {
    discordBtn.addEventListener('click', () => {
        discordBtn.classList.add('is-loading');
        discordBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Redirecting…';
    });
}