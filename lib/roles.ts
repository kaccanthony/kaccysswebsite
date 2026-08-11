// FILE: lib/roles.ts
 
// ── Rank -> prefix grouping ────────────────────────────────────────────
// Multiple staff_rank values can share one prefix (e.g. Head Staff AND
// Host Authorized both show [HS]). Order here is the fixed display order
// you specified: OM, CM, HS, ST, DEV, NSH.
const _OM_RANKS = ['Operations Manager'];
const _CM_RANKS = ['Community Manager'];
const _HS_RANKS = ['Head Staff', 'Host Authorized'];
const _ST_RANKS = ['Co-Host Authorized', 'Assistant Authorized', 'Event Authorized'];
 
export interface RoleInfo {
  rawRole: string;      // '' if not staff
  isStaff: boolean;
  isAdmin: boolean;
  // Placeholder — always true until Discord guild-membership sync
  // (guilds.members.read, discussed earlier but not wired in yet) lands.
  // Once that's built, this should reflect real server membership so
  // "N/A" actually means something instead of never firing.
  isGuildMember?: boolean;
}
 
// Returns the ordered list of prefix tags that apply — can be more than
// one (e.g. someone who's both Head Staff AND a site admin gets ['HS','DEV']).
export function getPrefixTags({ rawRole, isAdmin, isGuildMember = true }: RoleInfo): string[] {
  const tags: string[] = [];
  if (_OM_RANKS.includes(rawRole)) tags.push('OM');
  if (_CM_RANKS.includes(rawRole)) tags.push('CM');
  if (_HS_RANKS.includes(rawRole)) tags.push('HS');
  if (_ST_RANKS.includes(rawRole)) tags.push('ST');
  if (isAdmin) tags.push('DEV'); // ALWAYS "DEV" here, regardless of admin_role (owner/developer/moderator) — that stays internal-only
 
  if (tags.length === 0) {
    tags.push(isGuildMember ? 'NSH' : 'N/A');
  }
  return tags;
}
 
// e.g. "[HS][DEV] kacc4" — prefix tags glued together, then the username
export function formatNameWithPrefix(username: string, info: RoleInfo): string {
  const tags = getPrefixTags(info);
  return `${tags.map((t) => `[${t}]`).join('')} ${username}`;
}
 
// Human-readable label for the smaller "role" line under the name
export function getRoleLabel({ rawRole, isStaff, isAdmin, isGuildMember = true }: RoleInfo): string {
  if (isStaff) return rawRole; // e.g. "Head Staff"
  if (isAdmin) return 'Developer';
  return isGuildMember ? 'Non Shift Helper' : 'Non Member';
}
 
// ── Bento card catalog ──────────────────────────────────────────────
export type CardKey =
  | 'booking' | 'setup' | 'my_session' | 'active' | 'upcoming'
  | 'past' | 'staff' | 'manage_staff' | 'admin_panel';
 
export interface BentoCard {
  key: CardKey;
  label: string;
  sub: string;
  icon: string; // starts with "/" for an image icon, otherwise a key from lib/icons.ts
  href: string;
  wip?: boolean; // true = not built yet, shows a "WIP" ribbon and isn't clickable
}
 
export function getAllCards(myLiveSessionId: number | null): Record<CardKey, BentoCard> {
  return {
    booking:      { key: 'booking', label: 'Manage Session(s)', sub: 'Manager & Head Staff', icon: '/images/icons/OM.png', href: '/managesession' },
    setup:        { key: 'setup', label: 'Session Setup', sub: 'Head-Staff', icon: '/images/icons/HS.png', href: '/setupsesh', wip: true },
    my_session:   { key: 'my_session', label: 'Session Panel', sub: 'All Staff (depending on your role)', icon: '/images/icons/ST.png', href: `/sessionongoing?session_id=${myLiveSessionId ?? ''}`, wip: true },
    active:       { key: 'active', label: 'Active Session', sub: '', icon: 'clock', href: '/active'},
    upcoming:     { key: 'upcoming', label: 'Upcoming Sessions', sub: '', icon: 'clock', href: '/upcomingsesh', wip: true },
    past:         { key: 'past', label: 'Past Sessions', sub: '', icon: 'backwardFast', href: '/past', wip: true },
    staff:        { key: 'staff', label: 'Staff Overview', sub: '', icon: 'users', href: '/staff', wip: true },
    manage_staff: { key: 'manage_staff', label: 'Manage Staff', sub: 'Manager & Admin', icon: '/images/icons/OM.png', href: '/manager/managestaff', wip: true },
    admin_panel:  { key: 'admin_panel', label: 'Admin Panel', sub: 'Admin only', icon: 'userTie', href: '/admin', wip: true },
  };
}
 
// Rank -> allowed cards, for NON-admin accounts. Admins bypass this
// entirely in getVisibleCards() below and see every card that exists.
export const ROLE_CARDS: Record<string, CardKey[]> = {
  'Operations Manager': ['booking', 'setup', 'my_session', 'active', 'upcoming', 'past', 'staff', 'manage_staff'],
  'Community Manager': ['booking', 'setup', 'my_session', 'active', 'upcoming', 'past', 'staff', 'manage_staff'],
  'Head Staff': ['booking', 'setup', 'my_session', 'active', 'upcoming', 'past', 'staff'],
  'Host Authorized': ['booking', 'setup', 'my_session', 'active', 'upcoming', 'past', 'staff'],
  'Co-Host Authorized': ['my_session', 'active', 'upcoming', 'past', 'staff'],
  'Assistant Authorized': ['my_session', 'active', 'upcoming', 'past', 'staff'],
  'Event Authorized': ['my_session', 'active', 'upcoming', 'past', 'staff'],
  '': ['active', 'upcoming', 'past'], // NSH / regular community members
};
 
export interface CardsInput {
  rawRole: string;
  isAdmin: boolean;
  myLiveSessionId: number | null;
}
 
export function getVisibleCards({ rawRole, isAdmin, myLiveSessionId }: CardsInput): BentoCard[] {
  const allCards = getAllCards(myLiveSessionId);
 
  // Full admin/dev access — every card, regardless of staff rank.
  if (isAdmin) {
    return (Object.keys(allCards) as CardKey[])
      .filter((key) => key !== 'my_session' || myLiveSessionId)
      .map((key) => allCards[key]);
  }
 
  const allowedKeys = ROLE_CARDS[rawRole] ?? ROLE_CARDS[''];
  return allowedKeys
    .filter((key) => key !== 'my_session' || myLiveSessionId)
    .map((key) => allCards[key]);
}

// ── Discord role -> staff rank sync (NOT wired in yet — needs a bot token) ──
// Same as before — untouched, still waiting on a bot token + guild ID.
export const DISCORD_ROLE_MAP: Record<string, string> = {
  '1438174274098561034': 'Operations Manager',
  '1438174485206536325': 'Community Manager',
  '1359212528202285268': 'Head Staff',
  '1340249738913644564': 'Host Authorized',
  '1337409406291415100': 'Co-Host Authorized',
  '1337409841328689296': 'Assistant Authorized',
  '1500119173093785620': 'Event Authorized',
};

// adminRole gets its own unique gradient per tier — richer/more distinct
// than the staff-rank colors on purpose, since these are your rarest,
// most privileged accounts. Note: this is a color-only signal — the
// visible [DEV] text badge stays uniform across all admin tiers by
// design (from way back), this doesn't change that, it's a separate,
// quieter visual cue only.
export function getRoleColor(rawRole: string, isAdmin: boolean, adminRole?: string | null): string {
  if (isAdmin) {
    switch (adminRole) {
      case 'owner':
        return 'linear-gradient(90deg, #f38181, #ea86c6, #b09ff7, #51b8fc, #00c5d3, #5bc899, #a6c06f, #e1b172);';
      case 'developer':
        return 'linear-gradient(90deg, #da97ff, #da97ff, #da97ff, #da97ff, #c2a4ff, #8abaff, #48ccff, #00d9ff);';
      case 'moderator':
        return 'linear-gradient(165deg, #ffc7c7, #e3aabb, #c590ae, #a6779f, #86608e, #654b7b, #433768, #1a2656);';
      default:
        return 'linear-gradient(135deg, #ff5c7a, #d6294a)';
    }
  }
  if (_OM_RANKS.includes(rawRole)) return 'linear-gradient(90deg, #c631eb, #c743ed, #c852ef, #c95ff1, #cb6bf3, #cc76f4, #cd80f5, #cf8af6);';
  if (_CM_RANKS.includes(rawRole)) return 'linear-gradient(90deg, #c631eb, #c743ed, #c852ef, #c95ff1, #cb6bf3, #cc76f4, #cd80f5, #cf8af6);';
  if (_HS_RANKS.includes(rawRole)) return 'linear-gradient(90deg, #08ffe9, #00f8f6, #13f1ff, #39e9ff, #55e0ff, #6ed7ff, #83ceff, #94c5ff);';
  if (_ST_RANKS.includes(rawRole)) return 'linear-gradient(90deg, #3533cd, #313cd5, #2d45dc, #284ee4, #2256eb, #1b5ef2, #1066f8, #006eff);';
  return 'linear-gradient(90deg, #2f2f2f, #373737, #3f3f3f, #484848, #505050, #595959, #626262, #6b6b6b);';
}