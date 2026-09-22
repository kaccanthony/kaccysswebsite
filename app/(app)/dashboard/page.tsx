// FILE: app/(app)/dashboard/page.tsx
import { getCurrentUser } from '@/lib/getCurrentUser';
import { getVisibleCards } from '@/lib/roles';
import { createClient } from '@/utils/supabase/server';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ICONS, type IconKey } from '@/lib/icons';
import './dashboard.css';

export const metadata = {
  title: 'Dashboard',
  description: 'Your YSS session overview.',
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  // ── Is this person currently running a live session? (for the "my_session" card) ──
  // session_ongoing has no host/co_host*/assistant* columns anymore (see db.txt) —
  // staff assignment now lives entirely in session_staff (role/staff_name rows,
  // same table managesession/setupsesh already read via findPrimaryStaff). Query
  // that instead: any session_staff row for this person, on ANY primary role
  // (HOST/CH_1-4/AST_1-4, IH-suffixed or not) or additional-staff row, whose
  // session_id also exists in session_ongoing right now.
  let myLiveSessionId: number | null = null;
  if (user.effectiveUsername) {
    const { data: staffRows, error: staffErr } = await supabase
      .from('session_staff')
      .select('session_id')
      .eq('staff_name', user.effectiveUsername);

    if (staffErr) {
      console.error('session_staff lookup failed:', staffErr.message);
    } else if (staffRows && staffRows.length > 0) {
      const candidateIds = staffRows.map((r) => r.session_id);
      const { data: liveSession, error: liveErr } = await supabase
        .from('session_ongoing')
        .select('session_id')
        .in('session_id', candidateIds)
        .maybeSingle();

      if (liveErr) console.error('session_ongoing lookup failed:', liveErr.message);
      myLiveSessionId = liveSession?.session_id ?? null;
    }
  }

  const cards = getVisibleCards({
    rawRole: user.effectiveRole,
    isAdmin: user.effectiveIsAdmin,
    myLiveSessionId,
  });

  return (
    <>
      <h1 className="section-label">Dashboard</h1>
      <p className="section-sub">Welcome back, {user.effectiveUsername}.</p>

      <div className="bento-grid">
        {cards.length === 0 ? (
          <div className="bento-empty">
            <FontAwesomeIcon icon={ICONS.circleQuestion} />
            Nothing available for your role yet.
          </div>
        ) : (
          cards.map((card, i) => {
            const inner = (
              <>
                {card.wip && <span className="bento-ribbon">WIP</span>}
                <div className="bento-icon">
                  {card.icon.startsWith('/') ? (
                    <img src={card.icon} alt="" width={20} height={20} draggable={false} />
                  ) : (
                    <FontAwesomeIcon icon={ICONS[card.icon as IconKey]} />
                  )}
                </div>
                <div className="bento-text">
                  <div className="bento-label">{card.label}</div>
                  {card.sub && <div className="bento-sub">{card.sub}</div>}
                </div>
                {!card.wip && <FontAwesomeIcon icon={ICONS.arrowRight} className="bento-arrow" />}
              </>
            );

            return card.wip ? (
              <div
                key={card.key}
                className="bento-card bento-card-disabled"
                style={{ ['--i' as string]: i }}
              >
                {inner}
              </div>
            ) : (
              <a key={card.key} href={card.href} className="bento-card" style={{ ['--i' as string]: i }}>
                {inner}
              </a>
            );
          })
        )}
      </div>
    </>
  );
}