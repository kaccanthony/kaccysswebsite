'use client';
// FILE: app/settings/ProfileForm.tsx
// Ported from the staff/user profile <form> blocks in settings.php + the
// submitProfileForm() confirm-modal gating in settings.js.
//
// Avatar upload and password-change were dropped per your OAuth setup —
// the avatar shown here is read-only, sourced straight from Discord/Roblox.
import { createClient } from '@/utils/supabase/client';
import { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faIdCard, faSignature, faGamepad, faFingerprint, faEyeSlash, faRotate } from '@fortawesome/free-solid-svg-icons';
import { faDiscord as faDiscordBrand } from '@fortawesome/free-brands-svg-icons';
import { saveProfile } from './actions';

export interface ProfileFormProps {
  variant: 'staff' | 'user';
  avatarUrl: string | null;
  staffRank?: string;
  displayName: string;
  discordUsername: string;
  discordId: string;
  robloxName: string;
  hideStats: boolean;
}

export default function ProfileForm({
  variant,
  avatarUrl,
  staffRank,
  displayName,
  discordUsername,
  discordId,
  robloxName,
  hideStats,
}: ProfileFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isStaff = variant === 'staff';

    async function handleSyncDiscord() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
        scopes: 'identify guilds.members.read', // must match LoginForm.tsx's scopes exactly
      },
    });
  }

  return (
    <>
      <form ref={formRef} action={saveProfile}>
        <div className="settings-section">
          <div className="settings-section-title">
            <FontAwesomeIcon icon={faIdCard} /> {isStaff ? 'Staff Profile' : 'User Profile'}
          </div>
          {isStaff && (
            <p className="settings-section-desc">
              Changes to your display name and Roblox username will be reflected across the platform.
            </p>
          )}

          <div className="profile-header-row">
            <div className="profile-avatar-wrap">
              <div className="profile-avatar-big">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <i className="fas fa-user" />
                )}
              </div>
            </div>

            <div className="profile-avatar-info">
              <div className="profile-avatar-name">{displayName || discordUsername}</div>
              {isStaff ? (
                <div className="profile-avatar-role">{staffRank}</div>
              ) : (
                <div className="profile-avatar-hint">Avatar is synced from your Discord account.</div>
              )}
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Display Name</label>
              <div className="form-input-wrap">
                <FontAwesomeIcon icon={faSignature} className="form-input-icon" />
                <input
                  type="text"
                  name="display_name"
                  className="form-input"
                  maxLength={isStaff ? 200 : 50}
                  placeholder="How you appear on the platform"
                  defaultValue={displayName}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Discord Username <span className="form-label-hint">read-only</span></label>
              <div className="form-input-wrap">
                <FontAwesomeIcon icon={faDiscordBrand} className="form-input-icon" />
                <input
                    type="text"
                    name="discord_username"
                    className="form-input readonly"
                    readOnly
                    maxLength={isStaff ? 200 : 100}
                  placeholder="your_discord_username"
                  defaultValue={discordUsername}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Discord ID <span className="form-label-hint">read-only</span>
              </label>
              <div className="form-input-wrap">
                <FontAwesomeIcon icon={faFingerprint} className="form-input-icon" />
                <input type="text" className="form-input readonly" value={discordId} readOnly />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Roblox Username <span className="form-label-hint">read-only</span></label>
              <div className="form-input-wrap">
                <FontAwesomeIcon icon={faGamepad} className="form-input-icon" />
                <input
                    type="text"
                    name="roblox_name"
                    className="form-input readonly"
                    readOnly
                    maxLength={100}
                  placeholder="Your Roblox username"
                  defaultValue={robloxName}
                />
              </div>
            </div>
          </div>

          <div className="notif-card" style={{ marginTop: 16 }}>
            <div className="notif-card-left">
              <div className="notif-icon-wrap purple">
                <FontAwesomeIcon icon={faRotate} />
              </div>
              <div className="notif-info">
                <div className="notif-title">Re-sync Account Info</div>
                <div className="notif-desc">
                  Discord username/avatar/role and Roblox username only update when you sign in
                  — pull the latest now instead of waiting for your next login.
                </div>
              </div>
            </div>
            <div className="notif-card-right" style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-ghost" onClick={handleSyncDiscord}>
                Sync Discord
              </button>
              <a className="btn-ghost" href="/auth/roblox?next=/settings" style={{ textDecoration: 'none' }}>
                Sync Roblox
              </a>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-save" onClick={() => setConfirmOpen(true)}>
              <FontAwesomeIcon icon={faIdCard} /> Save Profile
            </button>
          </div>
        </div>
      </form>

      <div className={`confirm-backdrop${confirmOpen ? ' open' : ''}`}>
        <div className="confirm-box" role="dialog" aria-modal="true">
          <h3>Save changes?</h3>
          <p>Review the fields below and confirm you want to save these profile changes.</p>
          <div className="confirm-footer">
            <button
              type="button"
              className="btn-ghost"
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1.5px solid rgba(255,255,255,.12)',
                background: 'transparent',
                color: '#a0a0b0',
                fontSize: 13,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-save"
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent, #6c63ff)',
                color: '#fff',
                fontSize: 13,
                fontFamily: 'inherit',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => {
                setConfirmOpen(false);
                formRef.current?.requestSubmit();
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
