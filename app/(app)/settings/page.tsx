// FILE: app/(app)/settings/page.tsx
// Replaces settings.php
import { getCurrentUser } from '@/lib/getCurrentUser';
import { createClient } from '@/utils/supabase/server';
import { fetchSettingsData } from '@/lib/settings';
import SettingsTabs from './SettingsTabs';
import ProfileForm from './ProfileForm';
import NotificationPreferencesForm from './NotifForm';
import SaveToast from './SaveToast';
import './settings.css';

export const metadata = {
  title: 'Settings',
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;

  const user = await getCurrentUser(); // redirects to /login internally if not signed in
  const supabase = await createClient();
  const { profile, staffProfile, isStaff, prefs, displayName } = await fetchSettingsData(supabase, user.id);
  const showStaffSettings = isStaff || (
    user.isAdmin && ['owner', 'developer'].includes((user.adminRole ?? '').trim().toLowerCase())
  );

  const savedValue = saved === 'profile' || saved === 'notifs' ? saved : null;

  return (
    <>
      {/* No #bg or <main> here, and no roleInfo/topbarName/topbarRole either —
          this page lives under app/(app)/, so AppShell (via layout.tsx)
          already renders .bg-app, wraps {children} in <main className="main">,
          and renders the real header using its own user data. All three were
          leftover duplicate work from before AppShell took over the shell. */}
    <div className="settings-page">
      <div className="page-header">
        <div>
          <div className="section-label">Account Settings</div>
          <p className="section-sub">Manage your profile and notification preferences.</p>
        </div>
        <div className="toast-wrap">
          <SaveToast saved={savedValue} />
        </div>
      </div>

      <SettingsTabs
        profilePanel={
          profile ? (
            <ProfileForm
              variant={isStaff ? 'staff' : 'user'}
              avatarUrl={profile.discord_avatar_url ?? user.avatarUrl}
              staffRank={staffProfile?.staff_rank}
              displayName={displayName}
              discordUsername={profile.discord_username ?? ''}
              discordId={profile.discord_id ?? ''}
              robloxName={profile.roblox_username ?? ''}
              hideStats={profile.hide_stats}
            />
          ) : (
            <div className="not-staff-msg">
              <p>Profile settings are not available for your account type.</p>
            </div>
          )
        }
        notifPanel={
          <NotificationPreferencesForm
            showStaffSettings={showStaffSettings}
            staffPrefs={{
              staff_session_reminder: prefs.staff_session_reminder,
              staff_reminder_time: prefs.staff_reminder_time,
              staff_trainee_sound: prefs.staff_trainee_sound,
              staff_trainee_warning: prefs.staff_trainee_warning,
              staff_trainee_warning_time: prefs.staff_trainee_warning_time,
              staff_announcement_enabled: prefs.staff_announcement_enabled,
              staff_announcement_display: prefs.staff_announcement_display,
            }}
            userPrefs={{
              user_session_reminder: prefs.user_session_reminder,
              user_reminder_time: prefs.user_reminder_time,
              user_trainee_sound: prefs.user_trainee_sound,
              user_new_session: prefs.user_new_session,
              user_cancellation: prefs.user_cancellation,
              user_browser_notifs: prefs.user_browser_notifs,
            }}
          />
        }
      />
    </div>
    </>
  );
}
