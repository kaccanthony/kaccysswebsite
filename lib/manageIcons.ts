// FILE: lib/manageIcons.ts
// Maps every fa-solid class used by the old admin.php / managestaff.php / admin.js /
// managestaff.js kit script (fa-*) onto @fortawesome/free-solid-svg-icons imports for
// FontAwesome 7.3.1 (package major version doesn't change these icon names from FA6 —
// only a handful of FA5-era names were renamed, listed in the comments below).
import {
  faArrowLeft,       // fa-arrow-left        (back-btn)
  faUser,             // fa-user              (avatar fallback)
  faChevronDown,      // fa-chevron-down      (profile chevron)
  faBell,             // fa-bell              (notifications link)
  faGear,             // fa-cog  -> renamed faGear in FA6+
  faRightFromBracket, // fa-sign-out-alt -> renamed faRightFromBracket in FA6+
  faPlus,             // fa-plus              (Add Record)
  faXmark,            // fa-times -> renamed faXmark in FA6+ (modal close)
  faPen,              // fa-pen               (edit row)
  faTrash,            // fa-trash             (delete row)
  faCircleCheck,      // fa-check-circle -> renamed faCircleCheck in FA6+
  faCircleXmark,      // fa-times-circle -> renamed faCircleXmark in FA6+
  faCircleInfo,       // fa-info-circle -> renamed faCircleInfo in FA6+
  faInbox,            // fa-inbox             (empty state)
  faHammer,           // fa-hammer            (coming soon)
  faSort,             // fa-sort              (unsorted column)
  faSortUp,           // fa-sort-up           (asc column)
  faSortDown,         // fa-sort-down         (desc column)
  faFlagCheckered,    // fa-flag-checkered    (force conclude)
  faTriangleExclamation, // fa-exclamation-triangle -> renamed faTriangleExclamation in FA6+
  faMagnifyingGlass,  // used for the search input's placeholder icon (new, optional)
  faUserTie,          // Admin Only group / site_admins board
} from '@fortawesome/free-solid-svg-icons';

export const MANAGE_ICONS = {
  back: faArrowLeft,
  user: faUser,
  chevronDown: faChevronDown,
  bell: faBell,
  gear: faGear,
  signOut: faRightFromBracket,
  plus: faPlus,
  close: faXmark,
  pen: faPen,
  trash: faTrash,
  checkCircle: faCircleCheck,
  timesCircle: faCircleXmark,
  infoCircle: faCircleInfo,
  inbox: faInbox,
  hammer: faHammer,
  sort: faSort,
  sortUp: faSortUp,
  sortDown: faSortDown,
  flagCheckered: faFlagCheckered,
  warningTriangle: faTriangleExclamation,
  search: faMagnifyingGlass,
  userTie: faUserTie,
} as const;

export type ManageIconKey = keyof typeof MANAGE_ICONS;