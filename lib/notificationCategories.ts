// FILE: lib/notificationCategories.ts
// Fixed set of categories — icon/color are decided here, once, so every
// place that renders a notification doesn't have to guess at unknown
// strings. Add a new category by adding one entry here; nothing else in
// the app needs to change to support it.

import {
  faBullhorn, faCalendarDay, faScrewdriverWrench, faTriangleExclamation, faCircleInfo,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

export interface NotificationCategoryDef {
  label: string;
  icon: IconDefinition;
  color: string; // used for the left accent bar / icon tint
}

export const NOTIFICATION_CATEGORIES = {
  announcement: { label: 'Announcement', icon: faBullhorn, color: '#7c9eff' },
  session: { label: 'Session Update', icon: faCalendarDay, color: '#4ade80' },
  maintenance: { label: 'Maintenance', icon: faScrewdriverWrench, color: '#ffb454' },
  urgent: { label: 'Urgent', icon: faTriangleExclamation, color: '#ff6b6b' },
} as const satisfies Record<string, NotificationCategoryDef>;

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;

export function getCategoryDef(category: string): NotificationCategoryDef {
  return (NOTIFICATION_CATEGORIES as Record<string, NotificationCategoryDef>)[category] ?? {
    label: category,
    icon: faCircleInfo,
    color: 'rgba(255,255,255,0.4)',
  };
}