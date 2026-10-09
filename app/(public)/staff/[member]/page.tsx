import { notFound } from 'next/navigation';
import Image from 'next/image';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { getPublicStaffMember } from '@/lib/staff';
import { colorsForStaffRank } from '@/lib/staff-helpers';

const metrics = {
  operations: [
    { key: 'weighted_contribution', label: 'Weighted contribution', fractional: false },
    { key: 'consistency', label: 'Activity consistency', fractional: false },
    { key: 'leadership_ratio', label: 'Leadership ratio', fractional: true },
  ],
  community: [
    { key: 'runtime_hours', label: 'Operating hours', fractional: false },
    { key: 'weighted_hosting', label: 'Weighted hosting', fractional: false },
    { key: 'average_turnout', label: 'Average lobby turnout', fractional: false },
    { key: 'tag_versatility', label: 'Tag versatility index', fractional: true },
  ],
} as const;

const rankings = {
  operations: [
    { key: 'power_score', label: 'Staff power score', ordinal: false },
    { key: 'power_rank', label: 'Staff power rank', ordinal: true },
  ],
  community: [
    { key: 'department_power_ranking', label: 'Department power score', ordinal: false },
    { key: 'power_rank', label: 'Department power rank', ordinal: true },
  ],
} as const;

function formatMetric(key: string, value: number) {
  if (key === 'leadership_ratio') return `${(value * 100).toFixed(1)}%`;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function formatStatsDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function MetricDonut({ label, metricKey, value, fractional, accent }: {
  label: string;
  metricKey: string;
  value: number;
  fractional: boolean;
  accent: string;
}) {
  const progress = Math.max(0, Math.min(100, fractional ? value * 100 : value));
  return (
    <article className="metric-ticket" aria-label={`${label}: ${formatMetric(metricKey, value)}`}>
      <div className="metric-donut" aria-hidden="true">
        <svg viewBox="0 0 42 42">
          <circle className="metric-donut-track" cx="21" cy="21" r="15.9155" pathLength="100" />
          <circle
            className="metric-donut-value"
            cx="21"
            cy="21"
            r="15.9155"
            pathLength="100"
            stroke={accent}
            strokeDasharray={`${progress} ${100 - progress}`}
          />
        </svg>
        <strong>{progress.toFixed(1)}<small>%</small></strong>
      </div>
      <div className="metric-ticket-copy">
        <span>{label}</span>
        <small>{formatMetric(metricKey, value)} raw value · out of 100.0</small>
      </div>
    </article>
  );
}

export default async function StaffMemberPage({ params }: { params: Promise<{ member: string }> }) {
  const { member } = await params;
  const staff = await getPublicStaffMember(decodeURIComponent(member));
  if (!staff) notFound();
  const [roleColor, roleColorLight] = colorsForStaffRank(staff.rank);

  return (
    <div className="staff-public-page">
      <div className="member-detail-card">
        <div className="member-detail-avatar" style={{ ['--c1' as string]: roleColor, ['--c2' as string]: roleColorLight }}>
          {staff.avatarUrl ? <Image src={staff.avatarUrl} alt="" width={96} height={96} unoptimized /> : <FontAwesomeIcon icon={faUser} />}
        </div>
        <div className="member-detail-name">{staff.name}</div>
        <div className="member-detail-rank">{staff.rank}{staff.archived ? ' · Hall of Fame' : ''}</div>
        {staff.robloxProfileUrl && (
          <a className="member-roblox-link" href={staff.robloxProfileUrl} target="_blank" rel="noreferrer">
            View Roblox profile
          </a>
        )}
        {staff.nationality && <div className="member-detail-nationality">{staff.nationality}</div>}

        {staff.hideStats ? (
          <div className="member-detail-soon"><FontAwesomeIcon icon={faEyeSlash} /> This member has hidden their stats.</div>
        ) : (
          <>
            <div className="member-detail-stats">
              {staff.daysAsStaff !== null && <div className="member-stat"><div className="member-stat-value">{staff.daysAsStaff}</div><div className="member-stat-label">Days as Staff</div></div>}
              {staff.sessionsAttended !== null && <div className="member-stat"><div className="member-stat-value">{staff.sessionsAttended}</div><div className="member-stat-label">Sessions Attended</div></div>}
              {staff.joined && <div className="member-stat"><div className="member-stat-value">{new Date(`${staff.joined}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</div><div className="member-stat-label">Joined</div></div>}
            </div>
            {(['operations', 'community'] as const).map(department => {
              const values = staff.stats[department];
              const visibleMetrics = metrics[department].filter(({ key }) => typeof values?.[key] === 'number');
              const visibleRankings = rankings[department].filter(({ key }) => typeof values?.[key] === 'number');
              if (!visibleMetrics.length) return null;
              return <section className="member-department" key={department}>
                <h2>{department === 'operations' ? 'Operations' : 'Community'}</h2>
                <div className="member-metric-grid">
                  {visibleMetrics.map(({ key, label, fractional }) => (
                    <MetricDonut
                      key={key}
                      label={label}
                      metricKey={key}
                      value={values![key]}
                      fractional={fractional}
                      accent={department === 'operations' ? roleColor : roleColorLight}
                    />
                  ))}
                </div>
                {!!visibleRankings.length && (
                  <div className="member-ranking-strip">
                    {visibleRankings.map(({ key, label, ordinal }) => (
                      <div className="member-ranking-item" key={key}>
                        <span>{label}</span>
                        <strong>{ordinal ? `#${values![key]}` : formatMetric(key, values![key])}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </section>;
            })}
            {staff.statsAsOf && <p className="member-stats-note">Stats last updated at {formatStatsDate(staff.statsAsOf)}</p>}
          </>
        )}
      </div>
    </div>
  );
}
