// FILE: app/privacy/page.tsx
import LegalPage from '../legal/LegalPage';
import { PRIVACY_DOC } from '@/lib/legal-content';

export const metadata = { title: 'Privacy Notice' };

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY_DOC} active="/privacy" />;
}