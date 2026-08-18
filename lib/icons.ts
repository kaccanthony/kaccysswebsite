// FILE: lib/icons.ts
// Merged from lib/session/icons.ts (the FA5->FA7 rename map + sessionongoing's
// icon set) — that file is now gone, everything lives here. Two export shapes
// on purpose: ICONS{} for existing camelCase-key call sites (AppShell, etc.),
// and the individual faXxx named exports below for `import * as fa from
// '@/lib/icons'` call sites (SessionOngoingClient.tsx) — both point at the
// same icon objects, nothing is duplicated or re-imported twice.
import {
  faClock, faBackwardFast, faUsers, faUserTie, faCircleQuestion, faArrowRight,
  faUser, faChevronDown, faBell, faGear, faRightFromBracket, faCircleDot, faCalendar,
  faBook, faXmark, faShuffle, faArrowRightFromBracket, faArrowRotateRight, faTriangleExclamation,
  faNoteSticky, faLock, faLockOpen, faUserPlus, faUserShield, faUserSlash, faIdCard,
  faArrowUpWideShort, faBan, faChalkboardUser, faPlus, faTrash, faCaretUp, faCaretDown,
  faPlay, faPause, faCheck, faStopwatch, faClone, faCommentDots, faEye, faEyeSlash,
  faCopy, faBullhorn, faReply, faPaperPlane, faCameraRetro, faTableColumns,
  faFlagCheckered, faClipboardList, faCog, faPen, faSquareCheck,
} from '@fortawesome/free-solid-svg-icons';
import { faDiscord, faRobloxCreatorStudio, } from '@fortawesome/free-brands-svg-icons';
import { getRobloxThumbnailUrl } from './robloxThumbnails';

export const ICONS = {
  clock: faClock,
  backwardFast: faBackwardFast,
  users: faUsers,
  userTie: faUserTie,
  circleQuestion: faCircleQuestion,
  arrowRight: faArrowRight,
  user: faUser,
  chevronDown: faChevronDown,
  bell: faBell,
  gear: faGear,
  signOut: faRightFromBracket,
  circleDot: faCircleDot,
  discord: faDiscord,
  calendar: faCalendar,
  book: faBook,
  xmark: faXmark,
  shuffle: faShuffle,
  arrowRightFromBracket: faArrowRightFromBracket,
  redo: faArrowRotateRight,
  triangleExclamation: faTriangleExclamation,
  noteSticky: faNoteSticky,
  // ── merged in from lib/session/icons.ts ──
  lock: faLock,
  lockOpen: faLockOpen,
  userPlus: faUserPlus,
  userShield: faUserShield,
  userSlash: faUserSlash,
  idCard: faIdCard,
  arrowUpWideShort: faArrowUpWideShort,
  ban: faBan,
  chalkboardUser: faChalkboardUser,
  plus: faPlus,
  trash: faTrash,
  caretUp: faCaretUp,
  caretDown: faCaretDown,
  play: faPlay,
  pause: faPause,
  check: faCheck,
  stopwatch: faStopwatch,
  clone: faClone,
  commentDots: faCommentDots,
  eye: faEye,
  eyeSlash: faEyeSlash,
  copy: faCopy,
  bullhorn: faBullhorn,
  reply: faReply,
  paperPlane: faPaperPlane,
  cameraRetro: faCameraRetro,
  tableColumns: faTableColumns,
  flagCheckered: faFlagCheckered,
  clipboardList: faClipboardList,
  cog: faCog,
  pen: faPen,
  squareCheck: faSquareCheck,
  robloxCreatorStudio: faRobloxCreatorStudio,
} as const;

export type IconKey = keyof typeof ICONS;