// types/session.ts
// session_ongoing core columns plus UI-only fields hydrated from the normalized
// session_staff/session_trainees tables in database/current_db.sql.

export interface SessionOngoingRow {
  session_id: number;
  session_status: string;
  session_name: string | null;
  session_desc: string | null;
  session_duration: string;
  num_slots: number;
  trainer_assignment_mode: 'auto' | 'manual';
  // UI-only assignment fields. They are not physical session_ongoing columns.
  host: string;
  co_host1: string | null;
  co_host2: string | null;
  co_host3: string | null;
  co_host4_supervisor: string | null;
  assistant_1: string | null;
  assistant_2: string | null;
  assistant_3: string | null;
  assistant_4: string | null;
  session_date: string;
  session_time: string;
  started_at: string | null;
  trainee_timer: number;
  // UI-only compact attendance snapshot hydrated from session_trainees.
  trainee_attendance: string;
  additional_notes: string | null;
  live_state: LiveState | null;
  last_updated: string | null;
  // trainee_{1..10}_{name,discord,discord_id,zone,note,trainer_name}
  [key: `trainee_${number}_name`]: string | null;
  [key: `trainee_${number}_discord`]: string | null;
  [key: `trainee_${number}_discord_id`]: string | null;
  [key: `trainee_${number}_zone`]: number | null;
  [key: `trainee_${number}_note`]: string | null;
  [key: `trainee_${number}_trainer_name`]: string | null;
}

export interface TimerState {
  remainingSeconds: number;
  running: boolean;
  syncedAt: number; // epoch ms
  setupSeconds?: number | null;
}

export interface DriverRow {
  sourceRowId?: number;
  discord: string;
  roblox: string;
  attended: boolean;
}

export interface StaffShiftRow {
  sourceRowId?: number;
  role: 'Main AST' | 'Assistant' | 'Co-Host' | 'Internal Helper';
  discord: string;
  notes: string;
  attended: boolean;
}

export interface FeedbackFields {
  trains: string;
  setup: string;
  conflict: string;
  priority: string;
  rbtiming: string;
  overall: string;
  notes: string;
  setupSeconds?: number | null;
}

export type FeedbackDataMap = Record<string, FeedbackFields>;

export interface UnallocatedTrainee {
  uid: string;
  discord: string;
  discordId: string;
  roblox: string;
  zone: string;
  notes: string;
  trainerName: string;
}

export interface TimeTracker {
  briefingStart?: number;
  sgShiftStart?: number;
  screenieTime?: number;
}

export interface LiveTraineeRow {
  discord: string;
  discordId: string;
  roblox: string;
  zone: string;
  notes: string;
  trainerName: string;
  attended: boolean;
}

export interface AnnouncementPayload {
  id: string;
  message: string;
  senderName: string;
  sentAt: number;
}

export interface OverridesState {
  'session-details': boolean;
  trainees: boolean;
  'staff-roles': boolean;
  'drivers-disable': boolean;
  'slot-order': boolean;
  'staff-delete': boolean;
  'trainee-details': boolean;
  'trainer-details': boolean;
  'staff-addition': boolean;
  'allow-all': boolean;
}

export interface LiveState {
  sessionHost?: string | null;
  trainees?: Record<string, LiveTraineeRow>;
  timers?: Record<string, TimerState>;
  drivers?: DriverRow[];
  staffShift?: StaffShiftRow[];
  feedbackData?: FeedbackDataMap;
  completedRows?: Record<string, boolean>;
  slotOrder?: string[];
  unallocatedTrainees?: UnallocatedTrainee[];
  timeTracker?: TimeTracker;
  mainAstNotes?: string;
  overrides?: OverridesState;
  announcement?: AnnouncementPayload | null;
}

// ── Bell system (was file-based JSON in bell_state.php; now a DB table, see supabase/sql) ──
export type BellRole = 'host' | 'cohost' | 'assistant';

export interface BellStateRow {
  session_id: number;
  active: boolean;
  initiator_role: BellRole | null;
  initiator_client: string | null;
  acks: Record<BellRole, boolean>;
  ring_started_at: string | null; // timestamptz
  last_ring_at: string | null;
  ring_count: number;
  cooldown_until: string | null;
  updated_at: string;
}

export type ViewerRole = 'Host' | 'Co-Host' | 'Assistant';
export type MyRole = 'host' | 'cohost' | 'assistant';
