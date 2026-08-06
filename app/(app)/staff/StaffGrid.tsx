'use client';
// FILE: app/(app)/staff/StaffGrid.tsx

import { useEffect } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faUserSlash, faHourglassHalf, faIdBadge } from '@fortawesome/free-solid-svg-icons';
import {
  RANK_ORDER,
  RANK_CONFIG,
  headStaffSuffix,
  aosForPosition,
  type RankKey,
  type StaffMember,
} from '@/lib/staff-helpers';
import 'aos/dist/aos.css';
// staff.css is imported once by page.tsx (the parent route) — not duplicated here.

export default function StaffGrid({ staffByRank }: { staffByRank: Record<RankKey, StaffMember[]> }) {
  // Same AOS.init() the old staff.php pulled in via <script src="aos.js">.
  // Requires the `aos` package: npm install aos
  useEffect(() => {
    import('aos').then(({ default: AOS }) => AOS.init());
  }, []);

  return (
    <>
      {RANK_ORDER.map((rankKey) => {
        const cfg = RANK_CONFIG[rankKey];
        const members = staffByRank[rankKey] ?? [];
        if (members.length === 0 && !cfg.comingSoon) return null; // skip empty real groups silently

        const rowClass = cfg.perRow === 0 ? 'staff-row' : `staff-grid staff-grid-${cfg.perRow}`;
        const rowSize = cfg.perRow === 0 ? members.length : cfg.perRow;

        return (
          <section className="staff-section" key={rankKey}>
            <div className="staff-section-head">
              <span className="staff-section-title">{cfg.label}</span>
              <span className="staff-section-count">{members.length}</span>
            </div>

            {cfg.comingSoon ? (
              <div className="staff-coming-soon">
                <FontAwesomeIcon icon={faHourglassHalf} /> Not yet implemented on our end.
              </div>
            ) : members.length === 0 ? (
              <div className="staff-coming-soon">
                <FontAwesomeIcon icon={faUserSlash} /> No one currently holds this rank.
              </div>
            ) : (
              <div className={rowClass}>
                {members.map((m, i) => {
                  const suffix = rankKey === 'Head Staff' ? headStaffSuffix(m) : '';
                  const posInRow = rowSize > 0 ? i % rowSize : 0;
                  const aosAnim = aosForPosition(posInRow, rowSize);

                  return (
                    <Link
                      key={m.id}
                      href={`/staff/${encodeURIComponent(m.name)}`}
                      className="staff-card"
                      data-aos={aosAnim}
                      data-aos-delay={posInRow * 80}
                      data-aos-duration="600"
                      style={{ ['--c1' as string]: cfg.colors[0], ['--c2' as string]: cfg.colors[1] }}
                    >
                      <div
                        className="staff-card-img"
                        style={m.avatarUrl ? { backgroundImage: `url('${m.avatarUrl}')` } : undefined}
                      >
                        {!m.avatarUrl && <FontAwesomeIcon icon={faUser} className="staff-card-noimg" />}
                      </div>
                      <div className="staff-card-overlay" />
                      <div className="staff-card-content">
                        <div className="staff-card-name">{m.name}</div>
                        <div className="staff-card-bottom">
                          <span className="staff-card-role">
                            <FontAwesomeIcon icon={faIdBadge} /> {cfg.label + suffix}
                          </span>
                          <span className="staff-card-view">View</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}