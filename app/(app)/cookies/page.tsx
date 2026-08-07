// FILE: app/cookies/page.tsx
import LegalPage from '../legal/LegalPage';
import { COOKIE_DOC } from '@/lib/legal-content';

export const metadata = { title: 'Cookie Policy' };

export default function CookiesPage() {
  return <LegalPage doc={COOKIE_DOC} active="/cookies" />;
}