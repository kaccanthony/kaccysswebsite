// FILE: lib/icons.ts
import {
  faClock, faBackwardFast, faUsers, faUserTie, faCircleQuestion, faArrowRight,
  faUser, faChevronDown, faBell, faGear, faRightFromBracket, faCircleDot,
} from '@fortawesome/free-solid-svg-icons';
import { faDiscord } from '@fortawesome/free-brands-svg-icons';

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
} as const;

export type IconKey = keyof typeof ICONS;