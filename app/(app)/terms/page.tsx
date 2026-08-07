// FILE: app/terms/page.tsx
import LegalPage from '../legal/LegalPage';
import { TERMS_DOC } from '@/lib/legal-content';

export const metadata = { title: 'Terms & Conditions' };

export default function TermsPage() {
  return <LegalPage doc={TERMS_DOC} active="/terms" />;
}