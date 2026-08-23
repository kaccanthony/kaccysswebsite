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
  // Uses effectiveUsername, not user.username — a 'person' mode View As session needs
  // this to check the IMPERSONATED person's live sessions, same fix as /setup and
  // sessionongoing. 'rank' mode has no personLabel, so this still falls back to the
  // real username exactly as before.
  let myLiveSessionId: number | null = null;
  if (user.effectiveUsername) {
    const { data: liveSession } = await supabase
      .from('session_ongoing')
      .select('session_id')
      .or(
        `host.eq.${user.effectiveUsername},co_host1.eq.${user.effectiveUsername},co_host2.eq.${user.effectiveUsername},co_host3.eq.${user.effectiveUsername},co_host4_supervisor.eq.${user.effectiveUsername},assistant_1.eq.${user.effectiveUsername},assistant_2.eq.${user.effectiveUsername},assistant_3.eq.${user.effectiveUsername},assistant_4.eq.${user.effectiveUsername}`
      )
      .maybeSingle();

    myLiveSessionId = liveSession?.session_id ?? null;
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