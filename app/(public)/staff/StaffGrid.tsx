import Link from 'next/link';
import Image from 'next/image';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faIdBadge, faUser } from '@fortawesome/free-solid-svg-icons';
import { RANK_CONFIG, RANK_ORDER, colorsForStaffRank, type RankKey, type StaffMember } from '@/lib/staff-helpers';
import StaffScrollStory from './StaffScrollStory';
import StaffReveal from './StaffReveal';

function preview(member: StaffMember): { label: string; value: string }[] {
  if (member.hideStats) return [];
  const items: { label: string; value: string }[] = [];
  if (member.daysAsStaff !== null) items.push({ label: 'Days', value: String(member.daysAsStaff) });
  if (member.sessionsAttended !== null) items.push({ label: 'Sessions', value: String(member.sessionsAttended) });
  const operationsPower = member.stats.operations?.power_score;
  const communityPower = member.stats.community?.department_power_ranking ?? member.stats.community?.power_score;
  if (typeof operationsPower === 'number') items.push({ label: 'Ops power', value: operationsPower.toFixed(2) });
  if (typeof communityPower === 'number') items.push({ label: 'Comm dept power', value: communityPower.toFixed(2) });
  return items;
}

function cards(members: StaffMember[]) {
  return members.map((member, index) => {
    const stats = preview(member);
    const colors = colorsForStaffRank(member.rank);
    return (
    <Link
      key={member.id}
      href={`/staff/${encodeURIComponent(member.id)}`}
      className="staff-card"
      style={{ ['--c1' as string]: colors[0], ['--c2' as string]: colors[1], ['--reveal-delay' as string]: `${Math.min(index * 70, 280)}ms` }}
    >
      <div className="staff-card-img">
        {member.avatarUrl ? <div className="staff-card-avatar"><Image src={member.avatarUrl} alt="" fill sizes="(max-width: 560px) 100vw, (max-width: 900px) 50vw, 33vw" unoptimized loading="lazy" /></div> : <FontAwesomeIcon icon={faUser} className="staff-card-noimg" />}
      </div>
      <div className="staff-card-overlay" />
      <div className="staff-card-content">
        <div className="staff-card-name">{member.name}</div>
        {stats.length ? (
          <div className="staff-card-preview">
            {stats.map(stat => <span key={stat.label}><strong>{stat.value}</strong><small>{stat.label}</small></span>)}
          </div>
        ) : <div className="staff-card-preview-note">{member.hideStats ? 'Stats hidden' : 'Stats pending'}</div>}
        <div className="staff-card-bottom">
          <span className="staff-card-role"><FontAwesomeIcon icon={faIdBadge} /> {member.rank}</span>
          <span className="staff-card-view">View stats</span>
        </div>
      </div>
    </Link>
    );
  });
}

export default function StaffGrid({ current, archived }: { current: StaffMember[]; archived: StaffMember[] }) {
  const other = current.filter(member => !RANK_ORDER.includes(member.rank as RankKey));
  return (
    <>
      {RANK_ORDER.map(rank => {
        const members = current.filter(member => member.rank === rank);
        if (!members.length) return null;
        const config = RANK_CONFIG[rank];
        if (rank === 'Head Staff' || rank === 'Co-Host Authorized' || rank === 'Assistant Authorized') {
          return <StaffScrollStory key={rank} label={config.label} count={members.length}>{cards(members)}</StaffScrollStory>;
        }
        return (
          <StaffReveal className="staff-section" revealStyle={rank === 'Operations Manager' || rank === 'Community Manager' ? 'sides' : undefined} key={rank}>
            <div className="staff-section-head"><span className="staff-section-title">{config.label}</span><span className="staff-section-count">{members.length}</span></div>
            <div className={config.perRow ? `staff-grid staff-grid-${config.perRow}` : 'staff-row'}>{cards(members)}</div>
          </StaffReveal>
        );
      })}
      {!!other.length && <StaffReveal className="staff-section"><div className="staff-section-head"><span className="staff-section-title">Other Staff</span></div><div className="staff-grid staff-grid-3">{cards(other)}</div></StaffReveal>}
      <StaffReveal className="staff-section staff-hall-of-fame">
        <div className="staff-section-head"><span className="staff-section-title">Hall of Fame</span><span className="staff-section-count">{archived.length}</span></div>
        {archived.length ? <div className="staff-grid staff-grid-4">{cards(archived)}</div> : <p className="staff-empty">Archived staff profiles will appear here.</p>}
      </StaffReveal>
    </>
  );
}
