'use client';
// FILE: app/(app)/notifications/NotificationsClient.tsx

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckDouble, faInbox, faUser } from '@fortawesome/free-solid-svg-icons';
import { getCategoryDef } from '@/lib/notificationCategories';
import { markNotificationRead, markAllRead } from './actions';
import type { NotificationRow } from '@/lib/notifications';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotificationsClient({ notifications }: { notifications: NotificationRow[] }) {
  const [localRead, setLocalRead] = useState<Set<number>>(new Set(notifications.filter((n) => n.is_read).map((n) => n.notif_id)));

  const unreadCount = notifications.filter((n) => !localRead.has(n.notif_id)).length;
  const allIds = notifications.map((n) => n.notif_id).join(',');

  function handleCardClick(notifId: number) {
    if (localRead.has(notifId)) return;
    setLocalRead((prev) => new Set(prev).add(notifId));
    const fd = new FormData();
    fd.set('notif_id', String(notifId));
    markNotificationRead(fd);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="section-label">Notifications</div>
          <p className="section-sub">
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <form
            action={markAllRead}
            onSubmit={() => setLocalRead(new Set(notifications.map((n) => n.notif_id)))}
          >
            <input type="hidden" name="notif_ids" value={allIds} />
            <button type="submit" className="btn-ghost">
              <FontAwesomeIcon icon={faCheckDouble} /> Mark all read
            </button>
          </form>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="empty-state">
          <FontAwesomeIcon icon={faInbox} />
          <p>No notifications yet.</p>
        </div>
      ) : (
        <div className="notif-list">
          {notifications.map((n) => {
            const isRead = localRead.has(n.notif_id);
            const cat = getCategoryDef(n.category);
            return (
              <button
                type="button"
                key={n.notif_id}
                className={`notif-card${isRead ? ' read' : ' unread'}`}
                style={{ '--accent': cat.color } as React.CSSProperties}
                onClick={() => handleCardClick(n.notif_id)}
              >
                <div className="notif-icon" style={{ color: cat.color }}>
                  <FontAwesomeIcon icon={cat.icon} />
                </div>
                <div className="notif-body">
                  <div className="notif-top-row">
                    <span className="notif-category">{cat.label}</span>
                    <span className="notif-time">{timeAgo(n.posted_at)}</span>
                  </div>
                  <div className="notif-title">{n.title}</div>
                  <div className="notif-desc">{n.description}</div>
                  {n.posted_by_name && (
                    <div className="notif-poster">
                      {n.posted_by_avatar ? (
                        <img src={n.posted_by_avatar} alt="" className="notif-poster-avatar" />
                      ) : (
                        <FontAwesomeIcon icon={faUser} className="notif-poster-avatar-fallback" />
                      )}
                      {n.posted_by_name}
                    </div>
                  )}
                </div>
                {!isRead && <span className="notif-dot" />}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}