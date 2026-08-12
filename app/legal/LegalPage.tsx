// FILE: app/legal/LegalPage.tsx
import Link from 'next/link';
import type { LegalDoc } from '@/lib/legal-content';
import { getCurrentUserOrNull } from '@/lib/getCurrentUserOrNull';
import { getRoleLabel } from '@/lib/roles';
import AppShell from '@/app/(app)/AppShell';
import './legal.css';

const NAV_LINKS = [
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/privacy', label: 'Privacy Notice' },
  { href: '/cookies', label: 'Cookie Policy' },
] as const;

export default async function LegalPage({
  doc,
  active,
}: {
  doc: LegalDoc;
  active: (typeof NAV_LINKS)[number]['href'];
}) {
  const user = await getCurrentUserOrNull();

  const groups: { type: 'li-group' | 'h2' | 'h3' | 'p'; items?: string[]; text?: string }[] = [];
  for (const block of doc.blocks) {
    if (block.type === 'li') {
      const last = groups[groups.length - 1];
      if (last?.type === 'li-group') last.items!.push(block.text);
      else groups.push({ type: 'li-group', items: [block.text] });
    } else {
      groups.push({ type: block.type, text: block.text });
    }
  }

  const content = (
    <>
      <div className="legal-card">
        <h1 className="legal-title">{doc.title}</h1>
        <p className="legal-updated">{doc.updated}</p>
        {groups.map((g, i) => {
          if (g.type === 'h2') return <h2 className="legal-h2" key={i}>{g.text}</h2>;
          if (g.type === 'h3') return <h3 className="legal-h3" key={i}>{g.text}</h3>;
          if (g.type === 'li-group')
            return (
              <ul className="legal-list" key={i}>
                {g.items!.map((item, j) => <li key={j}>{item}</li>)}
              </ul>
            );
          return <p className="legal-p" key={i}>{g.text}</p>;
        })}
      </div>
      <nav className="legal-footer-nav">
        {NAV_LINKS.filter((l) => l.href !== active).map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
      </nav>
    </>
  );

  if (user) {
    return (
      <AppShell
        user={{
          username: user.username,
          role: getRoleLabel({ rawRole: user.rawRole, isStaff: user.isStaff, isAdmin: user.isAdmin }),
          avatarUrl: user.avatarUrl,
          rawRole: user.rawRole,
          isAdmin: user.isAdmin,
          adminRole: user.adminRole,
        }}
        // Legal pages don't need real assigned-session data — empty is fine, it just shows
        // the normal "No active sessions" pill in the profile popup.
        assignedSessions={[]}
      >
        <div className="legal-page legal-page-authed">{content}</div>
      </AppShell>
    );
  }

  return (
    <>
      <div className="bg-legal" />
      <div className="legal-page">
        <Link href="/login" className="legal-header">
          <img src="/images/YSSLogo.png" alt="" />
          <span>YSS Cenral</span>
        </Link>
        {content}
      </div>
    </>
  );
}