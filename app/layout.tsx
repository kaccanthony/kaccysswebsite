// FILE: app/layout.tsx
import type { Metadata } from 'next';
import { config as faConfig } from '@fortawesome/fontawesome-svg-core';
import '@fortawesome/fontawesome-svg-core/styles.css';
import './globals.css';
import VersionBadge from '@/components/VersionBadge';

// react-fontawesome injects its own <style> tag by default, which causes the
// exact class of hydration mismatch we kept hitting with the kit script.
// This turns that off — we import the CSS ourselves above instead.
faConfig.autoAddCss = false;

export const metadata: Metadata = {
  title: {
    default: 'YSS',
    template: '%s | YSS',
  },
  description: "Yoshi's Signalling Server Web — sign in and manage sessions.",
  icons: { icon: '/images/YSSLogo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;600&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        {/* Always present — login, terms, privacy, dashboard, everywhere */}
        <VersionBadge />
      </body>
    </html>
  );
}