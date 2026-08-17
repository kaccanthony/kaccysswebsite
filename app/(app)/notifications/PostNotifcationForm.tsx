'use client';
// FILE: app/(app)/notifications/PostNotificationForm.tsx
// Reusable — import this into ManageBoard/adminpanel wherever the "post an
// announcement" action should live, passing `redirectTo` so the success/
// error banner lands back on the right page.

import { useRef, useState } from 'react';
import { postNotification } from './postActions';
import { NOTIFICATION_CATEGORIES } from '@/lib/notificationCategories';
import { searchProfiles, type ProfileSuggestion } from '@/lib/profileSearch';

// NOTE: matches the rank strings used elsewhere (lib/staff-helpers.ts's
// RANK_ORDER) — update this list if your actual staff_rank values differ.
const STAFF_RANKS = [
  'Operations Manager',
  'Community Manager',
  'Head Staff',
  'Host Authorized',
  'Co-Host Authorized',
  'Assistant Authorized',
  'Event Authorized',
];

type AudienceType = 'everyone' | 'rank' | 'department' | 'users';

export default function PostNotificationForm({ redirectTo = '/dashboard' }: { redirectTo?: string }) {
  const [audienceType, setAudienceType] = useState<AudienceType>('everyone');
  const [selectedUsers, setSelectedUsers] = useState<ProfileSuggestion[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileSuggestion[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearch(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setResults(await searchProfiles(v));
    }, 250);
  }

  function addUser(u: ProfileSuggestion) {
    if (!selectedUsers.some((s) => s.id === u.id)) setSelectedUsers((prev) => [...prev, u]);
    setQuery('');
    setResults([]);
  }
  function removeUser(id: string) {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== id));
  }

  return (
    <form action={postNotification} className="post-notif-form">
      <input type="hidden" name="redirect_to" value={redirectTo} />

      <div className="form-group">
        <label>Category</label>
        <select name="category" defaultValue="announcement">
          {Object.entries(NOTIFICATION_CATEGORIES).map(([key, def]) => (
            <option key={key} value={key}>{def.label}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Title</label>
        <input type="text" name="title" required placeholder="e.g. Scheduled maintenance tonight" />
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea name="description" required rows={4} placeholder="Full announcement text…" />
      </div>

      <div className="form-group">
        <label>Audience</label>
        <select name="audience_type" value={audienceType} onChange={(e) => setAudienceType(e.target.value as AudienceType)}>
          <option value="everyone">Everyone</option>
          <option value="rank">Specific Rank</option>
          <option value="department">Specific Department</option>
          <option value="users">Specific User(s)</option>
        </select>
      </div>

      {audienceType === 'rank' && (
        <div className="form-group">
          <label>Rank</label>
          <select name="audience_rank" required defaultValue="">
            <option value="" disabled>Select a rank…</option>
            {STAFF_RANKS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      )}

      {audienceType === 'department' && (
        <div className="form-group">
          <label>Department</label>
          <select name="audience_department" required defaultValue="">
            <option value="" disabled>Select a department…</option>
            <option value="operations">Operations</option>
            <option value="community">Community</option>
          </select>
        </div>
      )}

      {audienceType === 'users' && (
        <div className="form-group">
          <label>Recipients</label>
          <div className="search-wrap">
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by Discord or Roblox username…"
              autoComplete="off"
            />
            {results.length > 0 && (
              <div className="search-suggestions">
                {results.map((u) => (
                  <button type="button" key={u.id} className="search-suggestion-item" onClick={() => addUser(u)}>
                    <span className="suggestion-name">{u.discordUsername}</span>
                    <span className="suggestion-meta">{u.robloxUsername ?? 'no Roblox linked'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedUsers.length > 0 && (
            <div className="selected-users">
              {selectedUsers.map((u) => (
                <span className="user-chip" key={u.id}>
                  {u.discordUsername}
                  <input type="hidden" name="recipient_ids" value={u.id} />
                  <button type="button" onClick={() => removeUser(u.id)}>&times;</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="modal-footer">
        <button type="submit" className="btn-primary">Post Notification</button>
      </div>
    </form>
  );
}