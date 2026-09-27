// FILE: components/VersionBadge.tsx
// Position per your request: lower-LEFT. Note: the original version_badge.php
// had this at bottom-right — flag if you actually wanted to keep it there.
const YSS_VERSION = 'Alpha - v1.5.2a';

export default function VersionBadge() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        bottom: 10,
        right: 12,
        zIndex: 9999,
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontSize: '0.62rem',
        letterSpacing: '.04em',
        color: 'rgba(255,255,255,0.28)',
        background: 'transparent',
        padding: '2px 6px',
        pointerEvents: 'none',
        userSelect: 'none',
        cursor: 'default',
      }}
    >
      {YSS_VERSION}
    </div>
  );
}
