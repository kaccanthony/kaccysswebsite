// FILE: lib/manageTables.ts
//
// Ports admin_tables.php + managestaff_tables.php into one config, pointed at the ACTUAL
// Supabase schema (db.txt) instead of the old MySQL one. Nothing from the client can reach
// a raw table/column name that isn't listed here — same guarantee the PHP version had.
//
// Schema differences from the PHP version that forced changes (see MIGRATION_NOTES.md):
//  • staff_list / user_list (flat MySQL tables) don't exist anymore. Staff are
//    `profiles` rows that also have a `staff_profiles` row. That board is now `staff_directory`,
//    a JOINED board — it can't go through the generic single-table CRUD route, see
//    app/api/manage/staff-directory/route.ts.
//  • pp_staff_pp / pp_user_pp (login+password tables) are gone entirely — Supabase Auth
//    replaced them. Dropped, no equivalent needed.
//  • user_staff_notif_prefs doesn't exist as a table anymore — it's the `profiles.notif_prefs`
//    jsonb column. Dropped as a standalone board (nothing to CRUD row-by-row).
//  • Avatars are Discord CDN URLs now (`profiles.discord_avatar_url`), not uploaded blobs —
//    there is no more manual "upload avatar" flow. The `discord_avatar` column type below
//    just renders the existing URL.
//  • session_feedback_logs used to store one JSON blob column; the real schema already has it
//    broken out into real columns (setup/conflict/priority/rbtiming/overall/notes/...), so the
//    feedback_json formatter isn't needed — it "already happened" at the schema level.
//  • event_upcoming / event_log_archives actually exist in the schema now, so they've been
//    built out instead of left as `comingSoon` placeholders (pure bonus, nothing lost).
//  • site_admins is a new table (dev/owner/moderator roles) — surfaced as an Admin Only board.

export type ColumnType =
  | 'text'
  | 'number'
  | 'date'
  | 'bool'
  | 'select'
  | 'textarea'
  | 'discord_avatar'
  | 'staff_roster_json';

export interface ColumnDef {
  label: string;
  type: ColumnType;
  /** Default true. Set false to hide/lock the field when creating a row. */
  editableOnCreate?: boolean;
  /** Default true. Set false to hide/lock the field when editing a row. */
  editableOnUpdate?: boolean;
  /** Extra perm-level gate for just this column (e.g. staff_perm_level needs 20). */
  minLevel?: number;
  /** Render as a colored pill. */
  pill?: boolean;
  options?: string[];
  /** Value is a profiles.id (uuid) — resolve it to a display name client-side. */
  resolveId?: boolean;
  fallbackField?: string;
}

export interface BoardConfig {
  label: string;
  group: string;
  /** Perm level required to see this board at all (Manager+ = 15, Admin/Dev/Owner = 20). */
  minLevel: number;
  table: string;
  primaryKey: string;
  displayMode: 'table' | 'cards' | 'notification_composer';
  readOnly?: boolean;
  readOnlyReason?: string;
  comingSoon?: boolean;
  columns: Record<string, ColumnDef>;
  /** True => this board is a join across two tables and does NOT go through the generic
   *  /api/manage/records route — it has its own dedicated route. See staff_directory. */
  joined?: boolean;
}

export const GROUP_ORDER = ['Staff Management', 'Session Logs', 'Events', 'Admin Only'] as const;

export function getTableConfig(): Record<string, BoardConfig> {
  return {
    // ── Staff Management ─────────────────────────────────────────────
    staff_directory: {
      label: 'Staff Directory',
      group: 'Staff Management',
      minLevel: 15,
      table: 'staff_profiles', // joined with profiles — see staff-directory route
      primaryKey: 'id',
      displayMode: 'table',
      joined: true,
      columns: {
        id: { label: 'Profile ID', type: 'text', editableOnCreate: false, editableOnUpdate: false },
        discord_avatar_url: { label: 'Avatar', type: 'discord_avatar', editableOnCreate: false, editableOnUpdate: false },
        discord_username: { label: 'Discord Username', type: 'text', editableOnUpdate: false },
        roblox_username: { label: 'Roblox Username', type: 'text' },
        nationality: { label: 'Nationality', type: 'text' },
        staff_rank: {
          label: 'Rank', type: 'select', pill: true,
          options: ['Community Manager', 'Operations Manager', 'Head Staff', 'Co-Host Authorized', 'Assistant Authorized', 'Event Authorized'],
        },
        staff_joined: { label: 'Joined', type: 'date' },
        staff_loa: { label: 'On LOA', type: 'bool' },
        staff_quota_met: { label: 'Quota Met', type: 'bool' },
        staff_perm_level: { label: 'Perm Level', type: 'number', minLevel: 20 },
        num_sessions_attended: { label: 'Sessions Attended', type: 'number' },
        hide_stats: { label: 'Hide Stats', type: 'bool' },
      },
    },
    staff_archived: {
      label: 'Archived Staff',
      group: 'Staff Management',
      minLevel: 15,
      table: 'staff_archived',
      primaryKey: 'staff_id',
      displayMode: 'table',
      columns: {
        staff_id: { label: 'Discord ID', type: 'text', editableOnCreate: true, editableOnUpdate: false },
        staff_name: { label: 'Discord Username', type: 'text' },
        staff_display_name: { label: 'Display Name', type: 'text' },
        staff_roblox_name: { label: 'Roblox Username', type: 'text' },
        staff_nationality: { label: 'Nationality', type: 'text' },
        staff_rank: { label: 'Rank (at time of leaving)', type: 'text' },
        staff_days: { label: 'Days as Staff', type: 'number' },
        staff_num_sesh_attend: { label: 'Sessions Attended', type: 'number' },
        hide_stats: { label: 'Hide Stats', type: 'bool' },
        archived_at: { label: 'Archived', type: 'text', editableOnCreate: false, editableOnUpdate: false },
      },
    },
    staff_timeline: {
      label: 'Staff Timeline',
      group: 'Staff Management',
      minLevel: 15,
      table: 'staff_timeline',
      primaryKey: 'profile_id',
      displayMode: 'table',
      columns: {
        profile_id: { label: 'Staff', type: 'text', editableOnCreate: true, editableOnUpdate: false, resolveId: true },
        days_as_staff: { label: 'Days as Staff', type: 'number' },
        staff_nationality: { label: 'Nationality', type: 'text' },
        assist_auth_start: { label: 'Assist Auth Start', type: 'date' },
        assist_auth_end: { label: 'Assist Auth End', type: 'date' },
        cohost_auth_start: { label: 'Co-Host Auth Start', type: 'date' },
        cohost_auth_end: { label: 'Co-Host Auth End', type: 'date' },
        host_auth_start: { label: 'Host Auth Start', type: 'date' },
        host_auth_end: { label: 'Host Auth End', type: 'date' },
        manager_start: { label: 'Manager Start', type: 'date' },
        manager_end: { label: 'Manager End', type: 'date' },
      },
    },
    staff_quota: {
      label: 'Staff Quota',
      group: 'Staff Management',
      minLevel: 15,
      table: 'staff_quota',
      primaryKey: 'quota_id',
      displayMode: 'table',
      columns: {
        quota_id: { label: 'Quota ID', type: 'text', editableOnCreate: true, editableOnUpdate: false },
        profile_id: { label: 'Staff Name', type: 'text', resolveId: true },
        quota_level: { label: 'Level', type: 'number' },
        quota_period: { label: 'Period (YYYY-MM)', type: 'text' },
        quota_assist: { label: 'Assists', type: 'number' },
        quota_co_host: { label: 'Co-Hosts', type: 'number' },
        quota_session_host: { label: 'Sessions Hosted', type: 'number' },
        quota_event_host: { label: 'Events Hosted', type: 'number' },
        quota_event_co_host: { label: 'Events Co-Hosted', type: 'number' },
        quota_remark: { label: 'Remark', type: 'text' },
        quota_exemption: { label: 'Exempted', type: 'bool' },
      },
    },

    // ── Admin Only ────────────────────────────────────────────────────
    notifications: {
      label: 'Announcements',
      group: 'Admin Only',
      minLevel: 20,
      table: 'notifications',
      primaryKey: 'notif_id',
      displayMode: 'notification_composer',
      columns: {
        notif_id: { label: 'ID', type: 'number', editableOnCreate: false, editableOnUpdate: false },
        category: {
          label: 'Category', type: 'select', pill: true,
          options: ['Session', 'Event', 'Website', 'System', 'Manager', 'Admin', 'Update'],
        },
        title: { label: 'Title', type: 'text' },
        description: { label: 'Description', type: 'textarea' },
        posted_by: { label: 'Posted By', type: 'text', resolveId: true, editableOnCreate: false, editableOnUpdate: false },
        posted_at: { label: 'Posted', type: 'text', editableOnCreate: false, editableOnUpdate: false },
      },
    },
    site_admins: {
      label: 'Site Admins',
      group: 'Admin Only',
      minLevel: 20,
      table: 'site_admins',
      primaryKey: 'id',
      displayMode: 'table',
      columns: {
        id: { label: 'Profile', type: 'text', editableOnCreate: true, editableOnUpdate: false, resolveId: true },
        admin_role: { label: 'Role', type: 'select', pill: true, options: ['owner', 'developer', 'moderator'] },
        granted_at: { label: 'Granted', type: 'text', editableOnCreate: false, editableOnUpdate: false },
      },
    },

    // ── Session Logs ──────────────────────────────────────────────────
    session_ongoing: {
      label: 'Live Sessions (Snapshot)',
      group: 'Session Logs',
      minLevel: 15,
      table: 'session_ongoing',
      primaryKey: 'session_id',
      displayMode: 'cards',
      readOnly: true,
      readOnlyReason:
        'This table is actively read/written by the live session sync system every few seconds. Editing it here would race against active sessions — view only. Use the live session page itself to make changes.',
      columns: {
        session_id: { label: 'ID', type: 'number' },
        session_name: { label: 'Title', type: 'text' },
        session_status: { label: 'Status', type: 'text', pill: true },
        host: { label: 'Host', type: 'text' },
        session_date: { label: 'Date', type: 'date' },
        session_time: { label: 'Time', type: 'text' },
        num_slots: { label: 'Trainee Slots', type: 'number' },
      },
    },
    session_post_logs: {
      label: 'Post-Session Summaries',
      group: 'Session Logs',
      minLevel: 15,
      table: 'session_post_logs',
      primaryKey: 'session_id',
      displayMode: 'table',
      columns: {
        session_id: { label: 'Session ID', type: 'number', editableOnUpdate: false },
        session_name: { label: 'Title', type: 'text' },
        session_desc: { label: 'Description', type: 'textarea' },
        session_status: { label: 'Final Status', type: 'text', pill: true },
        session_date: { label: 'Date', type: 'date' },
        session_duration_expected: { label: 'Expected Duration', type: 'text' },
        session_runtime_actual: { label: 'Actual Runtime (s)', type: 'number' },
        num_slots: { label: 'Planned Slots', type: 'number' },
        actual_slots_provided: { label: 'Actual Slots', type: 'number' },
        additional_notes: { label: 'Additional Notes', type: 'textarea' },
        main_ast_notes: { label: 'Main AST Notes', type: 'textarea' },
        started: { label: 'Started', type: 'text' },
        ended: { label: 'Ended', type: 'text' },
        concluded_at: { label: 'Concluded At', type: 'text', editableOnUpdate: false },
      },
    },
    session_staff_logs: {
      label: 'Session Staff Logs',
      group: 'Session Logs',
      minLevel: 15,
      table: 'session_staff_logs',
      primaryKey: 'session_id',
      displayMode: 'table',
      columns: {
        session_id: { label: 'Session ID', type: 'number', editableOnUpdate: false },
        host: { label: 'Host', type: 'text' },
        cohost_1: { label: 'Co-Host 1', type: 'text' },
        cohost_2: { label: 'Co-Host 2', type: 'text' },
        cohost_3: { label: 'Co-Host 3', type: 'text' },
        cohost_4_supervisor: { label: 'Supervisor', type: 'text' },
        assistant_1: { label: 'Assistant 1', type: 'text' },
        assistant_2: { label: 'Assistant 2', type: 'text' },
        assistant_3: { label: 'Assistant 3', type: 'text' },
        assistant_4: { label: 'Assistant 4', type: 'text' },
        full_staff_json: { label: 'Full Roster', type: 'staff_roster_json' },
      },
    },
    session_full_logs: {
      label: 'Trainee Session Logs',
      group: 'Session Logs',
      minLevel: 15,
      table: 'session_full_logs',
      primaryKey: 'log_id',
      displayMode: 'table',
      columns: {
        log_id: { label: 'Log ID', type: 'number', editableOnUpdate: false },
        session_id: { label: 'Session ID', type: 'number' },
        trainee_id: { label: 'Trainee Discord ID', type: 'text', resolveId: true },
        trainee_roblox: { label: 'Roblox Username', type: 'text' },
        trainee_zone: { label: 'Zone', type: 'number' },
        trainee_attendance: { label: 'Attended', type: 'bool' },
        trainer_id: { label: 'Trainer Discord ID', type: 'text', resolveId: true },
        trainee_notes: { label: 'Trainee Notes', type: 'textarea' },
        staff_notes: { label: 'Staff Notes', type: 'textarea' },
        // NOTE: real schema column is `integer NOT NULL`, not boolean like the old PHP UI
        // implied — kept as a number field on purpose. See MIGRATION_NOTES.md.
        trainee_assessed: { label: 'Assessed (score)', type: 'number' },
        trainee_feedback: { label: 'Has Feedback', type: 'bool' },
        feedback_sent: { label: 'Feedback Sent', type: 'bool' },
      },
    },
    session_feedback_logs: {
      label: 'Feedback Logs',
      group: 'Session Logs',
      minLevel: 15,
      table: 'session_feedback_logs',
      primaryKey: 'log_id',
      displayMode: 'table',
      columns: {
        log_id: { label: 'Log ID', type: 'number', editableOnUpdate: false },
        session_id: { label: 'Session ID', type: 'number' },
        trainee_id: { label: 'Trainee Discord ID', type: 'text', resolveId: true },
        trainer_id: { label: 'Trainer Discord ID', type: 'text', resolveId: true },
        trains: { label: 'Trains', type: 'number' },
        setup: { label: 'Setup', type: 'text' },
        conflict: { label: 'Conflict Handling', type: 'text' },
        priority: { label: 'Prioritization', type: 'text' },
        rbtiming: { label: 'RB Timing', type: 'text' },
        overall: { label: 'Overall', type: 'text' },
        notes: { label: 'Notes', type: 'textarea' },
        setup_seconds: { label: 'Setup Time (s)', type: 'number' },
        created_at: { label: 'Created', type: 'text', editableOnCreate: false, editableOnUpdate: false },
      },
    },
    session_driver_logs: {
      label: 'Driver Logs',
      group: 'Session Logs',
      minLevel: 15,
      table: 'session_driver_logs',
      primaryKey: 'log_id',
      displayMode: 'table',
      columns: {
        log_id: { label: 'Log ID', type: 'number', editableOnUpdate: false },
        session_id: { label: 'Session ID', type: 'number' },
        discord_username: { label: 'Discord Username', type: 'text' },
        roblox_name: { label: 'Roblox Username', type: 'text' },
        attendance: { label: 'Attended', type: 'bool' },
      },
    },

    // ── Events (now buildable — schema exists, was a placeholder before) ──
    event_upcoming: {
      label: 'Upcoming Events',
      group: 'Events',
      minLevel: 15,
      table: 'event_upcoming',
      primaryKey: 'event_id',
      displayMode: 'table',
      columns: {
        event_id: { label: 'ID', type: 'number', editableOnUpdate: false },
        host: { label: 'Host', type: 'text' },
        co_hosts: { label: 'Co-Hosts', type: 'text' },
        event_name: { label: 'Title', type: 'text' },
        event_date: { label: 'Date', type: 'date' },
        event_time: { label: 'Time', type: 'text' },
        game_or_location: { label: 'Game / Location', type: 'text' },
        event_details: { label: 'Details', type: 'textarea' },
        event_additional_notes: { label: 'Additional Notes', type: 'textarea' },
        event_attendees: { label: 'Attendees', type: 'textarea' },
      },
    },
    event_log_archives: {
      label: 'Event Archives',
      group: 'Events',
      minLevel: 15,
      table: 'event_log_archives',
      primaryKey: 'event_id',
      displayMode: 'table',
      columns: {
        event_id: { label: 'ID', type: 'number', editableOnUpdate: false },
        host: { label: 'Host', type: 'text' },
        co_hosts: { label: 'Co-Hosts', type: 'text' },
        event_name: { label: 'Title', type: 'text' },
        event_date: { label: 'Date', type: 'date' },
        event_time: { label: 'Time', type: 'text' },
        game_or_location: { label: 'Game / Location', type: 'text' },
        event_details: { label: 'Details', type: 'textarea' },
        event_additional_notes: { label: 'Additional Notes', type: 'textarea' },
        event_attendees: { label: 'Attendees', type: 'textarea' },
        host_notes: { label: 'Host Notes', type: 'textarea' },
        status: { label: 'Status', type: 'text', pill: true },
      },
    },
  };
}

/** Boards a given permLevel is allowed to see, grouped + ordered like the sidebar was. */
export function visibleGroupsFor(permLevel: number): Record<string, [string, BoardConfig][]> {
  const cfg = getTableConfig();
  const groups: Record<string, [string, BoardConfig][]> = {};
  for (const g of GROUP_ORDER) groups[g] = [];
  for (const [key, board] of Object.entries(cfg)) {
    if (permLevel < board.minLevel) continue;
    groups[board.group].push([key, board]);
  }
  return groups;
}