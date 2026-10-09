'use client';
// app/(app)/sessionongoing/SessionOngoingClient.tsx
// Replaces sessionongoing.js. Same markup/classes as the original so
// sessionongoing.module.css applies unchanged — only the data layer moved from
// polling sync_session.php to Supabase Realtime + the /api/session/[id]/* routes.
//
// PARITY NOTE: the trainee table (including resizable/hideable columns),
// overrides, status/conclude flow, drivers, staff, bell widget, announcements,
// time tracker, feedback modal, station generator, and Document
// Picture-in-Picture pop-outs are fully ported below. One DOM-heavy widget
// from the original — the draggable floating notes panel — is still stubbed
// (see the `// TODO(port): ...` marker).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ICONS, type IconKey } from '@/lib/icons';
import { useSessionRealtime } from '@/lib/supabase/useSessionRealtime';
import { useBellRealtime } from '@/lib/supabase/useBellRealtime';
import { useAnnouncementBroadcast } from '@/lib/supabase/useAnnouncementBroadcast';
import { useSessionActivityBroadcast } from '@/lib/supabase/useSessionActivityBroadcast';
import ToastStack, { type ToastEntry, type ToastKind } from '@/components/ToastStack';
import { useLiveSessionActions } from '../LiveSessionContext';
import { ZONE_DATA, ZONES, ANNOUNCEMENT_TEMPLATE, SCRIPT_LINES, STATION_LIST, buildStationAnnouncement, STAFF_ROLES, buildReportText } from '@/lib/session/constants';
import type {
  SessionOngoingRow, LiveState, TimerState, DriverRow, StaffShiftRow, FeedbackDataMap,
  UnallocatedTrainee, TimeTracker, OverridesState, AnnouncementPayload, BellStateRow,
  ViewerRole, MyRole,
} from '@/types/session';
import styles from './sessionongoing.module.css';
import { formatInstantInSiteTimezone, type SiteTimezoneMode } from '@/lib/siteTimezone';
import { countSessionTraineeSlots, isWithinSessionTraineeLimit, MAX_SESSION_TRAINEES, SESSION_TRAINEE_LIMIT_MESSAGE } from '@/lib/session/traineeLimit';
import FeedbackImages, { type FeedbackImage } from './FeedbackImages';
import { getSessionControlAccess } from '@/lib/session/controlPermissions';
import { BRIEFING_SCRIPT, DEFAULT_BRIEFING_CLOSING_LINE } from '@/lib/session/briefing-script';

const TRAINEE_COLUMNS = [
  { n: 1, label: 'Pop-out', minWidth: 70, maxWidth: 80, width: 74 },
  { n: 2, label: 'Slot', minWidth: 64, maxWidth: 80, width: 70 },
  { n: 3, label: 'Trainee Discord', minWidth: 110, maxWidth: 160, width: 130 },
  { n: 4, label: 'Discord ID', minWidth: 90, maxWidth: 140, width: 100 },
  { n: 5, label: 'Roblox', minWidth: 90, maxWidth: 140, width: 100 },
  { n: 6, label: 'Zone', minWidth: 90, maxWidth: 120, width: 100 },
  { n: 7, label: 'Timer', minWidth: 190, maxWidth: 220, width: 190 },
  { n: 8, label: 'Timer Pop-out', minWidth: 120, maxWidth: 140, width: 120 },
  { n: 9, label: 'Attendance', minWidth: 100, maxWidth: 120, width: 110 },
  { n: 10, label: 'Trainer', minWidth: 110, maxWidth: 160, width: 126 },
  { n: 11, label: 'Trainer Discord ID', minWidth: 120, maxWidth: 160, width: 140 },
  { n: 12, label: 'Feedback', minWidth: 110, maxWidth: 130, width: 110 },
  { n: 13, label: 'Announcements', minWidth: 160, maxWidth: 240, width: 220 },
  { n: 14, label: 'Trainee Notes', minWidth: 150, maxWidth: 240, width: 200 },
  { n: 15, label: 'Completed', minWidth: 100, maxWidth: 130, width: 110 },
  { n: 16, label: 'Remove', minWidth: 70, maxWidth: 90, width: 80 },
] as const;

// Pop-out columns (1, 8) are deliberately excluded from "Hide extras" — same as the original.
const EXTRA_COLUMN_NUMS = new Set([2, 4, 9, 11, 14, 16]);

// ── helpers ported 1:1 from sessionongoing.js ──
function fmt(s: number): string {
  const sign = s < 0 ? '-' : '';
  const abs = Math.abs(s);
  const m = String(Math.floor(abs / 60)).padStart(2, '0');
  const sec = String(abs % 60).padStart(2, '0');
  return `${sign}${m}:${sec}`;
}
function fmtHMS(seconds: number): string {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
function computeCurrentRemaining(t: TimerState): number {
  if (!t.running) return t.remainingSeconds;
  const elapsed = Math.floor((Date.now() - t.syncedAt) / 1000);
  return Math.max(0, t.remainingSeconds - elapsed);
}
function newUid() { return 'u_' + Math.random().toString(36).slice(2) + Date.now(); }

function parseAttendance(value: string | null | undefined, rowOrder: string[]): Record<string, boolean> {
  if (!value) return {};
  const parts = value.includes(',') ? value.split(',') : [...value];
  return Object.fromEntries(rowOrder.map((row, index) => [row, parts[index] === '1']));
}

// Ported from makeColumnsResizable() in the original. Mutates th.style.width
// directly during drag rather than going through React state — same reasoning
// as the original: a re-render per pixel of mouse movement would be wasteful.
// The optional onResize callback fires once, on mouseup, with the final width —
// this is what lets a column that gets a React-rendered width (the trainee
// table, whose columns can be hidden/shown) persist a manual resize across
// re-renders instead of snapping back to its default every time the component
// re-renders (which happens often — e.g. every second, from the timer tick).
function handleColResizeMouseDown(e: React.MouseEvent<HTMLSpanElement>, onResize?: (width: number) => void) {
  e.preventDefault();
  const handle = e.currentTarget;
  const th = handle.closest('th') as HTMLElement | null;
  if (!th) return;
  const startX = e.pageX;
  const startWidth = th.offsetWidth;
  handle.classList.add(styles.resizing);
  function onMove(ev: MouseEvent) {
    th!.style.width = Math.max(50, startWidth + (ev.pageX - startX)) + 'px';
  }
  function onUp() {
    handle.classList.remove(styles.resizing);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    onResize?.(th!.offsetWidth);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function ColResizeHandle({ onResize }: { onResize?: (width: number) => void }) {
  return <span className={styles.colResizer} onMouseDown={(e) => handleColResizeMouseDown(e, onResize)} />;
}

// Ported from enableBellDrag()/enableAnnounceDrag() in the original — lets the
// bell/announce FABs be dragged anywhere on screen. mousedown starts tracking;
// if the mouse actually moves, the widget follows the cursor (clamped to the
// viewport, direct DOM mutation during drag — same reasoning as ColResizeHandle,
// avoids a re-render per pixel). On mouseup, if it *didn't* move, that was a
// plain click, so the panel-toggle callback fires instead.
function useDraggableWidget(widgetRef: React.RefObject<HTMLDivElement | null>, onClickNoMove: () => void) {
  return useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const widget = widgetRef.current;
    if (!widget) return;
    let moved = false;
    const rect = widget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    function onMove(ev: MouseEvent) {
      moved = true;
      const maxLeft = window.innerWidth - widget!.offsetWidth;
      const maxTop = window.innerHeight - widget!.offsetHeight;
      widget!.style.left = Math.min(Math.max(0, ev.clientX - offsetX), maxLeft) + 'px';
      widget!.style.top = Math.min(Math.max(0, ev.clientY - offsetY), maxTop) + 'px';
      widget!.style.right = 'auto';
      widget!.style.bottom = 'auto';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!moved) onClickNoMove();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [widgetRef, onClickNoMove]);
}

// Ported from renderScriptPreview() / escapeForPreview() in the original.
// `win` matters here: when this renders inside the Document PiP pop-out, the
// copy button needs *that* window's clipboard/navigator, not the main page's —
// same reasoning as the original's `doc.defaultView || window` line.
function ScriptPreview({
  minutes,
  win,
  traineeName,
  location,
}: {
  minutes: number;
  win: Window;
  traineeName: string;
  location: string;
}) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  return (
    <div className={styles.scriptPreview}>
      {SCRIPT_LINES.map((lineText, i) => {
        const resolvedText = lineText
          .replaceAll('[NAME]', traineeName.trim() || '[NAME]')
          .replaceAll('[LOCATION]', location.trim() || '[LOCATION]')
          .replace(/XX/g, String(minutes));
        // Parenthetical director's notes — e.g. "(Wait for trainee to arrive)" —
        // are shown in the preview but stripped from what actually gets copied.
        const copyText = resolvedText.replace(/\([^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim();
        const html = resolvedText
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/\[([^\]]+)\]/g, `<span class="${styles.placeholderTag}">[$1]</span>`)
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>');
        return (
          <div key={i} className={styles.scriptLine}>
            {/* SCRIPT_LINES is a fixed constant, not user input — safe to inject */}
            <div className={styles.scriptLineText} dangerouslySetInnerHTML={{ __html: html }} />
            <button
              type="button"
              className={`${styles.scriptCopyBtn} ${copiedIndex === i ? styles.copied : ''}`}
              title="Copy this line"
              onClick={() => {
                win.navigator.clipboard.writeText(copyText).then(() => {
                  setCopiedIndex(i);
                  setTimeout(() => setCopiedIndex((cur) => (cur === i ? null : cur)), 1200);
                });
              }}
            >
              <FontAwesomeIcon icon={copiedIndex === i ? ICONS.check : ICONS.copy} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function BriefingScriptPip({ win, onCopyError }: { win: Window; onCopyError: () => void }) {
  const [copiedLine, setCopiedLine] = useState<string | null>(null);
  const [closingLine, setClosingLine] = useState(DEFAULT_BRIEFING_CLOSING_LINE);

  async function copyLine(key: string, value: string) {
    try {
      await win.navigator.clipboard.writeText(value);
      setCopiedLine(key);
      win.setTimeout(() => setCopiedLine((current) => current === key ? null : current), 1200);
    } catch {
      onCopyError();
    }
  }

  return (
    <div className={styles.briefingPip}>
      <h1><FontAwesomeIcon icon={ICONS.scroll} /> Host / Co-host Script</h1>
      <p className={styles.briefingPipIntro}>Copy one message at a time during the briefing.</p>
      {BRIEFING_SCRIPT.map((section) => (
        <section key={section.title} className={styles.briefingSection}>
          <h2>{section.title}</h2>
          {'hint' in section && <p className={styles.briefingHint}>{section.hint}</p>}
          {section.lines.map((line, index) => {
            const key = `${section.title}-${index}`;
            return (
              <div key={key} className={styles.briefingLine}>
                <p>{line}</p>
                <button type="button" title="Copy this message" aria-label={`Copy ${section.title} message ${index + 1}`} onClick={() => void copyLine(key, line)}>
                  <FontAwesomeIcon icon={copiedLine === key ? ICONS.check : ICONS.copy} />
                </button>
              </div>
            );
          })}
        </section>
      ))}
      <section className={styles.briefingSection}>
        <h2>Closing line</h2>
        <p className={styles.briefingHint}>Say whatever you like to wish everyone well.</p>
        <div className={styles.briefingLine}>
          <input aria-label="Closing line" value={closingLine} onChange={(event) => setClosingLine(event.target.value)} />
          <button type="button" title="Copy closing line" aria-label="Copy closing line" disabled={!closingLine.trim()} onClick={() => void copyLine('closing', closingLine.trim())}>
            <FontAwesomeIcon icon={copiedLine === 'closing' ? ICONS.check : ICONS.copy} />
          </button>
        </div>
      </section>
    </div>
  );
}

const OVERRIDE_LABELS: Record<keyof OverridesState, string> = {
  'session-details': 'Override Session Details',
  trainees: 'Enable Add/Delete Trainees',
  'staff-roles': 'Allow Main AST Override Staff Roles',
  'drivers-disable': 'Disable Assistant Input on Drivers',
  'slot-order': 'Override Slot Ordering',
  'staff-delete': 'Override Staff Deletion',
  'trainee-details': 'Override Trainee Details',
  'trainer-details': 'Override Trainer Assignment',
  'staff-addition': 'Allow Staff Addition',
  'allow-all': 'Allow Override for Everyone',
};

function SessionElapsedClock({
  startedAt,
  scheduledStartIso,
  durationMinutes,
}: {
  startedAt: string | null;
  scheduledStartIso: string | null;
  durationMinutes: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const actualStart = startedAt ? new Date(startedAt).getTime() : now;
  const scheduledStart = scheduledStartIso ? new Date(scheduledStartIso).getTime() : actualStart;
  const elapsed = Math.max(0, Math.floor((now - actualStart) / 1000));
  const overtime = durationMinutes > 0 && now - scheduledStart > durationMinutes * 60_000;

  return (
    <>
      <div className={`${styles.globalTimerValue} ${overtime ? styles.globalTimerOvertime : ''}`} aria-live="off">
        {fmtHMS(elapsed)}
      </div>
      {overtime && (
        <span className={styles.overtimePill}>
          <FontAwesomeIcon icon={ICONS.triangleExclamation} /> Overtime — please pick up the pace and conclude the session now.
        </span>
      )}
    </>
  );
}

function LiveTimerText({
  timer,
  fallbackSeconds,
  warningSeconds = [],
  onWarning,
  onExpired,
  large = false,
}: {
  timer: TimerState | undefined;
  fallbackSeconds: number;
  warningSeconds?: number[];
  onWarning?: (seconds: number) => void;
  onExpired?: () => void;
  large?: boolean;
}) {
  const [remaining, setRemaining] = useState(() => timer ? computeCurrentRemaining(timer) : fallbackSeconds);
  const [flashExpiresAt, setFlashExpiresAt] = useState<number | null>(null);
  const notifiedSyncRef = useRef<number | null>(null);
  const previousRemainingRef = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      const nextRemaining = timer ? computeCurrentRemaining(timer) : fallbackSeconds;
      setRemaining(nextRemaining);
      if (nextRemaining > 0) {
        setFlashExpiresAt(null);
      } else if (timer?.running) {
        const flashUntil = timer.syncedAt + timer.remainingSeconds * 1000 + 10_000;
        setFlashExpiresAt(flashUntil > Date.now() ? flashUntil : null);
      }
    };
    update();
    if (!timer?.running) return;
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [timer, fallbackSeconds]);

  useEffect(() => {
    if (flashExpiresAt === null) return;
    const delay = flashExpiresAt - Date.now();
    if (delay <= 0) return;
    const timeout = window.setTimeout(() => setFlashExpiresAt(null), delay);
    return () => window.clearTimeout(timeout);
  }, [flashExpiresAt]);

  useEffect(() => {
    if (remaining > 0 && timer?.running) {
      const previousRemaining = previousRemainingRef.current;
      if (previousRemaining !== null && remaining < previousRemaining) {
        for (const seconds of warningSeconds) {
          if (previousRemaining > seconds && remaining <= seconds) onWarning?.(seconds);
        }
      }
    }
    previousRemainingRef.current = remaining;
  }, [remaining, timer?.running, warningSeconds, onWarning]);

  useEffect(() => {
    if (remaining > 0) notifiedSyncRef.current = null;
    if (!timer?.running || remaining > 0 || notifiedSyncRef.current === timer.syncedAt) return;
    notifiedSyncRef.current = timer.syncedAt;
    onExpired?.();
  }, [remaining, timer, onExpired]);

  return (
    <span
      className={`${styles.timerDisplay} ${timer?.running && remaining > 60 ? styles.running : remaining <= 0 ? (flashExpiresAt !== null ? styles.expiredFlash : styles.expired) : remaining <= 60 ? styles.low : ''}`}
      style={large ? { fontSize: '2rem' } : undefined}
    >
      {fmt(remaining)}
    </span>
  );
}

const DEFAULT_OVERRIDES: OverridesState = {
  'session-details': false, trainees: false, 'staff-roles': false, 'drivers-disable': false,
  'slot-order': false, 'staff-delete': false, 'trainee-details': false, 'trainer-details': false,
  'staff-addition': false, 'allow-all': false,
};

interface Props {
  initialSession: SessionOngoingRow;
  staffDirectory: Record<string, string>;
  eligibleStaff: { 'Co-Host': string[]; Assistant: string[] };
  // Optional: names eligible to be selected as Session Host (originally scoped
  // server-side to Community Manager / Operations Manager / Head Staff via
  // $staffByRank in sessionongoing.php). Falls back to every name in
  // staffDirectory if the parent server component doesn't pass this yet —
  // wire it up there for exact parity.
  eligibleHosts?: string[];
  scheduledStartIso: string | null;
  standbySlots: number[];
  timezoneMode: SiteTimezoneMode;
  viewerRole: ViewerRole;
  myDisplayName: string;
  username: string;
  roleDisplay: string;
  avatarUrl: string | null;
  staffId: string;
  prefTraineeWarning: boolean;
  prefTraineeWarningTimes: number[];
  prefTraineeSound: boolean;
  prefAnnouncementDisplay: 'toast' | 'banner' | 'fullscreen';
  prefAnnouncementEnabled: boolean;
}

export default function SessionOngoingClient(props: Props) {
  const {
    initialSession, staffDirectory, eligibleStaff, eligibleHosts, scheduledStartIso, standbySlots, timezoneMode, viewerRole, myDisplayName,
    prefTraineeWarning, prefTraineeWarningTimes, prefTraineeSound, prefAnnouncementDisplay, prefAnnouncementEnabled,
  } = props;
  const hostOptions = eligibleHosts ?? Object.keys(staffDirectory);

  const myRole: MyRole = viewerRole === 'Host' ? 'host' : viewerRole === 'Co-Host' ? 'cohost' : 'assistant';
  const isHost = myRole === 'host';
  const sessionId = initialSession.session_id;
  const initialLiveState = initialSession.live_state ?? {};
  const initialAllocatedRows = Array.from({ length: initialSession.num_slots || 10 }, (_, i) => String(i));
  const initialStandbyRows = standbySlots.map((slot) => String(slot - 1));
  const initialRowOrder = (initialLiveState.slotOrder ?? initialAllocatedRows)
    .filter((row) => initialAllocatedRows.includes(row));
  const initialTraineeRows = [...initialRowOrder, ...initialStandbyRows];

  const myClientId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    let id = localStorage.getItem('yss_client_id');
    if (!id) { id = 'c_' + Math.random().toString(36).slice(2) + Date.now(); localStorage.setItem('yss_client_id', id); }
    return id;
  }, []);

  // ── core state (mirrors the module-level `let`s in sessionongoing.js) ──
  const [session, setSession] = useState<SessionOngoingRow>(initialSession);
  const [overrides, setOverrides] = useState<OverridesState>({ ...DEFAULT_OVERRIDES, ...initialLiveState.overrides });
  const [timers, setTimers] = useState<Record<string, TimerState>>(initialLiveState.timers ?? {});
  const [drivers, setDrivers] = useState<DriverRow[]>(initialLiveState.drivers ?? []);
  const [staffShift, setStaffShift] = useState<StaffShiftRow[]>(initialLiveState.staffShift ?? []);
  const isMainAst = useMemo(() => staffShift.some((member) =>
    member.role === 'Main AST' && member.discord.trim().toLowerCase() === myDisplayName.trim().toLowerCase()
  ), [staffShift, myDisplayName]);
  const isInternalHelper = useMemo(() => staffShift.some((member) =>
    member.role === 'Internal Helper' && member.discord.trim().toLowerCase() === myDisplayName.trim().toLowerCase()
  ), [staffShift, myDisplayName]);
  const myShiftRoles = staffShift.filter((member) =>
    member.discord.trim().toLowerCase() === myDisplayName.trim().toLowerCase()
  );
  const isCoHost = myShiftRoles.length > 0
    ? myShiftRoles.some((member) => member.role === 'Co-Host')
    : myRole === 'cohost';
  const isAssistant = !isHost && !isCoHost;
  const controlAccess = getSessionControlAccess(overrides, {
    host: isHost, coHost: isCoHost, mainAst: isMainAst, internalHelper: isInternalHelper,
  });
  const [feedbackData, setFeedbackData] = useState<FeedbackDataMap>(initialLiveState.feedbackData ?? {});
  const [feedbackImages, setFeedbackImages] = useState<Record<string, FeedbackImage[]>>({});
  const [imageUploading, setImageUploading] = useState(false);
  const imageUploadingRef = useRef(false);
  const [draftReady, setDraftReady] = useState(false);
  const draftKey = `session-feedback-draft:${sessionId}:${props.staffId}`;
  const [completedRows, setCompletedRows] = useState<Record<string, boolean>>(initialLiveState.completedRows ?? {});
  const [unallocated, setUnallocated] = useState<UnallocatedTrainee[]>(initialLiveState.unallocatedTrainees ?? []);
  const [timeTracker, setTimeTracker] = useState<TimeTracker>(initialLiveState.timeTracker ?? {});
  const briefingAvailable = (isHost || isCoHost) && timeTracker.briefingStart != null && timeTracker.sgShiftStart == null;
  const [mainAstNotes, setMainAstNotes] = useState(initialLiveState.mainAstNotes ?? '');
  const [statusValue, setStatusValue] = useState((session.session_status || 'inprogress').toLowerCase().replace(/\s+/g, ''));
  // Attendance wasn't wired to state in the initial port — bare checkbox, visual only.
  // Needed for real for the report's "Cancelled/No-show" list, so wiring it up now.
  const [attendance, setAttendance] = useState<Record<string, boolean>>(() => {
    const initial = parseAttendance(initialSession.trainee_attendance, initialRowOrder);
    for (const row of initialStandbyRows) {
      initial[row] = Boolean(initialLiveState.trainees?.[row]?.attended);
    }
    return initial;
  });
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; resolve: (v: boolean) => void } | null>(null);
  const [feedbackModalRow, setFeedbackModalRow] = useState<string | null>(null);
  // Auto-shows when the modal opens — "the script in the modal only, the
  // PiP's script view stays behind its own toggle", per the original.
  const [scriptVisible, setScriptVisible] = useState(false);
  const [modalCopyFlash, setModalCopyFlash] = useState(false);
  useEffect(() => { if (feedbackModalRow !== null) setScriptVisible(true); }, [feedbackModalRow]);
  const [bell, setBell] = useState<BellStateRow | null>(null);
  const [bellPanelOpen, setBellPanelOpen] = useState(false);
  const bellWidgetRef = useRef<HTMLDivElement>(null);
  const [announcePanelOpen, setAnnouncePanelOpen] = useState(false);
  const [announceMessage, setAnnounceMessage] = useState('');
  const [announceBanner, setAnnounceBanner] = useState<string | null>(null);
  const [announceFullscreen, setAnnounceFullscreen] = useState<string | null>(null);
  const announceWidgetRef = useRef<HTMLDivElement>(null);
  const dragBellFab = useDraggableWidget(bellWidgetRef, () => setBellPanelOpen((o) => !o));
  const dragAnnounceFab = useDraggableWidget(announceWidgetRef, () => setAnnouncePanelOpen((o) => !o));
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (announceWidgetRef.current && !announceWidgetRef.current.contains(e.target as Node)) setAnnouncePanelOpen(false);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bellWidgetRef.current && !bellWidgetRef.current.contains(e.target as Node)) setBellPanelOpen(false);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);
  const [bellLocalCooldownUntil, setBellLocalCooldownUntil] = useState<Record<'host' | 'cohost' | 'assistant', number>>({ host: 0, cohost: 0, assistant: 0 });
  // Drives the bell cooldown-fill bars and disabled-state re-checks — separate
  // from the 1s trainee-timer ticker below since it only needs ~500ms granularity.
  const [bellNow, setBellNow] = useState(Date.now());
  useEffect(() => {
    const now = Date.now();
    const deadlines = Object.values(bellLocalCooldownUntil).filter((value) => value > now);
    const globalCooldown = bell?.cooldown_until ? new Date(bell.cooldown_until).getTime() : 0;
    if (globalCooldown > now) deadlines.push(globalCooldown);
    if (bell?.active && bell.ring_count < 3 && bell.last_ring_at) {
      const rerollAt = new Date(bell.last_ring_at).getTime() + 5000;
      if (rerollAt > now) deadlines.push(rerollAt);
    }
    if (deadlines.length === 0) return;
    const id = window.setTimeout(() => setBellNow(Date.now()), Math.max(50, Math.min(...deadlines) - now + 50));
    return () => window.clearTimeout(id);
  }, [bell, bellLocalCooldownUntil, bellNow]);
  const { reportActive } = useLiveSessionActions();
  useEffect(() => {
    const persistedChange = initialSession.last_updated ?? initialSession.started_at;
    const changedAt = persistedChange ? new Date(persistedChange).getTime() : undefined;
    // Mounting/refreshing confirms activity; it is not itself a session change.
    reportActive(false, changedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirtyRef = useRef({
    liveFields: new Set<keyof LiveState>(),
    status: false,
    details: false,
    attendance: false,
    traineeRows: new Set<string>(),
  });
  const lastActivityBroadcastAtRef = useRef(0);
  const changeVersionRef = useRef(0);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const lastSyncErrorRef = useRef<{ message: string; at: number } | null>(null);
  const consecutiveSyncFailuresRef = useRef(0);
  const queueSync = useCallback((field?: keyof LiveState) => {
    if (field) dirtyRef.current.liveFields.add(field);
    changeVersionRef.current += 1;
    // Every controller mutation funnels through queueSync. Report immediately
    // so "last change" resets while typing/clicking, not only after the
    // debounced request and Supabase realtime round trip complete.
    reportActive(true);
  }, [reportActive]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const draft = JSON.parse(raw) as { savedAt?: number; feedbackData?: FeedbackDataMap; images?: Record<string, FeedbackImage[]> };
          const serverTime = initialSession.last_updated ? new Date(initialSession.last_updated).getTime() : 0;
          if (draft.feedbackData && (draft.savedAt ?? 0) > serverTime) {
            setFeedbackData((current) => ({ ...current, ...draft.feedbackData }));
            queueSync('feedbackData');
          }
          if (draft.images) setFeedbackImages(draft.images);
        }
      } catch { /* Damaged browser storage must not block feedback. */ }
      setDraftReady(true);
    });
    fetch(`/api/session/${sessionId}/feedback-images`)
      .then((response) => response.ok ? response.json() : null)
      .then((result: { success?: boolean; images?: FeedbackImage[] } | null) => {
        if (!active || !result?.success || !result.images) return;
        const byRow: Record<string, FeedbackImage[]> = {};
        for (const image of result.images) {
          if (image.slot_number != null) (byRow[String(image.slot_number - 1)] ??= []).push(image);
        }
        setFeedbackImages(byRow);
      }).catch(() => {});
    return () => { active = false; };
    // Restore only once for this session; live updates follow the existing sync path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  useEffect(() => {
    if (!draftReady) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ savedAt: Date.now(), feedbackData, images: feedbackImages })); }
    catch { /* Server state still persists when browser storage is full. */ }
  }, [draftKey, draftReady, feedbackData, feedbackImages]);
  useEffect(() => {
    let confirmedNavigation = false;
    const hasUnsavedFeedback = () => dirtyRef.current.liveFields.has('feedbackData') || imageUploadingRef.current;
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (confirmedNavigation || !hasUnsavedFeedback()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const warnOnInternalLink = (event: MouseEvent) => {
      if (!hasUnsavedFeedback() || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement | null : null;
      if (!link || link.target === '_blank') return;
      const destination = new URL(link.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!window.confirm('Feedback changes or image uploads have not finished saving. Leave this page?')) event.preventDefault();
      else {
        confirmedNavigation = true;
        window.setTimeout(() => { confirmedNavigation = false; }, 1000);
      }
    };
    window.addEventListener('beforeunload', warnIfUnsaved);
    document.addEventListener('click', warnOnInternalLink, true);
    return () => {
      window.removeEventListener('beforeunload', warnIfUnsaved);
      document.removeEventListener('click', warnOnInternalLink, true);
    };
  }, []);
  const traineeCountRef = useRef(initialSession.num_slots || 10);

  // ── trainee rows: allocated (1..num_slots) + unallocated, mirrors renumberSlots/addTraineeRow ──
  // (Declared up here, ahead of pushState below, since pushState's dependency
  // array reads rowOrder — declaring it later would be a temporal-dead-zone
  // ReferenceError.)
  const allocatedRows = useMemo(
    () => Array.from({ length: session.num_slots || 10 }, (_, i) => String(i)),
    [session.num_slots]
  );
  const standbyRows = useMemo(() => standbySlots.map((slot) => String(slot - 1)), [standbySlots]);
  const [rowOrder, setRowOrder] = useState<string[]>(initialRowOrder);
  const allTraineeRows = useMemo(() => [...rowOrder, ...standbyRows], [rowOrder, standbyRows]);
  const traineeSlotCount = countSessionTraineeSlots(allocatedRows.length, standbyRows.length, unallocated.length);
  useEffect(() => {
    // keep rowOrder in sync if num_slots changes (rows added/removed) —
    // append any new rows, drop any that no longer exist
    setRowOrder((prev) => {
      const known = new Set(prev);
      const next = prev.filter((r) => allocatedRows.includes(r));
      for (const r of allocatedRows) if (!known.has(r)) next.push(r);
      return next;
    });
  }, [allocatedRows]);

  // Seed every allocated row's timer on mount (and if num_slots grows later) —
  // fixes a silent no-op bug where toggleTimer/recordSetupDone bailed out if
  // timers[row] didn't exist yet, which previously meant Play and Setup Done
  // did nothing until some other action (like Reset, which didn't have this
  // guard) happened to create the row's entry first.
  useEffect(() => {
    setTimers((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const row of [...allocatedRows, ...standbyRows]) {
        if (!next[row]) {
          next[row] = { remainingSeconds: (session.trainee_timer || 12) * 60, running: false, syncedAt: Date.now() };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [allocatedRows, standbyRows, session.trainee_timer]);

  // ── controlled state for editable trainee-detail fields ──
  // Previously these were uncontrolled inputs (defaultValue only, no onChange),
  // so edits were never actually captured anywhere to be saved — and the
  // Trainee Discord / Roblox columns were bound to the WRONG db fields: per
  // the schema (see types/session.ts), trainee_N_discord is the Discord
  // username and trainee_N_name is — confusingly — the Roblox username. Both
  // fixed here.
  interface TraineeDetail { discord: string; discordId: string; roblox: string; zone: string; trainerName: string; notes: string }
  const buildTraineeDetail = useCallback((sess: SessionOngoingRow, row: string): TraineeDetail => {
    const idx = parseInt(row, 10) + 1;
    return {
      discord: (sess[`trainee_${idx}_discord`] as string) ?? '',
      discordId: (sess[`trainee_${idx}_discord_id`] as string) ?? '',
      roblox: (sess[`trainee_${idx}_name`] as string) ?? '',
      zone: sess[`trainee_${idx}_zone`] ? `Zone ${sess[`trainee_${idx}_zone`]}` : '',
      trainerName: (sess[`trainee_${idx}_trainer_name`] as string) ?? '',
      notes: (sess[`trainee_${idx}_note`] as string) ?? '',
    };
  }, []);
  const [traineeDetails, setTraineeDetails] = useState<Record<string, TraineeDetail>>(() => {
    const map: Record<string, TraineeDetail> = {};
    for (const row of initialTraineeRows) map[row] = buildTraineeDetail(initialSession, row);
    return map;
  });
  const updateTraineeDetail = useCallback((row: string, patch: Partial<TraineeDetail>) => {
    setTraineeDetails((prev) => ({ ...prev, [row]: { ...(prev[row] ?? buildTraineeDetail(session, row)), ...patch } }));
    dirtyRef.current.traineeRows.add(row);
    queueSync();
  }, [buildTraineeDetail, session, queueSync]);


  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const showToast = useCallback((message: string, kind: ToastKind = 'info', actorName = myDisplayName || viewerRole) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-3), { id, message, kind, actorName }]);
    window.setTimeout(() => dismissToast(id), 10_000);
  }, [dismissToast, myDisplayName, viewerRole]);
  const { send: sendSessionActivity } = useSessionActivityBroadcast(sessionId, (activity) => {
    if (activity.clientId === myClientId) return;
    showToast('Updated the session.', 'info', activity.actorName);
  });
  const copyWithFeedback = useCallback(async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => current === key ? null : current), 1800);
      showToast(`${label} copied successfully.`, 'success');
    } catch {
      showToast(`Could not copy ${label.toLowerCase()}. Check your clipboard permission.`, 'error');
    }
  }, [showToast]);
  // Native `disabled` blocks the click event entirely, so a toast could never
  // fire from it — this is the alternative for controls where we want an
  // explicit "here's why" message instead of just a greyed-out look.
  const lockedClick = useCallback((isLocked: boolean, message: string, action: () => void) => {
    if (isLocked) {
      const viewerMessage = isHost
        ? message
          .replace(/Ask the host to enable ([^.]+)\.?/i, 'Enable $1 in Session Controls.')
          .replace(/Ask the host to turn off ([^.]+)\.?/i, 'Turn off $1 in Session Controls.')
          .replace(/until the Host enables Session Details/i, 'until you enable Override Session Details')
        : message;
      showToast(viewerMessage, 'warning');
      return;
    }
    action();
  }, [isHost, showToast]);
  const showConfirm = useCallback((message: string, title = 'Are you sure?') => {
    return new Promise<boolean>((resolve) => setConfirmState({ title, message, resolve }));
  }, []);

  const latestSyncStateRef = useRef({
    statusValue, session, timers, drivers, staffShift, feedbackData,
    completedRows, unallocated, timeTracker, mainAstNotes, overrides,
    rowOrder, attendance, traineeDetails,
  });
  useEffect(() => {
    latestSyncStateRef.current = {
      statusValue, session, timers, drivers, staffShift, feedbackData,
      completedRows, unallocated, timeTracker, mainAstNotes, overrides,
      rowOrder, attendance, traineeDetails,
    };
  }, [
    statusValue, session, timers, drivers, staffShift, feedbackData,
    completedRows, unallocated, timeTracker, mainAstNotes, overrides,
    rowOrder, attendance, traineeDetails,
  ]);

  // ── realtime wiring — replaces setInterval(pushState/pullState, 5000) ──
  useSessionRealtime(sessionId, (row) => {
    const remote = row.live_state ?? {};
    setSession((previous) => ({
      // host/co-host/assistant values are UI fields derived from session_staff;
      // a session_ongoing realtime row does not contain them.
      ...previous,
      ...row,
      host: dirtyRef.current.details ? previous.host : (remote.sessionHost ?? previous.host),
      ...(dirtyRef.current.details ? {
        session_date: previous.session_date,
        session_time: previous.session_time,
        trainee_timer: previous.trainee_timer,
      } : {}),
    }));
    if (!dirtyRef.current.status) {
      setStatusValue((row.session_status || 'inprogress').toLowerCase().replace(/\s+/g, ''));
    }
    const localLiveChanges = dirtyRef.current.liveFields;
    if (remote.trainees) {
      setTraineeDetails((prev) => {
        const next = { ...prev };
        for (const [rowKey, trainee] of Object.entries(remote.trainees!)) {
          if (dirtyRef.current.traineeRows.has(rowKey)) continue;
          next[rowKey] = {
            discord: trainee.discord,
            discordId: trainee.discordId,
            roblox: trainee.roblox,
            zone: trainee.zone,
            trainerName: trainee.trainerName,
            notes: trainee.notes,
          };
        }
        return next;
      });
      if (!dirtyRef.current.attendance) {
        setAttendance(Object.fromEntries(
          Object.entries(remote.trainees).map(([rowKey, trainee]) => [rowKey, trainee.attended])
        ));
      }
    }
    if (remote.feedbackData && !localLiveChanges.has('feedbackData')) setFeedbackData((f) => ({ ...f, ...remote.feedbackData }));
    if (remote.completedRows && !localLiveChanges.has('completedRows')) setCompletedRows(remote.completedRows);
    if (remote.timeTracker && !localLiveChanges.has('timeTracker')) setTimeTracker((t) => ({ ...t, ...remote.timeTracker }));
    if (remote.mainAstNotes !== undefined && !localLiveChanges.has('mainAstNotes')) setMainAstNotes(remote.mainAstNotes);
    if (remote.drivers && !localLiveChanges.has('drivers')) setDrivers(remote.drivers);
    if (remote.staffShift && !localLiveChanges.has('staffShift')) setStaffShift(remote.staffShift);
    if (remote.unallocatedTrainees && !localLiveChanges.has('unallocatedTrainees')) setUnallocated(remote.unallocatedTrainees);
    if (remote.slotOrder && !localLiveChanges.has('slotOrder')) setRowOrder(remote.slotOrder);
    if (remote.overrides && !localLiveChanges.has('overrides')) {
      setOverrides({ ...DEFAULT_OVERRIDES, ...remote.overrides });
    }
    if (remote.timers && !localLiveChanges.has('timers')) {
      setTimers((prev) => {
        const next = { ...prev };
        for (const [row2, t] of Object.entries(remote.timers!)) next[row2] = t;
        return next;
      });
    }
    const databaseChangedAt = row.last_updated ? new Date(row.last_updated).getTime() : undefined;
    reportActive(true, databaseChangedAt);
  });

  useBellRealtime(sessionId, (nextBell) => {
    setBell(nextBell);
    reportActive(true);
  });

  const announcementSoundRef = useRef<HTMLAudioElement>(null);
  const traineeWarningSoundRef = useRef<HTMLAudioElement>(null);
  const traineeOverSoundRef = useRef<HTMLAudioElement>(null);
  const { send: sendAnnouncementRaw } = useAnnouncementBroadcast(sessionId, (a: AnnouncementPayload) => {
    reportActive(true);
    if (!prefAnnouncementEnabled) return;
    const text = `${a.senderName}: ${a.message}`;
    if (announcementSoundRef.current) { announcementSoundRef.current.currentTime = 0; announcementSoundRef.current.play().catch(() => {}); }
    if (prefAnnouncementDisplay === 'fullscreen') {
      setAnnounceFullscreen(text);
    } else if (prefAnnouncementDisplay === 'banner') {
      setAnnounceBanner(text);
      setTimeout(() => setAnnounceBanner((cur) => (cur === text ? null : cur)), 12000);
    } else {
      showToast(a.message, 'info', a.senderName);
    }
  });

  const handleSendAnnouncement = useCallback(() => {
    const message = announceMessage.trim();
    if (!message) return;
    sendAnnouncementRaw({
      id: `${Date.now()}_${myClientId}`,
      message,
      senderName: session.host || 'Host',
      sentAt: Date.now(),
    });
    setAnnounceMessage('');
    setAnnouncePanelOpen(false);
    reportActive(true);
    showToast('Announcement sent to everyone.');
  }, [announceMessage, sendAnnouncementRaw, session.host, myClientId, reportActive, showToast]);

  // ── debounced push (replaces pushState / queueLiveStateSync) ──
  const pushState = useCallback(async (keepalive = false): Promise<boolean> => {
    if (consecutiveSyncFailuresRef.current >= 5) return false;
    if (savePromiseRef.current) return savePromiseRef.current;
    const d = dirtyRef.current;
    const hasChanges = d.liveFields.size > 0 || d.status || d.details || d.attendance || d.traineeRows.size > 0;
    if (!hasChanges) return true;

    const versionAtStart = changeVersionRef.current;
    const dirtyAtStart = {
      liveFields: new Set(d.liveFields),
      status: d.status,
      details: d.details,
      attendance: d.attendance,
      traineeRows: new Set(d.traineeRows),
    };
    const state = latestSyncStateRef.current;
    const operation = (async () => {

    const updates: Record<string, unknown> = {};
    if (dirtyAtStart.status) updates.session_status = state.statusValue;
    if (dirtyAtStart.details) {
      updates.host = state.session.host;
      updates.session_date = state.session.session_date;
      updates.session_time = state.session.session_time;
      updates.trainee_timer = state.session.trainee_timer;
    }
    if (dirtyAtStart.attendance) {
      for (const row of allTraineeRows) {
        updates[`trainee_${parseInt(row, 10) + 1}_attended`] = Boolean(state.attendance[row]);
      }
    }
    if (dirtyAtStart.traineeRows.size > 0) {
      for (const row of dirtyAtStart.traineeRows) {
        const idx = parseInt(row, 10) + 1;
        const detail = state.traineeDetails[row];
        if (!detail) continue;
        updates[`trainee_${idx}_discord`] = detail.discord;
        updates[`trainee_${idx}_discord_id`] = detail.discordId.trim() || null;
        updates[`trainee_${idx}_name`] = detail.roblox; // yes — roblox lives under the "_name" column, see TraineeDetail comment above
        updates[`trainee_${idx}_zone`] = detail.zone ? parseInt(detail.zone.replace('Zone ', ''), 10) : null;
        updates[`trainee_${idx}_trainer_name`] = detail.trainerName;
        updates[`trainee_${idx}_note`] = detail.notes;
      }
    }

      const allLiveState: LiveState = {
        timers: state.timers,
        drivers: state.drivers,
        staffShift: state.staffShift,
        feedbackData: state.feedbackData,
        completedRows: state.completedRows,
        unallocatedTrainees: state.unallocated,
        timeTracker: state.timeTracker,
        mainAstNotes: state.mainAstNotes,
        slotOrder: state.rowOrder,
        overrides: state.overrides,
      };
      const live_state: Partial<LiveState> = {};
      for (const field of dirtyAtStart.liveFields) {
        (live_state as Record<string, unknown>)[field] = (allLiveState as Record<string, unknown>)[field];
      }
      if (dirtyAtStart.details) live_state.sessionHost = state.session.host;
      if (dirtyAtStart.attendance || dirtyAtStart.traineeRows.size > 0) {
        live_state.trainees = Object.fromEntries(
          allTraineeRows.map((row) => {
            const detail = state.traineeDetails[row] ?? {
              discord: '', discordId: '', roblox: '', zone: '', trainerName: '', notes: '',
            };
            return [row, { ...detail, attended: Boolean(state.attendance[row]) }];
          })
        );
      }

      try {
        const response = await fetch(`/api/session/${sessionId}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, updates, live_state }),
          keepalive,
        });
        const result = await response.json().catch(() => null) as { success?: boolean; message?: string } | null;
        if (!response.ok || !result?.success) {
          throw new Error(result?.message || `Save failed (${response.status}).`);
        }

        if (changeVersionRef.current === versionAtStart) {
          dirtyRef.current = {
            liveFields: new Set(), status: false, details: false,
            attendance: false, traineeRows: new Set(),
          };
        }
        lastSyncErrorRef.current = null;
        consecutiveSyncFailuresRef.current = 0;
        const now = Date.now();
        if (now - lastActivityBroadcastAtRef.current >= 8000) {
          lastActivityBroadcastAtRef.current = now;
          sendSessionActivity({
            id: `${myClientId}:${now}`,
            clientId: myClientId,
            actorName: myDisplayName || viewerRole,
          });
        }
        return true;
      } catch (error) {
        consecutiveSyncFailuresRef.current += 1;
        const message = error instanceof Error ? error.message : 'Unknown save error.';
        const previous = lastSyncErrorRef.current;
        if (!previous || previous.message !== message || Date.now() - previous.at > 10_000) {
          showToast(`Changes were not saved: ${message}`);
          lastSyncErrorRef.current = { message, at: Date.now() };
        }
        if (consecutiveSyncFailuresRef.current === 5) {
          showToast('Saving paused after 5 consecutive failures to protect the database. Reload the page before trying again.', 'error');
        }
        return false;
      }
    })();

    savePromiseRef.current = operation;
    try {
      return await operation;
    } finally {
      if (savePromiseRef.current === operation) savePromiseRef.current = null;
    }
  }, [allTraineeRows, myClientId, myDisplayName, sendSessionActivity, sessionId, showToast, viewerRole]);

  useEffect(() => {
    const id = setInterval(() => { void pushState(); }, 1500);
    const flushWhenLeaving = () => { void pushState(true); };
    const flushWhenHidden = () => { if (document.visibilityState === 'hidden') flushWhenLeaving(); };
    window.addEventListener('pagehide', flushWhenLeaving);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      clearInterval(id);
      window.removeEventListener('pagehide', flushWhenLeaving);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      flushWhenLeaving();
    };
  }, [pushState]);

  // ── signal time apply — replaces applySignalMinutes(): pushes the new
  // per-trainee countdown length and resets every non-running row to it ──
  const applySignalTime = useCallback(() => {
    const unlocked = controlAccess.sessionDetails;
    if (!unlocked) return;
    const minutes = Math.max(1, Math.min(60, parseInt(String(session.trainee_timer), 10) || 12));
    setSession((s) => ({ ...s, trainee_timer: minutes }));
    setTimers((prev) => {
      const next: Record<string, TimerState> = {};
      for (const row of Object.keys(prev)) {
        next[row] = { remainingSeconds: minutes * 60, running: false, syncedAt: Date.now(), setupSeconds: prev[row]?.setupSeconds };
      }
      return next;
    });
    dirtyRef.current.details = true;
    queueSync('timers');
    showToast(`Signal time set to ${minutes} minutes for all trainees.`);
  }, [controlAccess.sessionDetails, session.trainee_timer, queueSync, showToast]);

  // ── overrides ──
  const toggleOverride = useCallback(async (key: keyof OverridesState) => {
    if (!isHost) { showToast('Only the Host can toggle overrides.'); return; }
    const nextEnabled = !overrides[key];
    if (key === 'allow-all' && nextEnabled) {
      const ok = await showConfirm(
        "This unlocks every field for every user and bypasses all individual overrides, including host-only ones. This can't be undone quietly — everyone will be able to edit everything.",
        'Allow Override for Everyone?'
      );
      if (!ok) return;
    }
    setOverrides((prev) => ({ ...prev, [key]: nextEnabled }));
    queueSync('overrides');
    showToast(`${OVERRIDE_LABELS[key]} ${nextEnabled ? 'enabled' : 'disabled'}.`, nextEnabled ? 'success' : 'warning');
  }, [isHost, overrides, showConfirm, showToast, queueSync]);

  const allowAll = overrides['allow-all'];
  const locked = {
    sessionDetails: !controlAccess.sessionDetails,
    trainees: !controlAccess.trainees,
    traineeDetails: !(controlAccess.traineeDetails || controlAccess.trainees),
    trainerDetails: !controlAccess.trainerDetails,
    staffRoles: !controlAccess.staffRoles,
    driversDisabled: !controlAccess.drivers,
    slotOrder: !controlAccess.slotOrder,
    staffDelete: !controlAccess.staffDelete,
  };
  const canSeeTimeTracker = isHost || isMainAst || isInternalHelper;
  const canSeeMainAstNotes = isHost || isMainAst || isInternalHelper;
  const canAddStaff = controlAccess.staffAddition;
  const trainerOptions = useMemo(() => {
    const seen = new Set<string>();
    return [
      session.host,
      ...staffShift
        .filter((member) => member.role === 'Co-Host')
        .map((member) => member.discord),
    ].map((name) => name?.trim() ?? '').filter((name) => {
      const key = name.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [session.host, staffShift]);
  const traineeLabel = useCallback((row: string) => {
    const name = traineeDetails[row]?.discord?.trim();
    if (name) return name;
    return standbyRows.includes(row) ? 'standby trainee' : `trainee in slot ${rowOrder.indexOf(row) + 1}`;
  }, [standbyRows, traineeDetails, rowOrder]);

  const updateTraineeAttendance = useCallback((row: string, attended: boolean) => {
    setAttendance((prev) => ({ ...prev, [row]: attended }));
    dirtyRef.current.attendance = true;
    queueSync();
    showToast(`${traineeLabel(row)} marked ${attended ? 'present' : 'absent'}.`, attended ? 'success' : 'warning');
  }, [queueSync, showToast, traineeLabel]);

  const allDone = useMemo(() => {
    const rows = Object.keys(completedRows);
    return rows.length > 0 && rows.every((r) => completedRows[r]);
  }, [completedRows]);
  const statusUnlocked = allowAll || isHost || ((isCoHost || isInternalHelper) && (overrides['session-details'] || allDone));

  // ── trainee timer controls (replace toggleTimer/resetTimer/setTimerValue/recordSetupDone) ──
  const warnedTimerThresholdsRef = useRef(new Set<string>());
  const playTraineeWarning = useCallback((row: string, timerSyncAt: number, seconds: number) => {
    if (!prefTraineeWarning) return;
    const key = `${row}:${timerSyncAt}:${seconds}`;
    if (warnedTimerThresholdsRef.current.has(key)) return;
    warnedTimerThresholdsRef.current.add(key);
    const sound = traineeWarningSoundRef.current;
    if (sound) {
      sound.currentTime = 0;
      void sound.play().catch(() => {});
    }
    showToast(`${traineeLabel(row)} has ${fmt(seconds)} remaining.`, 'warning');
  }, [prefTraineeWarning, showToast, traineeLabel]);

  const expiredTimerRowsRef = useRef(new Map<string, number>());
  const expireTimer = useCallback((row: string) => {
    const timer = timers[row];
    if (!timer?.running || computeCurrentRemaining(timer) > 0 || expiredTimerRowsRef.current.get(row) === timer.syncedAt) return;
    expiredTimerRowsRef.current.set(row, timer.syncedAt);
    setTimers((prev) => ({
      ...prev,
      [row]: { ...timer, remainingSeconds: 0, running: false, syncedAt: Date.now() },
    }));
    queueSync('timers');
    if (prefTraineeSound && traineeOverSoundRef.current) {
      traineeOverSoundRef.current.currentTime = 0;
      void traineeOverSoundRef.current.play().catch(() => {});
    }
    showToast(`Time is over for ${traineeLabel(row)}.`, 'warning');
  }, [prefTraineeSound, queueSync, showToast, timers, traineeLabel]);

  const toggleTimer = useCallback((row: string) => {
    const currentTimer = timers[row];
    if (currentTimer && computeCurrentRemaining(currentTimer) <= 0) return;
    const wasRunning = timers[row]?.running ?? false;
    setTimers((prev) => {
      const t = prev[row] ?? { remainingSeconds: (session.trainee_timer || 12) * 60, running: false, syncedAt: Date.now() };
      if (!t.running) return { ...prev, [row]: { ...t, running: true, syncedAt: Date.now() } };
      return { ...prev, [row]: { ...t, running: false, remainingSeconds: computeCurrentRemaining(t) } };
    });
    queueSync('timers');
    showToast(`Timer ${wasRunning ? 'paused' : 'started'} for ${traineeLabel(row)}.`, wasRunning ? 'info' : 'success');
  }, [queueSync, session.trainee_timer, showToast, timers, traineeLabel]);

  const resetTimer = useCallback((row: string, totalSeconds: number) => {
    expiredTimerRowsRef.current.delete(row);
    setTimers((prev) => ({ ...prev, [row]: { remainingSeconds: totalSeconds, running: false, syncedAt: Date.now(), setupSeconds: prev[row]?.setupSeconds } }));
    queueSync('timers');
    showToast(`Timer reset for ${traineeLabel(row)}.`, 'success');
  }, [queueSync, showToast, traineeLabel]);

  const setTimerValue = useCallback((row: string, mmss: string) => {
    const parts = mmss.split(':').map((n) => parseInt(n, 10) || 0);
    const remainingSeconds = Math.max(0, parts.length === 2 ? parts[0] * 60 + parts[1] : parseInt(mmss, 10) || 0);
    if (remainingSeconds > 0) expiredTimerRowsRef.current.delete(row);
    setTimers((prev) => ({
      ...prev,
      [row]: {
        ...(prev[row] ?? { remainingSeconds, running: false, syncedAt: Date.now() }),
        remainingSeconds,
        running: remainingSeconds > 0 ? (prev[row]?.running ?? false) : false,
        syncedAt: Date.now(),
      },
    }));
    queueSync('timers');
    showToast(`Timer updated for ${traineeLabel(row)}.`, 'success');
  }, [queueSync, showToast, traineeLabel]);

  const recordSetupDone = useCallback((row: string, totalSeconds: number) => {
    if (timers[row]?.setupSeconds != null) return;
    setTimers((prev) => {
      const t = prev[row] ?? { remainingSeconds: totalSeconds, running: false, syncedAt: Date.now() };
      if (t.setupSeconds != null) return prev;
      const setupSeconds = Math.max(0, totalSeconds - computeCurrentRemaining(t));
      return { ...prev, [row]: { ...t, setupSeconds } };
    });
    queueSync('timers');
    showToast(`Setup time recorded for ${traineeLabel(row)}.`, 'success');
  }, [queueSync, showToast, timers, traineeLabel]);

  const editTimeTrackerEntry = useCallback((key: keyof TimeTracker) => {
    const recordedAt = timeTracker[key];
    if (!recordedAt) return;
    const current = formatInstantInSiteTimezone(new Date(recordedAt), timezoneMode, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const input = window.prompt(`Adjust the logged time (HH:MM ${timezoneMode}):`, current)?.trim();
    if (input == null) return;
    const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(input);
    if (!match) {
      showToast('Enter the time in 24-hour HH:MM format.', 'warning');
      return;
    }
    const [currentHour, currentMinute] = current.split(':').map(Number);
    const [nextHour, nextMinute] = input.split(':').map(Number);
    let deltaMinutes = (nextHour * 60 + nextMinute) - (currentHour * 60 + currentMinute);
    if (deltaMinutes > 720) deltaMinutes -= 1440;
    if (deltaMinutes < -720) deltaMinutes += 1440;
    setTimeTracker((prev) => ({ ...prev, [key]: recordedAt + deltaMinutes * 60_000 }));
    queueSync('timeTracker');
    const label = key === 'briefingStart' ? 'Briefing start' : key === 'sgShiftStart' ? 'SG Shift start' : 'Screenie time';
    showToast(`${label} adjusted to ${input} ${timezoneMode}.`, 'success');
  }, [queueSync, showToast, timeTracker, timezoneMode]);

  // moveSlot stays here (rather than up with allocatedRows/rowOrder above)
  // since it depends on `locked`, which isn't computed until later in the
  // component body.
  const moveSlot = useCallback((row: string, dir: 'up' | 'down') => {
    if (locked.slotOrder) return;
    setRowOrder((prev) => {
      const i = prev.indexOf(row);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (i === -1 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    queueSync('slotOrder');
    showToast(`${traineeLabel(row)} moved one slot ${dir}.`, 'success');
  }, [locked.slotOrder, queueSync, showToast, traineeLabel]);

  // ── column show/hide — mirrors TRAINEE_COLUMNS / EXTRA_COLUMNS / hide-extras-btn ──
  const [hiddenCols, setHiddenCols] = useState<Set<number>>(new Set());
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) setColPickerOpen(false);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);
  const hideExtras = useCallback(() => setHiddenCols(new Set(EXTRA_COLUMN_NUMS)), []);
  const showAllCols = useCallback(() => setHiddenCols(new Set()), []);
  const toggleCol = useCallback((n: number, visible: boolean) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(n); else next.add(n);
      return next;
    });
  }, []);

  // ── Document Picture-in-Picture pop-outs ──
  // Uses the real window.documentPictureInPicture API (Chrome/Edge only —
  // same browser support the original had). Content is rendered via
  // createPortal into the new window's own document, so it's genuine React
  // (with live state/handlers) rather than the original's manual
  // innerHTML + addEventListener wiring.
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [pipKind, setPipKind] = useState<'trainee' | 'timer' | 'briefing' | null>(null);
  const [pipRow, setPipRow] = useState<string | null>(null);
  const [pipCopyFlash, setPipCopyFlash] = useState(false);
  const [pipScriptVisible, setPipScriptVisible] = useState(false);
  useEffect(() => { setPipScriptVisible(false); }, [pipRow, pipKind]);

  const pipSupported = useCallback(() => typeof window !== 'undefined' && 'documentPictureInPicture' in window, []);

  const openPip = useCallback(async (kind: 'trainee' | 'timer' | 'briefing', row: string, opts: { width: number; height: number; title: string }) => {
    if (!pipSupported()) {
      showToast('Real pop-out windows need Chrome or Edge (Document Picture-in-Picture). This browser doesn\u2019t support it.');
      return;
    }
    if (pipWindow && !pipWindow.closed && pipKind === kind && pipRow === row) {
      pipWindow.focus();
      return;
    }
    try {
      // documentPictureInPicture isn't in TS's lib.dom.d.ts yet
      const dpip = (window as unknown as { documentPictureInPicture: { requestWindow: (o: { width: number; height: number }) => Promise<Window> } }).documentPictureInPicture;
      const win = await dpip.requestWindow({ width: opts.width, height: opts.height });
      win.document.title = opts.title;

      // Copy every stylesheet from the main document (including the CSS
      // Modules <style> tags Next.js injects) so styles.xxx classes still
      // apply inside the new window — same technique the original used.
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          const rules = Array.from(sheet.cssRules).map((r) => r.cssText).join('');
          const style = win.document.createElement('style');
          style.textContent = rules;
          win.document.head.appendChild(style);
        } catch {
          if (!sheet.href) return;
          const link = win.document.createElement('link');
          link.rel = 'stylesheet';
          link.href = sheet.href;
          win.document.head.appendChild(link);
        }
      });

      win.addEventListener('pagehide', () => {
        setPipWindow((cur) => (cur === win ? null : cur));
        setPipKind((cur) => (cur === kind ? null : cur));
        setPipRow((cur) => (cur === row ? null : cur));
      }, { once: true });

      setPipWindow(win);
      setPipKind(kind);
      setPipRow(row);
    } catch {
      showToast('Could not open pop-out window.');
    }
  }, [pipSupported, pipWindow, pipKind, pipRow, showToast]);

  const openTraineePip = useCallback((row: string) => { openPip('trainee', row, { width: 320, height: 560, title: 'Trainee pop-out' }); }, [openPip]);
  const openTimerPip = useCallback((row: string) => { openPip('timer', row, { width: 220, height: 210, title: 'Timer pop-out' }); }, [openPip]);
  const openBriefingPip = useCallback(() => {
    if (briefingAvailable) void openPip('briefing', 'host-script', { width: 440, height: 660, title: 'Host / Co-host Briefing Script' });
  }, [briefingAvailable, openPip]);
  useEffect(() => {
    if (!briefingAvailable && pipKind === 'briefing' && pipWindow && !pipWindow.closed) pipWindow.close();
  }, [briefingAvailable, pipKind, pipWindow]);

  const removeAllocatedTrainee = useCallback((row: string) => {
    if (locked.trainees) return;
    const label = traineeLabel(row);
    setTraineeDetails((prev) => ({
      ...prev,
      [row]: { discord: '', discordId: '', roblox: '', zone: '', trainerName: '', notes: '' },
    }));
    setAttendance((prev) => ({ ...prev, [row]: false }));
    setCompletedRows((prev) => ({ ...prev, [row]: false }));
    dirtyRef.current.traineeRows.add(row);
    dirtyRef.current.attendance = true;
    queueSync('completedRows');
    showToast(`${label} removed from the slot.`, 'success');
  }, [locked.trainees, queueSync, showToast, traineeLabel]);

  const addUnallocatedTrainee = useCallback(() => {
    if (locked.trainees) return;
    if (!isWithinSessionTraineeLimit(traineeSlotCount, 1)) {
      showToast(SESSION_TRAINEE_LIMIT_MESSAGE, 'warning');
      return;
    }
    setUnallocated((prev) => [...prev, { uid: newUid(), discord: '', discordId: '', roblox: '', zone: '', notes: '', trainerName: '' }]);
    queueSync('unallocatedTrainees');
    showToast('Unallocated trainee added.', 'success');
  }, [locked.trainees, queueSync, showToast, traineeSlotCount]);

  const toggleComplete = useCallback((row: string) => {
    if (isAssistant) return;
    const willComplete = !completedRows[row];
    setCompletedRows((prev) => ({ ...prev, [row]: !prev[row] }));
    queueSync('completedRows');
    showToast(`${traineeLabel(row)} marked ${willComplete ? 'completed' : 'not completed'}.`, willComplete ? 'success' : 'warning');
  }, [isAssistant, queueSync, showToast, completedRows, traineeLabel]);

  // ── feedback modal (replaces openFeedbackModal / fb-save et al.) ──
  const getFeedback = useCallback((row: string) => feedbackData[row] ?? { trains: '', setup: '', conflict: '', priority: '', rbtiming: '', overall: '', notes: '' }, [feedbackData]);
  const updateFeedback = useCallback((row: string, field: string, value: string) => {
    setFeedbackData((prev) => ({ ...prev, [row]: { ...getFeedback(row), [field]: value } }));
    queueSync('feedbackData');
  }, [getFeedback, queueSync]);
  const uploadFeedbackImage = useCallback(async (row: string, file: File) => {
    imageUploadingRef.current = true;
    setImageUploading(true);
    let reservationId: string | null = null;
    try {
      const endpoint = `/api/session/${sessionId}/feedback-images`;
      const prepared = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prepare', slot_number: Number(row) + 1, file_name: file.name, content_type: file.type, size_bytes: file.size }),
      });
      const reservation = await prepared.json() as { success?: boolean; message?: string; id?: string };
      if (!prepared.ok || !reservation.success || !reservation.id) throw new Error(reservation.message || 'Could not prepare upload.');
      reservationId = reservation.id;
      const form = new FormData();
      form.set('id', reservationId);
      form.set('image', file);
      const response = await fetch(endpoint, { method: 'POST', body: form });
      const result = await response.json() as { success?: boolean; message?: string; image?: FeedbackImage };
      if (!response.ok || !result.success || !result.image) throw new Error(result.message || 'Could not save image.');
      reservationId = null;
      setFeedbackImages((current) => ({ ...current, [row]: [...(current[row] ?? []), result.image!] }));
    } catch (error) {
      if (reservationId) void fetch(`/api/session/${sessionId}/feedback-images`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: reservationId }),
      }).catch(() => {});
      showToast(error instanceof Error ? error.message : 'Upload failed.', 'error');
    } finally {
      imageUploadingRef.current = false;
      setImageUploading(false);
    }
  }, [sessionId, showToast]);
  const removeFeedbackImage = useCallback(async (row: string, id: string) => {
    imageUploadingRef.current = true;
    setImageUploading(true);
    try {
      const response = await fetch(`/api/session/${sessionId}/feedback-images`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      });
      const result = await response.json() as { success?: boolean; message?: string };
      if (!response.ok || !result.success) throw new Error(result.message || 'Remove failed.');
      setFeedbackImages((current) => ({ ...current, [row]: (current[row] ?? []).filter((image) => image.id !== id) }));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Remove failed.', 'error');
    } finally {
      imageUploadingRef.current = false;
      setImageUploading(false);
    }
  }, [sessionId, showToast]);

  // Builds the same formatted feedback message the modal's "Copy" button
  // produces — ported from buildFeedbackMessageForRow() in the original.
  // (Declared after getFeedback/updateFeedback above, since it depends on them.)
  const buildFeedbackMessageForRow = useCallback((row: string) => {
    const detail = traineeDetails[row] ?? buildTraineeDetail(session, row);
    const fb = getFeedback(row);
    const t = timers[row];
    const setupTimeVal = t?.setupSeconds != null ? fmt(t.setupSeconds) : '';
    const [y, m, d] = (session.session_date || '').split('-');
    const datePart = y && m && d ? `${d}/${m}/${y}` : '__/__/____';
    const timePart = session.session_time || '--:--';

    return `# Practice Feedback
**Trainer**: ${detail.trainerName}
**Date of session**: ${datePart} | ${timePart} ${timezoneMode}
**Zone**: ${detail.zone}
**Trains signalled**: ${fb.trains || ''}
**Set-up time**: ${setupTimeVal}

=========================

__**Zone Setup**__
${fb.setup || ''}

__**Conflict Handling**__
${fb.conflict || ''}

__**Priority Handling**__
${fb.priority || ''}

__**Rollbacks and Delay**__
${fb.rbtiming || ''}

__**Overall**__
${fb.overall || ''}

__*Notes/Advice*__
${fb.notes || ''}
${(feedbackImages[row] ?? []).length ? `
__**Reference images**__
${(feedbackImages[row] ?? []).map((image, index) => `${index + 1}. ${image.url}`).join('\n')}
` : ''}

If you believe you were unfairly assessed or have any additional questions, feel free to ask!
Thank you for attending.`;
  }, [traineeDetails, buildTraineeDetail, session, getFeedback, timers, timezoneMode, feedbackImages]);

  // ── bell system (replaces ringBell/ackBell/pollBell) ──
  const ringBell = useCallback(async (role: 'host' | 'cohost') => {
    const res = await fetch(`/api/session/${sessionId}/bell`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, action: 'ring', role, client_id: myClientId }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Could not ring bell.'); return; }
    setBell(data);
  }, [sessionId, myClientId, showToast]);

  const ackBell = useCallback(async (role: 'host' | 'cohost' | 'assistant') => {
    const res = await fetch(`/api/session/${sessionId}/bell`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, action: 'ack', role, client_id: myClientId }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Could not acknowledge.'); return; }
    setBell(data);
  }, [sessionId, myClientId, showToast]);

  // NOTE: paths assume sound files live under public/assets/sounds/ — same
  // relative layout as the original PHP app. Adjust if yours differ.
  const hostRingSoundRef = useRef<HTMLAudioElement>(null);
  const cohostAckSoundRef = useRef<HTMLAudioElement>(null);
  const assistantAckSoundRef = useRef<HTMLAudioElement>(null);
  const playSound = useCallback((ref: React.RefObject<HTMLAudioElement | null>) => {
    if (!ref.current) return;
    ref.current.currentTime = 0;
    ref.current.play().catch(() => {});
  }, []);

  const sessionHasCohost = Boolean(session.co_host1 || session.co_host2 || session.co_host3 || session.co_host4_supervisor);
  const sessionHasAssistant = Boolean(session.assistant_1 || session.assistant_2 || session.assistant_3 || session.assistant_4);

  // Replaces the pollBell() diffing logic: watches for active/ack transitions
  // (whether triggered by this client's own ring/ack call or a realtime push
  // from someone else) and reacts with the matching sound + end-of-cycle toast.
  const prevBellRef = useRef<BellStateRow | null>(null);
  useEffect(() => {
    const prev = prevBellRef.current;
    if (bell) {
      if (!prev?.active && bell.active) playSound(hostRingSoundRef);
      (['cohost', 'assistant'] as const).forEach((r) => {
        if (!prev?.acks[r] && bell.acks[r]) playSound(r === 'cohost' ? cohostAckSoundRef : assistantAckSoundRef);
      });
      if (prev?.active && !bell.active) {
        const requiredRoles = (['host', 'cohost', 'assistant'] as const).filter((r) => {
          if (r === prev.initiator_role) return false;
          if (r === 'cohost' && !sessionHasCohost) return false;
          if (r === 'assistant' && !sessionHasAssistant) return false;
          return true;
        });
        const everyoneAcked = requiredRoles.every((r) => prev.acks[r]);
        showToast(everyoneAcked
          ? 'Everyone acknowledged the bell — entering a 5 minute cooldown.'
          : 'Bell timed out waiting on an acknowledgment — entering a 5 minute cooldown.');
      }
    }
    prevBellRef.current = bell;
  }, [bell, sessionHasCohost, sessionHasAssistant, showToast, playSound]);

  // ── per-button disabled/awaiting-ack/acked state — mirrors renderBellState() ──
  const getBellButtonState = useCallback((role: 'host' | 'cohost' | 'assistant') => {
    const active = bell?.active ?? false;
    const initiatorRole = bell?.initiator_role ?? null;
    const acks = bell?.acks ?? { host: false, cohost: false, assistant: false };
    const ringCount = bell?.ring_count ?? 0;
    const lastRingAtMs = bell?.last_ring_at ? new Date(bell.last_ring_at).getTime() : 0;
    const globalCooldownActive = bell?.cooldown_until ? new Date(bell.cooldown_until).getTime() > bellNow : false;
    const localCooldownActive = (bellLocalCooldownUntil[role] ?? 0) > bellNow;

    const awaitingAck = active && role !== initiatorRole && !acks[role];
    const acked = active && acks[role];

    let disabled = globalCooldownActive || localCooldownActive;
    if (role === 'assistant') {
      disabled = disabled || (active ? acks.assistant : true); // assistants can only ack, never initiate
    } else {
      const isInitiatorActive = active && initiatorRole === role;
      const canReRing = isInitiatorActive && ringCount < 3 && bellNow - lastRingAtMs >= 5000;
      disabled = disabled || (active ? (isInitiatorActive ? !canReRing : acks[role]) : false);
    }
    return { disabled, awaitingAck, acked };
  }, [bell, bellNow, bellLocalCooldownUntil]);

  const handleBellClick = useCallback((role: 'host' | 'cohost' | 'assistant') => {
    if (myRole !== role) {
      showToast(`Only ${role === 'host' ? 'the Host' : role === 'cohost' ? 'a Co-Host' : 'an Assistant'} can use this bell.`);
      return;
    }
    if (getBellButtonState(role).disabled) return;

    if (role === 'assistant') {
      if (!bell?.active) { showToast('Assistants can only acknowledge an active bell.'); return; }
      ackBell('assistant');
    } else {
      if (!bell?.active || bell.initiator_role === role) ringBell(role);
      else ackBell(role);
    }
    reportActive(true);
    setBellLocalCooldownUntil((prev) => ({ ...prev, [role]: Date.now() + 5000 }));
  }, [myRole, bell, ringBell, ackBell, getBellButtonState, reportActive, showToast]);

  // ── conclude session (replaces #conclude-session-btn handler) ──
  const [concludeOpen, setConcludeOpen] = useState(false);
  const concludeSession = useCallback(async () => {
    if (imageUploadingRef.current) { showToast('Wait for the image upload to finish before concluding.', 'warning'); return; }
    const incomplete = allocatedRows.filter((r) => !completedRows[r]);
    let html = `You're about to conclude this session. This finalizes the session record — the status will be set to Concluded and it can no longer be edited as an active session.`;
    if (statusValue === 'cancelled') html += `\n\nIf the session status is currently Cancelled, concluding it will record the session as cancelled-and-concluded — make sure that's intended.`;
    if (incomplete.length) html += `\n\n${incomplete.length} trainee(s) have not been marked done yet.`;
    const ok = await showConfirm(html, 'Conclude this session?');
    if (!ok) return;

    const saved = await pushState();
    if (!saved) {
      showToast('Could not conclude because the latest changes are not saved yet.');
      return;
    }
    const result = await fetch(`/api/session/${sessionId}/bell/conclude`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    }).then((r) => r.json());

    if (!result.success) { showToast('Failed to conclude: ' + (result.message || 'Unknown error')); return; }
    localStorage.removeItem(draftKey);
    showToast('Session concluded and archived. Redirecting...');
    setTimeout(() => { window.location.href = '/dashboard'; }, 2000);
  }, [allocatedRows, completedRows, statusValue, showConfirm, pushState, sessionId, showToast, draftKey]);

  const concludeUnlocked = isHost && (statusValue === 'cancelled' || statusValue === 'concluded');

  // ── announcement resolve (per-trainee zone template, replaces resolveAnnouncement) ──
  const resolveAnnouncement = useCallback((traineeDiscordId: string, trainerDiscordId: string, zone: string) => {
    const info = zone ? ZONE_DATA[zone] : null;
    const mention = (discordId: string, fallback: string) => {
      const id = discordId.trim();
      return /^\d+$/.test(id) ? `<@${id}>` : `[${fallback}]`;
    };
    return ANNOUNCEMENT_TEMPLATE
      .replaceAll('[ZONE COVERAGE]', info?.coverage ?? '[ZONE COVERAGE]')
      .replaceAll('[DEPOT & SIDING (WITHIN ZONE)]', info?.depot ?? '[DEPOT & SIDING (WITHIN ZONE)]')
      .replaceAll('[DEPOT & SIDING NEARBY ZONE]', info?.depotNearby ?? '[DEPOT & SIDING NEARBY ZONE]')
      .replaceAll('[NOTES]', info?.notes ?? '[NOTES]')
      .replaceAll('[TRAINEE]', mention(traineeDiscordId, 'TRAINEE DISCORD ID REQUIRED'))
      .replaceAll('[TRAINER]', mention(trainerDiscordId, 'TRAINER DISCORD ID REQUIRED'))
      .replaceAll('[ZONE]', zone || '[ZONE]');
  }, []);

  // ── station generator ──
  const [stationName, setStationName] = useState(STATION_LIST[0].name);
  const handleLockedFieldPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const control = (event.target as HTMLElement).closest('input, select, textarea') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (!control?.disabled) return;
    const configuredReason = control.dataset.lockReason;
    const isReadOnlyValue = 'readOnly' in control && control.readOnly;
    let reason: string;
    if (isReadOnlyValue) {
      reason = configuredReason || 'This value is filled automatically from the related selection.';
    } else if (isHost) {
      if (configuredReason?.startsWith('Session status is locked')) {
        reason = 'Session status is locked. Enable Override Session Details in Session Controls, or mark every trainee done.';
      } else if (configuredReason) {
        reason = configuredReason
          .replace(/Ask the Host to enable ([^.]+)\.?/i, 'Enable $1 in Session Controls.')
          .replace(/Ask the Host to turn off ([^.]+)\.?/i, 'Turn off $1 in Session Controls.');
      } else {
        reason = 'This field is locked. Enable its corresponding override in Session Controls.';
      }
    } else {
      reason = configuredReason || 'This field is locked by the current session controls. Ask the Host to enable its override.';
    }
    showToast(reason, 'warning');
  }, [isHost, showToast]);

  return (
    <div
      className={styles.wrap}
      onPointerDownCapture={handleLockedFieldPointer}
    >
      {/* AppShell already renders the app-wide header/profile and the
          LIVE SESSION pill, via LiveStatusPill reading the same
          LiveSessionContext this component reports into above. */}
      <main>
        <div className={styles.sessionHead}>
          <div className={styles.sessionTitle}>Session #{sessionId} — {session.session_name || 'Untitled Session'}</div>
          <div className={styles.sessionSub}>Viewing as <strong>{viewerRole}</strong></div>
        </div>

        {/* ── Session Controls (host only) ── */}
        {isHost && (
          <section className={styles.panel}>
            <div className={styles.panelTitle}>Session Controls</div>
            <div className={styles.overrideColumns}>
              <div className={styles.overrideCol}>
                <div className={styles.overrideGroupTitle}>Session</div>
                <button className={`${styles.ovrBtn} ${overrides['session-details'] ? styles.on : ''}`} onClick={() => toggleOverride('session-details')}>
                  <FontAwesomeIcon icon={ICONS.lock} /> Override Session Details
                </button>
                <button className={`${styles.ovrBtn} ${overrides.trainees ? styles.on : ''}`} onClick={() => toggleOverride('trainees')}>
                  <FontAwesomeIcon icon={ICONS.userPlus} /> Enable Add/Delete Trainees
                </button>
                <button className={`${styles.ovrBtn} ${overrides['trainee-details'] ? styles.on : ''}`} onClick={() => toggleOverride('trainee-details')}>
                  <FontAwesomeIcon icon={ICONS.idCard} /> Override Trainee Details
                </button>
                <button className={`${styles.ovrBtn} ${overrides['slot-order'] ? styles.on : ''}`} onClick={() => toggleOverride('slot-order')}>
                  <FontAwesomeIcon icon={ICONS.arrowUpWideShort} /> Override Slot Ordering
                </button>
              </div>
              <div className={styles.overrideCol}>
                <div className={styles.overrideGroupTitle}>Assistant Control</div>
                <button className={`${styles.ovrBtn} ${overrides['staff-roles'] ? styles.on : ''}`} onClick={() => toggleOverride('staff-roles')}>
                  <FontAwesomeIcon icon={ICONS.userShield} /> Allow Main AST Override Staff Roles
                </button>
                <button className={`${styles.ovrBtn} ${overrides['drivers-disable'] ? styles.on : ''}`} onClick={() => toggleOverride('drivers-disable')}>
                  <FontAwesomeIcon icon={ICONS.ban} /> Disable Assistant Input on Drivers
                </button>
              </div>
              <div className={styles.overrideCol}>
                <div className={styles.overrideGroupTitle}>Host Control</div>
                <button className={`${styles.ovrBtn} ${overrides['trainer-details'] ? styles.on : ''}`} onClick={() => toggleOverride('trainer-details')}>
                  <FontAwesomeIcon icon={ICONS.chalkboardUser} /> Override Trainer Assignment
                </button>
                <button className={`${styles.ovrBtn} ${overrides['staff-delete'] ? styles.on : ''}`} onClick={() => toggleOverride('staff-delete')}>
                  <FontAwesomeIcon icon={ICONS.userSlash} /> Override Staff Deletion
                </button>
                <button
                  className={`${styles.ovrBtn} ${overrides['staff-addition'] ? styles.on : ''}`}
                  onClick={() => toggleOverride('staff-addition')}
                >
                  <FontAwesomeIcon icon={ICONS.userPlus} /> Allow Staff Addition
                </button>
                <button className={`${styles.ovrBtn} ${styles.hostOnly} ${styles.dangerous} ${overrides['allow-all'] ? styles.on : ''}`} onClick={() => toggleOverride('allow-all')}>
                  <FontAwesomeIcon icon={ICONS.triangleExclamation} /> Allow Override for Everyone
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Session Details ── */}
        <section className={styles.panel}>
          <div className={styles.panelTitle}>
            Session Details
            <span className={locked.sessionDetails ? styles.lockTagLocked : styles.lockTagUnlocked}>
              <FontAwesomeIcon icon={locked.sessionDetails ? ICONS.lock : ICONS.lockOpen} /> {locked.sessionDetails ? 'Locked' : 'Unlocked'}
            </span>
          </div>
          <div className={styles.infoGrid}>
            {/* Row 1 — Host / Discord ID / Date / Time (4 cells, 1 per column) */}
            <div className={styles.infoCell}>
              <div className={styles.infoLabel}>Session Host</div>
              <select
                className={styles.cellInput}
                disabled={locked.sessionDetails}
                data-lock-reason="Session details are locked. Ask the Host to enable Override Session Details."
                value={session.host ?? ''}
                onChange={(e) => {
                  setSession((s) => ({ ...s, host: e.target.value }));
                  dirtyRef.current.details = true;
                  queueSync();
                }}
              >
                <option value="">— None —</option>
                {hostOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className={styles.infoCell}>
              <div className={styles.infoLabel}>Discord ID</div>
              {/* Always locked — auto-synced from the selected Host, same as the original */}
              <input className={styles.cellInput} readOnly disabled data-lock-reason="Discord ID is filled automatically from the selected Session Host." value={staffDirectory[session.host ?? ''] ?? ''} />
            </div>
            <div className={styles.infoCell}>
              <div className={styles.infoLabel}>Session Date</div>
              <input
                type="date"
                className={styles.cellInput}
                disabled={locked.sessionDetails}
                data-lock-reason="Session details are locked. Ask the Host to enable Override Session Details."
                value={session.session_date ?? ''}
                onChange={(e) => {
                  setSession((s) => ({ ...s, session_date: e.target.value }));
                  dirtyRef.current.details = true;
                  queueSync();
                }}
              />
            </div>
            <div className={styles.infoCell}>
              <div className={styles.infoLabel}>Session Time</div>
              <input
                type="time"
                lang="en-GB"
                className={styles.cellInput}
                disabled={locked.sessionDetails}
                data-lock-reason="Session details are locked. Ask the Host to enable Override Session Details."
                value={session.session_time ?? ''}
                onChange={(e) => {
                  setSession((s) => ({ ...s, session_time: e.target.value }));
                  dirtyRef.current.details = true;
                  queueSync();
                }}
              />
            </div>

            {/* Row 2 — Status (spans 2 cols) / Signal Time / Elapsed Time */}
            <div className={styles.infoCell} style={{ gridColumn: '1 / 3' }}>
              <div className={styles.statusCell}>
                <div className={styles.statusRowSelect}>
                  <div className={styles.infoLabel}>Session Status</div>
                  <select
                    className={styles.cellInput}
                    value={statusValue}
                    disabled={!statusUnlocked}
                    data-lock-reason="Session status is locked until the Host enables Session Details or every trainee is marked done."
                    onChange={(e) => {
                      const nextStatus = e.currentTarget.value;
                      const nextLabel = e.currentTarget.options[e.currentTarget.selectedIndex]?.text || nextStatus;
                      setStatusValue(nextStatus);
                      dirtyRef.current.status = true;
                      queueSync();
                      showToast(`Session status changed to ${nextLabel}.`, 'success');
                    }}
                  >
                    <option value="inprogress">In Progress</option>
                    <option value="paused">Paused</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="concluded">Concluded</option>
                  </select>
                  <div className={styles.statusUnlockHint}>
                    {isHost
                      ? 'Unlocked — Host'
                      : statusUnlocked
                        ? 'Unlocked — Override Session Details active'
                        : 'Locked — unlocks once all trainees are marked done'}
                  </div>
                </div>
                <div className={styles.statusRowBadge}>
                  <span
                    className={`${styles.statusBadge} ${styles.statusBadgeLarge} ${
                      statusValue === 'inprogress' ? styles.statusInprogress
                        : statusValue === 'paused' ? styles.statusPaused
                        : statusValue === 'cancelled' ? styles.statusCancelled
                        : statusValue === 'concluded' ? styles.statusConcluded
                        : ''
                    }`}
                  >
                    <span className={styles.statusDot} />
                    {statusValue === 'inprogress' ? 'In Progress'
                      : statusValue === 'paused' ? 'Paused'
                      : statusValue === 'cancelled' ? 'Cancelled'
                      : statusValue === 'concluded' ? 'Concluded'
                      : session.session_status || statusValue}
                  </span>
                </div>
              </div>
            </div>
            <div className={styles.infoCell} style={{ gridColumn: '3 / 4' }}>
              <div className={styles.infoLabel}>Trainee Signal Time</div>
              <div className={styles.signalTimeWrap}>
                <input
                  type="number"
                  min={1}
                  max={60}
                  className={`${styles.cellInput} ${styles.signalTimeInput}`}
                  disabled={locked.sessionDetails}
                  data-lock-reason="Signal time is locked. Ask the Host to enable Override Session Details."
                  value={session.trainee_timer ?? 12}
                  onChange={(e) => {
                    const parsed = parseInt(e.currentTarget.value, 10);
                    if (Number.isNaN(parsed)) return;
                    const val = Math.max(1, Math.min(60, parsed));
                    setSession((s) => ({ ...s, trainee_timer: val }));
                    dirtyRef.current.details = true;
                    queueSync();
                  }}
                />
                <span className={styles.signalTimeSuffix}>min</span>
                <button
                  type="button"
                  className={styles.miniOverrideBtn}
                  disabled={locked.sessionDetails}
                  onClick={applySignalTime}
                  title="Apply to all trainees"
                >
                  <FontAwesomeIcon icon={ICONS.check} />
                </button>
              </div>
              <div className={styles.statusUnlockHint}>Applies to every trainee&apos;s countdown</div>
            </div>
            <div className={styles.infoCell} style={{ gridColumn: '4 / 5' }}>
              <div className={styles.infoLabel}>Session Elapsed Time</div>
              <SessionElapsedClock
                startedAt={session.started_at}
                scheduledStartIso={scheduledStartIso}
                durationMinutes={parseInt(session.session_duration as unknown as string, 10) || 0}
              />
            </div>
          </div>
        </section>

        {/* ── Trainees table ── */}
        <section className={`${styles.panel} ${styles.panelAllowOverflow}`}>
          <div className={styles.panelTitle}>
            Trainees Panel
            <div className={styles.columnControls} ref={colPickerRef}>
              <button type="button" className={styles.colCtrlBtn} onClick={hideExtras}>Hide extras</button>
              <button type="button" className={styles.colCtrlBtn} onClick={showAllCols}>Show all</button>
              <div className={styles.colPickerWrap}>
                <button type="button" className={styles.colCtrlBtn} onClick={() => setColPickerOpen((o) => !o)}>
                  <FontAwesomeIcon icon={ICONS.tableColumns} /> Columns
                </button>
                <div className={`${styles.colPickerMenu} ${colPickerOpen ? styles.open : ''}`}>
                  {TRAINEE_COLUMNS.map((col) => (
                    <label key={col.n} className={styles.colPickerRow}>
                      <input
                        type="checkbox"
                        checked={!hiddenCols.has(col.n)}
                        onChange={(e) => toggleCol(col.n, e.target.checked)}
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.resizableCols}>
              <thead>
                <tr>
                  {TRAINEE_COLUMNS.map((col) => !hiddenCols.has(col.n) && (
                    <th key={col.n} style={{ minWidth: col.minWidth, maxWidth: col.maxWidth, width: colWidths[col.n] ?? col.width }}>
                      {col.label}
                      <ColResizeHandle onResize={(w) => setColWidths((prev) => ({ ...prev, [col.n]: w }))} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allTraineeRows.map((row, orderIndex) => {
                  const isStandby = standbyRows.includes(row);
                  const t = timers[row] ?? { remainingSeconds: (session.trainee_timer || 12) * 60, running: false, syncedAt: Date.now() };
                  const detail = traineeDetails[row] ?? buildTraineeDetail(session, row);
                  return (
                    <tr key={row}>
                      {!hiddenCols.has(1) && (
                        <td style={{ textAlign: 'center' }}>
                          <button type="button" className={styles.pipBtn} title="Pop out this trainee" onClick={() => openTraineePip(row)}>
                            <FontAwesomeIcon icon={ICONS.clone} />
                          </button>
                        </td>
                      )}
                      {!hiddenCols.has(2) && (
                        <td>
                          {isStandby ? (
                            <span className={`${styles.slotNum} ${styles.standbySlot}`}>Standby</span>
                          ) : <div className={styles.slotCell}>
                            <button
                              type="button"
                              className={`${styles.orderBtn} ${locked.slotOrder ? styles.locked : ''}`}
                              disabled={orderIndex === 0}
                              onClick={() => lockedClick(locked.slotOrder, 'Slot ordering is locked. Ask the host to enable Override Slot Ordering.', () => moveSlot(row, 'up'))}
                            >
                              <FontAwesomeIcon icon={ICONS.caretUp} />
                            </button>
                            <span className={styles.slotNum}>{orderIndex + 1}</span>
                            <button
                              type="button"
                              className={`${styles.orderBtn} ${locked.slotOrder ? styles.locked : ''}`}
                              disabled={orderIndex === rowOrder.length - 1}
                              onClick={() => lockedClick(locked.slotOrder, 'Slot ordering is locked. Ask the host to enable Override Slot Ordering.', () => moveSlot(row, 'down'))}
                            >
                              <FontAwesomeIcon icon={ICONS.caretDown} />
                            </button>
                          </div>}
                        </td>
                      )}
                      {!hiddenCols.has(3) && (
                        <td>
                          <input
                            className={styles.cellInput}
                            disabled={locked.traineeDetails}
                            data-lock-reason="Trainee details are locked. Ask the Host to enable Override Trainee Details."
                            value={detail.discord}
                            onChange={(e) => updateTraineeDetail(row, { discord: e.target.value })}
                          />
                        </td>
                      )}
                      {!hiddenCols.has(4) && (
                        <td>
                          <input
                            className={styles.cellInput}
                            disabled={locked.traineeDetails}
                            data-lock-reason="Trainee details are locked. Ask the Host to enable Override Trainee Details."
                            value={detail.discordId}
                            onChange={(e) => updateTraineeDetail(row, { discordId: e.target.value })}
                          />
                        </td>
                      )}
                      {!hiddenCols.has(5) && (
                        <td>
                          <input
                            className={styles.cellInput}
                            disabled={locked.traineeDetails}
                            data-lock-reason="Trainee details are locked. Ask the Host to enable Override Trainee Details."
                            value={detail.roblox}
                            onChange={(e) => updateTraineeDetail(row, { roblox: e.target.value })}
                          />
                        </td>
                      )}
                      {!hiddenCols.has(6) && (
                        <td>
                          <select
                            className={styles.cellInput}
                            disabled={locked.traineeDetails}
                            data-lock-reason="Trainee details are locked. Ask the Host to enable Override Trainee Details."
                            value={detail.zone}
                            onChange={(e) => updateTraineeDetail(row, { zone: e.target.value })}
                          >
                            <option value="">Select</option>
                            {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                          </select>
                        </td>
                      )}
                      {!hiddenCols.has(7) && (
                        <td className={styles.timerCell}>
                          <div className={styles.timerCellInner}>
                            <LiveTimerText
                              timer={t}
                              fallbackSeconds={(session.trainee_timer || 12) * 60}
                              warningSeconds={prefTraineeWarning ? prefTraineeWarningTimes : []}
                              onWarning={playTraineeWarning.bind(null, row, t.syncedAt)}
                              onExpired={() => expireTimer(row)}
                            />
                            {!isAssistant && (
                              <>
                                <button className={`${styles.timerBtn} ${t.running ? styles.active : ''}`} disabled={!t.running && t.remainingSeconds <= 0} onClick={() => toggleTimer(row)}><FontAwesomeIcon icon={t.running ? ICONS.pause : ICONS.play} /></button>
                                <button className={styles.timerBtn} onClick={() => resetTimer(row, (session.trainee_timer || 12) * 60)}><FontAwesomeIcon icon={ICONS.redo} /></button>
                                <button
                                  className={`${styles.timerBtn} ${t.setupSeconds != null ? styles.recorded : ''}`}
                                  title={t.setupSeconds != null ? 'Setup time recorded — use Edit in Feedback to change it' : 'Mark setup done'}
                                  disabled={t.setupSeconds != null}
                                  onClick={() => recordSetupDone(row, (session.trainee_timer || 12) * 60)}
                                >
                                  <FontAwesomeIcon icon={ICONS.check} />
                                </button>
                                <button
                                  className={styles.timerBtn}
                                  title="Override timer value"
                                  onClick={() => {
                                    const input = window.prompt('Set timer to MM:SS (e.g. 05:30):', fmt(computeCurrentRemaining(t)));
                                    if (input !== null) setTimerValue(row, input);
                                  }}
                                >
                                  <FontAwesomeIcon icon={ICONS.triangleExclamation} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                      {!hiddenCols.has(8) && (
                        <td style={{ textAlign: 'center' }}>
                          <button type="button" className={styles.timerPipBtn} title="Pop out just this timer" onClick={() => openTimerPip(row)}>
                            <FontAwesomeIcon icon={ICONS.stopwatch} />
                          </button>
                        </td>
                      )}
                      {!hiddenCols.has(9) && (
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            className={styles.chk}
                            checked={attendance[row] ?? false}
                            onChange={(e) => updateTraineeAttendance(row, e.currentTarget.checked)}
                          />
                        </td>
                      )}
                      {!hiddenCols.has(10) && (
                        <td>
                          <select
                            className={styles.cellInput}
                            disabled={locked.trainerDetails}
                            data-lock-reason="Trainer assignment is locked. Ask the Host to enable Override Trainer Assignment."
                            value={trainerOptions.find((name) => name.toLowerCase() === detail.trainerName.trim().toLowerCase()) ?? ''}
                            onChange={(e) => {
                              updateTraineeDetail(row, { trainerName: e.target.value });
                              showToast(`Trainer for ${traineeLabel(row)} switched to ${e.target.value || 'None'}.`, 'success');
                            }}
                          >
                            <option value="">— None —</option>
                            {trainerOptions.map((name) => <option key={name.toLowerCase()} value={name}>{name}</option>)}
                          </select>
                        </td>
                      )}
                      {!hiddenCols.has(11) && (
                        <td>
                          {/* Always auto-synced from the selected Trainer, same as Session Host's Discord ID */}
                          <input className={styles.cellInput} readOnly disabled value={staffDirectory[detail.trainerName] ?? ''} />
                        </td>
                      )}
                      {!hiddenCols.has(12) && (
                        <td style={{ textAlign: 'center' }}>
                          {!isAssistant && (
                            <button className={styles.feedbackBtn} onClick={() => setFeedbackModalRow(row)}>
                              <FontAwesomeIcon icon={ICONS.commentDots} /> Feedback
                            </button>
                          )}
                        </td>
                      )}
                      {!hiddenCols.has(13) && (
                        <td style={{ textAlign: 'center' }}>
                          <div className={styles.announcementCell}>
                            <button
                              className={`${styles.announcementCopyBtn} ${copiedKey === `announcement-${row}` ? styles.copied : ''}`}
                              onClick={() => copyWithFeedback(`announcement-${row}`, resolveAnnouncement(detail.discordId, staffDirectory[detail.trainerName] ?? '', detail.zone), `Announcement for ${traineeLabel(row)}`)}
                            >
                              <FontAwesomeIcon icon={copiedKey === `announcement-${row}` ? ICONS.check : ICONS.copy} />
                            </button>
                          </div>
                        </td>
                      )}
                      {!hiddenCols.has(14) && (
                        <td>
                          <textarea
                            className={styles.cellInput}
                            rows={1}
                            disabled={locked.traineeDetails}
                            value={detail.notes}
                            onChange={(e) => updateTraineeDetail(row, { notes: e.target.value })}
                          />
                        </td>
                      )}
                      {!hiddenCols.has(15) && (
                        <td style={{ textAlign: 'center' }}>
                          <button className={`${styles.completeBtn} ${completedRows[row] ? styles.done : ''}`} disabled={isAssistant} onClick={() => toggleComplete(row)}>
                            {completedRows[row] ? 'Done' : 'Mark done'}
                          </button>
                        </td>
                      )}
                      {!hiddenCols.has(16) && (
                        <td style={{ textAlign: 'center' }}>
                          <button className={styles.rowDelBtn} disabled={locked.trainees} onClick={() => removeAllocatedTrainee(row)}><FontAwesomeIcon icon={ICONS.trash} /></button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {unallocated.map((u) => (
                  <tr key={u.uid}>
                    {!hiddenCols.has(1) && <td />}
                    {!hiddenCols.has(2) && <td><span className={styles.slotNum}>Unalloc.</span></td>}
                    {!hiddenCols.has(3) && (
                      <td>
                        <input
                          className={styles.cellInput}
                          disabled={locked.traineeDetails}
                          data-lock-reason="Trainee details are locked. Ask the Host to enable Override Trainee Details."
                          value={u.discord}
                          onChange={(e) => { setUnallocated((prev) => prev.map((x) => x.uid === u.uid ? { ...x, discord: e.target.value } : x)); queueSync('unallocatedTrainees'); }}
                        />
                      </td>
                    )}
                    {!hiddenCols.has(4) && (
                      <td>
                        <input
                          className={styles.cellInput}
                          disabled={locked.traineeDetails}
                          data-lock-reason="Trainee details are locked. Ask the Host to enable Override Trainee Details."
                          value={u.discordId}
                          onChange={(e) => { setUnallocated((prev) => prev.map((x) => x.uid === u.uid ? { ...x, discordId: e.target.value } : x)); queueSync('unallocatedTrainees'); }}
                        />
                      </td>
                    )}
                    {!hiddenCols.has(5) && (
                      <td>
                        <input
                          className={styles.cellInput}
                          disabled={locked.traineeDetails}
                          data-lock-reason="Trainee details are locked. Ask the Host to enable Override Trainee Details."
                          value={u.roblox}
                          onChange={(e) => { setUnallocated((prev) => prev.map((x) => x.uid === u.uid ? { ...x, roblox: e.target.value } : x)); queueSync('unallocatedTrainees'); }}
                        />
                      </td>
                    )}
                    {!hiddenCols.has(6) && (
                      <td>
                        <select
                          className={styles.cellInput}
                          disabled={locked.traineeDetails}
                          data-lock-reason="Trainee details are locked. Ask the Host to enable Override Trainee Details."
                          value={u.zone}
                          onChange={(e) => { setUnallocated((prev) => prev.map((x) => x.uid === u.uid ? { ...x, zone: e.target.value } : x)); queueSync('unallocatedTrainees'); }}
                        >
                          <option value="">Select</option>{ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                        </select>
                      </td>
                    )}
                    {[7, 8, 9].map((n) => !hiddenCols.has(n) && <td key={n} />)}
                    {!hiddenCols.has(10) && (
                      <td>
                        <select
                          className={styles.cellInput}
                          disabled={locked.trainerDetails}
                          data-lock-reason="Trainer assignment is locked. Ask the Host to enable Override Trainer Assignment."
                          value={trainerOptions.find((name) => name.toLowerCase() === (u.trainerName ?? '').trim().toLowerCase()) ?? ''}
                          onChange={(e) => { setUnallocated((prev) => prev.map((x) => x.uid === u.uid ? { ...x, trainerName: e.target.value } : x)); queueSync('unallocatedTrainees'); }}
                        >
                          <option value="">— None —</option>
                          {trainerOptions.map((name) => <option key={name.toLowerCase()} value={name}>{name}</option>)}
                        </select>
                      </td>
                    )}
                    {!hiddenCols.has(11) && <td><input className={styles.cellInput} readOnly disabled value={staffDirectory[u.trainerName] ?? ''} /></td>}
                    {[12, 13].map((n) => !hiddenCols.has(n) && <td key={n} />)}
                    {!hiddenCols.has(14) && (
                      <td>
                        <textarea
                          className={styles.cellInput}
                          rows={1}
                          disabled={locked.traineeDetails}
                          value={u.notes}
                          onChange={(e) => { setUnallocated((prev) => prev.map((x) => x.uid === u.uid ? { ...x, notes: e.target.value } : x)); queueSync('unallocatedTrainees'); }}
                        />
                      </td>
                    )}
                    {!hiddenCols.has(15) && <td />}
                    {!hiddenCols.has(16) && (
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className={styles.rowDelBtn}
                          disabled={locked.trainees}
                          onClick={() => {
                            setUnallocated((prev) => prev.filter((x) => x.uid !== u.uid));
                            queueSync('unallocatedTrainees');
                            showToast(`${u.discord || 'Unallocated trainee'} removed.`, 'success');
                          }}
                        >
                          <FontAwesomeIcon icon={ICONS.trash} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.addRowBar}>
            <span style={{ alignSelf: 'center', color: 'rgba(255,255,255,.45)', fontSize: '.72rem' }}>
              {traineeSlotCount}/{MAX_SESSION_TRAINEES} total trainee slots
            </span>
            <button
              className={`${styles.addBtn} ${locked.trainees ? styles.locked : ''}`}
              disabled={traineeSlotCount >= MAX_SESSION_TRAINEES}
              title={traineeSlotCount >= MAX_SESSION_TRAINEES ? SESSION_TRAINEE_LIMIT_MESSAGE : undefined}
              onClick={() => lockedClick(locked.trainees, 'This requires Enable Add/Delete Trainees and a permitted session role.', addUnallocatedTrainee)}
            >
              <FontAwesomeIcon icon={ICONS.plus} /> Add unallocated trainee
            </button>
          </div>
        </section>

        {/* ── Drivers & Staff ── */}
        <div className={styles.twoCol}>
          <section className={styles.panel}>
            <div className={styles.panelTitle}>Drivers</div>
            <div className={styles.tableWrap}>
            <table className={`${styles.driversTable} ${styles.resizableCols}`}>
              <thead><tr><th>Discord<ColResizeHandle /></th><th>Roblox<ColResizeHandle /></th><th>Attendance<ColResizeHandle /></th><th /></tr></thead>
              <tbody>
                {drivers.map((d, i) => (
                  <tr key={i}>
                    <td><input className={styles.cellInput} disabled={locked.driversDisabled} data-lock-reason="Driver input is disabled. Ask the Host to turn off Disable Assistant Input on Drivers." value={d.discord}
                      onChange={(e) => { setDrivers((p) => p.map((x, j) => j === i ? { ...x, discord: e.target.value } : x)); queueSync('drivers'); }} /></td>
                    <td><input className={styles.cellInput} disabled={locked.driversDisabled} data-lock-reason="Driver input is disabled. Ask the Host to turn off Disable Assistant Input on Drivers." value={d.roblox}
                      onChange={(e) => { setDrivers((p) => p.map((x, j) => j === i ? { ...x, roblox: e.target.value } : x)); queueSync('drivers'); }} /></td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" className={styles.chk} disabled={locked.driversDisabled} data-lock-reason="Driver input is disabled. Ask the Host to turn off Disable Assistant Input on Drivers." checked={d.attended}
                        onChange={(e) => {
                          const attended = e.currentTarget.checked;
                          setDrivers((p) => p.map((x, j) => j === i ? { ...x, attended } : x));
                          queueSync('drivers');
                          showToast(`${d.discord || 'Driver'} marked ${attended ? 'present' : 'absent'}.`, attended ? 'success' : 'warning');
                        }} />
                    </td>
                    <td><button className={styles.rowDelBtn} disabled={locked.driversDisabled} onClick={() => { setDrivers((p) => p.filter((_, j) => j !== i)); queueSync('drivers'); showToast(`${d.discord || 'Driver'} removed.`, 'success'); }}><FontAwesomeIcon icon={ICONS.trash} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className={styles.addRowBar}>
              <button className={styles.addBtn} disabled={locked.driversDisabled} onClick={() => { setDrivers((p) => [...p, { discord: '', roblox: '', attended: false }]); queueSync('drivers'); showToast('Driver added.', 'success'); }}>
                <FontAwesomeIcon icon={ICONS.plus} /> Add driver
              </button>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelTitle}>Staff</div>
            <div className={styles.tableWrap}>
            <table className={`${styles.staffTable} ${styles.resizableCols}`}>
              <thead><tr><th>Role in Shift<ColResizeHandle /></th><th>Discord<ColResizeHandle /></th><th>Attendance<ColResizeHandle /></th><th>Notes<ColResizeHandle /></th><th /></tr></thead>
              <tbody>
                {staffShift.map((s, i) => (
                  <tr key={i}>
                    <td>
                      <select className={styles.cellInput} disabled={locked.staffRoles} data-lock-reason="Staff roles are locked. Ask the Host to enable Allow Main AST Override Staff Roles." value={s.role}
                        onChange={(e) => { setStaffShift((p) => p.map((x, j) => j === i ? { ...x, role: e.target.value as StaffShiftRow['role'] } : x)); queueSync('staffShift'); }}>
                        {STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className={styles.cellInput} disabled={Boolean(s.sourceRowId) && !controlAccess.staffRoles && !allowAll} value={s.discord}
                        onChange={(e) => { setStaffShift((p) => p.map((x, j) => j === i ? { ...x, discord: e.target.value } : x)); queueSync('staffShift'); }}>
                        <option value="">— Select —</option>
                        {(s.role === 'Co-Host' ? eligibleStaff['Co-Host'] : s.role === 'Assistant' ? eligibleStaff.Assistant : Object.keys(staffDirectory)).map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" className={styles.chk} checked={s.attended}
                        onChange={(e) => {
                          const attended = e.currentTarget.checked;
                          setStaffShift((p) => p.map((x, j) => j === i ? { ...x, attended } : x));
                          queueSync('staffShift');
                          showToast(`${s.discord || 'Staff member'} marked ${attended ? 'present' : 'absent'}.`, attended ? 'success' : 'warning');
                        }} />
                    </td>
                    <td><input className={styles.cellInput} value={s.notes} onChange={(e) => { setStaffShift((p) => p.map((x, j) => j === i ? { ...x, notes: e.target.value } : x)); queueSync('staffShift'); }} /></td>
                    <td>
                      <button className={styles.rowDelBtn} disabled={locked.staffDelete} onClick={() => { setStaffShift((p) => p.filter((_, j) => j !== i)); queueSync('staffShift'); showToast(`${s.discord || 'Staff member'} removed.`, 'success'); }}>
                        <FontAwesomeIcon icon={ICONS.trash} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className={styles.addRowBar}>
              <button
                className={`${styles.addBtn} ${!canAddStaff || staffShift.length >= 10 ? styles.locked : ''}`}
                aria-disabled={!canAddStaff || staffShift.length >= 10}
                onClick={() => {
                  if (!allowAll && !overrides['staff-addition']) {
                    showToast('Staff addition is disabled by the Host.', 'warning');
                    return;
                  }
                  if (!canAddStaff) {
                    showToast('Only the Host or an Internal Helper can add staff when this control is enabled.', 'warning');
                    return;
                  }
                  if (staffShift.length >= 10) {
                    showToast('The staff panel already has its maximum of 10 members.', 'warning');
                    return;
                  }
                  setStaffShift((p) => [...p, { role: 'Assistant', discord: '', notes: '', attended: false }]);
                  queueSync('staffShift');
                  showToast('Staff member added.', 'success');
                }}
              >
                <FontAwesomeIcon icon={ICONS.plus} /> Add staff member
              </button>
            </div>
          </section>
        </div>

        {/* ── Time tracker and station generator ── */}
        <div className={styles.sideBySidePanels}>
          {canSeeTimeTracker && (
            <section className={styles.panel}>
              <div className={styles.panelTitle}>Time Tracker</div>
              <div className={styles.timeTrackerGrid}>
                {(['briefingStart', 'sgShiftStart', 'screenieTime'] as const).map((key) => (
                  <div key={key} className={styles.timeTrackerRow}>
                    <span className={styles.pipLabel}>
                      {key === 'briefingStart' ? 'Actual Briefing Start' : key === 'sgShiftStart' ? 'Actual SG Shift Start' : 'Actual Screenie Time'}
                    </span>
                    <span className={`${styles.timeTrackerValue} ${timeTracker[key] ? styles.recorded : ''}`}>
                      {timeTracker[key]
                        ? `${formatInstantInSiteTimezone(new Date(timeTracker[key] as number), timezoneMode, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} ${timezoneMode}`
                        : '— not recorded —'}
                    </span>
                    {timeTracker[key] ? (
                      <>
                        <button className={`${styles.miniOverrideBtn} ${styles.recorded}`} disabled title="Time recorded">
                          <FontAwesomeIcon icon={ICONS.check} />
                        </button>
                        <button className={styles.miniOverrideBtn} title="Edit recorded time" onClick={() => editTimeTrackerEntry(key)}>
                          <FontAwesomeIcon icon={ICONS.pen} />
                        </button>
                      </>
                    ) : (
                      <button className={styles.miniOverrideBtn} onClick={() => { setTimeTracker((p) => ({ ...p, [key]: Date.now() })); queueSync('timeTracker'); }}>
                        <FontAwesomeIcon icon={ICONS.play} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className={styles.panel}>
            <div className={styles.panelTitle}><FontAwesomeIcon icon={ICONS.cameraRetro} /> Screenshot Station</div>
            <div className={styles.stationGenRow}>
              <select className={styles.cellInput} value={stationName} onChange={(e) => setStationName(e.target.value)}>
                {STATION_LIST.map((s) => <option key={s.name} value={s.name}>{s.code} — {s.name}</option>)}
              </select>
              <button className={styles.miniOverrideBtn} onClick={() => setStationName(STATION_LIST[Math.floor(Math.random() * STATION_LIST.length)].name)}>
                <FontAwesomeIcon icon={ICONS.shuffle} />
              </button>
              <button className={`${styles.announcementCopyBtn} ${copiedKey === 'station' ? styles.copied : ''}`} onClick={() => {
                const station = STATION_LIST.find((s) => s.name === stationName)!;
                void copyWithFeedback('station', buildStationAnnouncement(station), 'Station announcement');
              }}>
                <FontAwesomeIcon icon={copiedKey === 'station' ? ICONS.check : ICONS.copy} />
              </button>
            </div>
          </section>
        </div>

        {/* ── Wrap-up and Main AST notes ── */}
        {(isHost || canSeeMainAstNotes) && (
          <div className={styles.sideBySidePanels}>
            {isHost && (
              <section className={styles.panel}>
                <div className={styles.panelTitle}>Session Wrap-Up</div>
                <div className={styles.concludePanelBody}>
                  <p className={styles.concludeDesc}>Concluding the session finalizes it — only available while In Progress or Cancelled.</p>
                  <button className={styles.mbtnDanger} disabled={!concludeUnlocked} onClick={concludeSession}>
                    <FontAwesomeIcon icon={ICONS.flagCheckered} /> Conclude Session
                  </button>
                </div>
              </section>
            )}

            {canSeeMainAstNotes && (
              <section className={styles.panel}>
                <div className={styles.panelTitle}>Main AST Notes</div>
                <textarea
                  className={styles.cellInput}
                  rows={6}
                  style={{ width: '100%' }}
                  value={mainAstNotes}
                  onChange={(e) => { setMainAstNotes(e.target.value); queueSync('mainAstNotes'); }}
                />
                {isHost && (
                  <button
                    className={styles.mbtnPrimary}
                    style={{ marginTop: 10 }}
                    onClick={() => {
                const mainAstList = staffShift.filter((s) => s.role === 'Main AST').map((s) => s.discord).filter(Boolean);
                const mainAst = mainAstList[0] || '';
                const assistants = staffShift.filter((s) => s.role === 'Assistant').map((s) => s.discord).filter(Boolean);
                if (mainAst) assistants.unshift(mainAst); // Main AST mentioned again here, same as original
                const cohosts = staffShift.filter((s) => s.role === 'Co-Host').map((s) => s.discord).filter(Boolean);
                const internalHelpers = staffShift.filter((s) => s.role === 'Internal Helper').map((s) => s.discord).filter(Boolean);

                const allocatedNamed = allocatedRows
                  .map((row) => {
                    const slot = parseInt(row, 10) + 1;
                    const details = traineeDetails[row] ?? buildTraineeDetail(session, row);
                    return {
                      row,
                      name: details.roblox.trim() || (session[`trainee_${slot}_name`] as string) || '',
                      trainer: details.trainerName.trim()
                        || (session[`trainee_${slot}_trainer_name`] as string)?.trim()
                        || '—',
                    };
                  })
                  .filter((t) => t.name.trim() !== '');
                const unallocatedNamed = unallocated.filter((u) => u.discord.trim() !== '');

                const cancelledNoShow = [
                  ...allocatedNamed.filter((t) => !attendance[t.row]).map((t) => t.name),
                  ...unallocatedNamed.filter((u) => !attendance[u.uid]).map((u) => u.discord),
                ];

                let n = 1;
                const traineeLines = [
                  ...allocatedNamed.map((t) => `T${n++}: ${t.name} - ${t.trainer}`),
                  ...unallocatedNamed.map((u) => `T${n++}: ${u.discord} - ${u.trainerName}`),
                ];

                const drivers_ = drivers.map((d) => d.discord).filter(Boolean);

                const text = buildReportText({
                  timezoneMode,
                  hostName: session.host,
                  sessionDateIso: session.session_date,
                  sessionTime: session.session_time,
                  timeTracker,
                  mainAst,
                  assistants,
                  cohosts,
                  internalHelpers,
                  totalTrainees: allocatedNamed.length + unallocatedNamed.length,
                  cancelledNoShow,
                  drivers: drivers_,
                  traineeLines,
                  mainAstNotes,
                });

                navigator.clipboard.writeText(text).then(() => showToast('Report copied to clipboard!')).catch(() => showToast('Could not copy — check clipboard permissions.'));
                    }}
                  >
                    <FontAwesomeIcon icon={ICONS.clipboardList} /> Generate Report
                  </button>
                )}
              </section>
            )}
          </div>
        )}
      </main>

      {/* ── Bell widget ── */}
      <div className={styles.bellWidget} ref={bellWidgetRef}>
        <div className={`${styles.bellPanel} ${bellPanelOpen ? styles.open : ''}`}>
          <div className={styles.bellPanelHeader}>
            <span><FontAwesomeIcon icon={ICONS.bell} /> Bell System</span>
            <button type="button" className={styles.bellPanelClose} onClick={() => setBellPanelOpen(false)}>
              <FontAwesomeIcon icon={ICONS.xmark} />
            </button>
          </div>
          <div className={styles.bellPanelBody}>
            {(['host', 'cohost', 'assistant'] as const).map((role) => {
              if (role === 'cohost' && !sessionHasCohost) return null;
              if (role === 'assistant' && !sessionHasAssistant) return null;
              const { disabled, awaitingAck, acked } = getBellButtonState(role);
              const cooldownUntil = bellLocalCooldownUntil[role] ?? 0;
              return (
                <button
                  key={role}
                  type="button"
                  className={`${styles.bellBtn} ${awaitingAck ? styles.awaitingAck : ''} ${acked ? styles.acked : ''}`}
                  disabled={disabled}
                  title={role === 'host' ? 'Ring Host Bell' : role === 'cohost' ? 'Co-host Response' : 'Assistant Response'}
                  onClick={() => handleBellClick(role)}
                >
                  <FontAwesomeIcon icon={role === 'host' ? ICONS.bell : ICONS.reply} />
                  <span>{role === 'host' ? 'Host Bell' : role === 'cohost' ? 'Co-host' : 'Assistant'}</span>
                  {/* keying by the cooldown timestamp forces a remount each click, which
                      restarts the CSS animation the same way the original's reflow hack did */}
                  <div
                    key={cooldownUntil}
                    className={styles.bellCooldownFill}
                    style={cooldownUntil > bellNow ? { animation: 'bellCooldown 5000ms linear forwards' } : undefined}
                  />
                </button>
              );
            })}
          </div>
        </div>
        <button className={styles.bellFab} title="Open Bell System" onMouseDown={dragBellFab}>
          <FontAwesomeIcon icon={ICONS.bell} />
          <span className={`${styles.bellFabDot} ${bell?.active ? styles.show : ''}`} />
        </button>
      </div>

      {/* Bell sound cues — verify these paths match your public/ assets */}
      <audio ref={hostRingSoundRef} src="/assets/sounds/TrainerBuzzer.ogg" preload="auto" />
      <audio ref={cohostAckSoundRef} src="/assets/sounds/CoHostBuzzer.ogg" preload="auto" />
      <audio ref={assistantAckSoundRef} src="/assets/sounds/AssistantBuzzer.ogg" preload="auto" />
      <audio ref={announcementSoundRef} src="/assets/sounds/Announcement.ogg" preload="auto" />
      <audio ref={traineeWarningSoundRef} src="/assets/sounds/TraineeWarning.ogg" preload="auto" />
      <audio ref={traineeOverSoundRef} src="/assets/sounds/TraineeOver.ogg" preload="auto" />

      {/* ── Announce widget (host only) ── */}
      {isHost && (
        <div className={styles.announceWidget} ref={announceWidgetRef}>
          <div className={`${styles.announcePanel} ${announcePanelOpen ? styles.open : ''}`}>
            <div className={styles.announcePanelHeader}>
              <span><FontAwesomeIcon icon={ICONS.bullhorn} /> Announce to everyone</span>
              <button type="button" className={styles.bellPanelClose} onClick={() => setAnnouncePanelOpen(false)}>
                <FontAwesomeIcon icon={ICONS.xmark} />
              </button>
            </div>
            <div className={styles.announcePanelBody}>
              <textarea
                placeholder="Type a message for every connected staff member..."
                maxLength={500}
                value={announceMessage}
                onChange={(e) => setAnnounceMessage(e.target.value)}
              />
              <button type="button" className={styles.mbtnPrimary} onClick={handleSendAnnouncement}>
                <FontAwesomeIcon icon={ICONS.paperPlane} /> Send
              </button>
            </div>
          </div>
          <button className={styles.announceFab} title="Announce to everyone" onMouseDown={dragAnnounceFab}>
            <FontAwesomeIcon icon={ICONS.bullhorn} />
          </button>
        </div>
      )}

      {briefingAvailable && (
        <div className={styles.briefingWidget}>
          <button type="button" className={styles.briefingFab} title="Open host briefing script" aria-label="Open host briefing script" onClick={openBriefingPip}>
            <FontAwesomeIcon icon={ICONS.scroll} />
          </button>
        </div>
      )}

      {/* ── Incoming announcement — banner variant ── */}
      <div className={`${styles.announceBanner} ${announceBanner ? styles.show : ''}`}>
        <span>{announceBanner}</span>
        <button type="button" onClick={() => setAnnounceBanner(null)}>
          <FontAwesomeIcon icon={ICONS.xmark} />
        </button>
      </div>

      {/* ── Incoming announcement — fullscreen variant ── */}
      <div className={`${styles.announceFullscreen} ${announceFullscreen ? styles.show : ''}`}>
        <div className={styles.announceFullscreenBox}>
          <FontAwesomeIcon icon={ICONS.bullhorn} />
          <p>{announceFullscreen}</p>
          <button type="button" className={styles.mbtn} onClick={() => setAnnounceFullscreen(null)}>Dismiss</button>
        </div>
      </div>

      {/* ── Toasts ── */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} timed />

      {/* ── Confirm modal ── */}
      {confirmState && (
        <div className={styles.modalOverlay} style={{ display: 'flex' }}>
          <div className={styles.modal} style={{ maxWidth: 440 }}>
            <div className={styles.modalHead}><h2>{confirmState.title}</h2></div>
            <div className={styles.modalBody}>
              <p className={styles.confirmMessage}>{confirmState.message}</p>
              <div className={styles.modalFooter}>
                <button className={styles.mbtn} onClick={() => { confirmState.resolve(false); setConfirmState(null); }}>Cancel</button>
                <button className={styles.mbtnDanger} onClick={() => { confirmState.resolve(true); setConfirmState(null); }}>Yes, allow it</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Feedback modal ── */}
      {feedbackModalRow !== null && (() => {
        const row = feedbackModalRow;
        const detail = traineeDetails[row] ?? buildTraineeDetail(session, row);
        const t = timers[row];
        const setupDone = t?.setupSeconds != null;
        const totalSeconds = (session.trainee_timer || 12) * 60;
        return (
          <div className={styles.modalOverlay} style={{ display: 'flex' }}>
            <div className={styles.modal}>
              <div className={styles.modalHead}>
                <h2>TRAINER FEEDBACK</h2>
                <button className={styles.modalClose} onClick={() => setFeedbackModalRow(null)}><FontAwesomeIcon icon={ICONS.xmark} /></button>
              </div>
              <div className={styles.modalBody}>
                <div className={styles.mfGrid}>
                  <div className={styles.mfField}>
                    <label>Zone</label>
                    {/* mirror only — edit via Override Trainee Details in the Trainee panel instead */}
                    <select className={styles.lockedField} disabled value={detail.zone || 'Select'}>
                      <option>Select</option>
                      {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                    </select>
                  </div>
                  <div className={styles.mfField}>
                    <label>Date</label>
                    <input type="date" className={styles.lockedField} disabled value={new Date().toISOString().slice(0, 10)} />
                  </div>
                  <div className={styles.mfField}>
                    <label>Name (Trainee)</label>
                    <input type="text" className={styles.lockedField} disabled placeholder="Trainee name" value={detail.discord} />
                  </div>
                  <div className={styles.mfField}>
                    <label>Trains</label>
                    <input
                      type="text"
                      placeholder="Trains"
                      value={getFeedback(row).trains}
                      onChange={(e) => updateFeedback(row, 'trains', e.target.value)}
                    />
                  </div>
                  <div className={styles.mfField}>
                    <label>Setup time</label>
                    <div className={styles.setupTimeWrap}>
                      <input type="text" className={styles.lockedField} disabled placeholder="—" value={t?.setupSeconds != null ? fmt(t.setupSeconds) : ''} />
                      <button
                        type="button"
                        className={styles.miniOverrideBtn}
                        title="Override setup time"
                        onClick={() => {
                          const current = t?.setupSeconds != null ? fmt(t.setupSeconds) : '00:00';
                          const input = window.prompt('Override setup time (MM:SS):', current);
                          if (input === null) return;
                          const parts = input.split(':').map((n) => parseInt(n, 10) || 0);
                          const secs = parts.length === 2 ? parts[0] * 60 + parts[1] : parseInt(input, 10) || 0;
                          setTimers((prev) => ({ ...prev, [row]: { ...prev[row], setupSeconds: secs } }));
                          queueSync('timers');
                        }}
                      >
                        <FontAwesomeIcon icon={ICONS.triangleExclamation} />
                      </button>
                    </div>
                  </div>
                  <div className={`${styles.mfField} ${styles.copyFeedbackField}`}>
                    <button
                      type="button"
                      className={`${styles.copyFeedbackBtn} ${modalCopyFlash ? styles.copied : ''}`}
                      title="Copy feedback message"
                      onClick={() => {
                        navigator.clipboard.writeText(buildFeedbackMessageForRow(row)).then(() => {
                          setModalCopyFlash(true);
                          showToast('Feedback message copied successfully.', 'success');
                          setTimeout(() => setModalCopyFlash(false), 1200);
                        });
                      }}
                    >
                      <FontAwesomeIcon icon={modalCopyFlash ? ICONS.check : ICONS.copy} />
                    </button>
                    <span className={styles.copyFeedbackLabel}>Copy feedback message</span>
                  </div>
                </div>

                {/* mirrors the trainee row's timer — no need to close the modal */}
                <div className={styles.modalTimerBox}>
                  <span className={styles.modalTimerLabel}>Trainee Timer</span>
                  <LiveTimerText
                    timer={t}
                    fallbackSeconds={totalSeconds}
                    warningSeconds={prefTraineeWarning ? prefTraineeWarningTimes : []}
                    onWarning={playTraineeWarning.bind(null, row, t?.syncedAt ?? 0)}
                    onExpired={() => expireTimer(row)}
                  />
                  <button className={`${styles.timerBtn} ${t?.running ? styles.active : ''}`} title="Start/pause" disabled={Boolean(t && !t.running && t.remainingSeconds <= 0)} onClick={() => toggleTimer(row)}>
                    <FontAwesomeIcon icon={t?.running ? ICONS.pause : ICONS.play} />
                  </button>
                  <button className={styles.timerBtn} title="Reset" onClick={() => resetTimer(row, totalSeconds)}>
                    <FontAwesomeIcon icon={ICONS.redo} />
                  </button>
                  <button
                    className={`${styles.timerBtn} ${setupDone ? styles.recorded : ''}`}
                    title={setupDone ? 'Setup time recorded — use the edit button above to change it' : 'Mark setup done'}
                    aria-label={setupDone ? 'Setup time recorded' : 'Mark setup done'}
                    disabled={setupDone}
                    onClick={() => { if (!setupDone) recordSetupDone(row, totalSeconds); }}
                  >
                    <FontAwesomeIcon icon={ICONS.check} />
                  </button>
                  <button
                    className={styles.timerBtn}
                    title="Override timer value"
                    aria-label="Override timer value"
                    onClick={() => {
                      const input = window.prompt('Set timer to MM:SS (e.g. 05:30):', fmt(t ? computeCurrentRemaining(t) : totalSeconds));
                      if (input !== null) setTimerValue(row, input);
                    }}
                  >
                    <FontAwesomeIcon icon={ICONS.triangleExclamation} />
                  </button>
                </div>

                <div className={styles.scriptFeedbackGrid}>
                  <div>
                    <div className={styles.mfSectionLabel}>
                      Script
                      <button
                        type="button"
                        className={`${styles.scriptToggleBtn} ${scriptVisible ? styles.active : ''}`}
                        title={scriptVisible ? 'Hide script' : 'Show script'}
                        onClick={() => setScriptVisible((v) => !v)}
                      >
                        <FontAwesomeIcon icon={scriptVisible ? ICONS.eyeSlash : ICONS.eye} />
                      </button>
                      <span className={styles.scriptHint}>read-only — tap the copy icon on a line</span>
                    </div>
                    {scriptVisible && (
                      <ScriptPreview
                        minutes={session.trainee_timer || 12}
                        win={window}
                        traineeName={detail.discord}
                        location={detail.zone}
                      />
                    )}
                  </div>

                  <div>
                    {(['setup', 'conflict', 'priority', 'rbtiming', 'overall', 'notes'] as const).map((field) => (
                      <div key={field} className={styles.feedbackRow}>
                        <label className={styles.feedbackLabel}>{field}</label>
                        <textarea
                          className={styles.feedbackText}
                          value={getFeedback(row)[field]}
                          onChange={(e) => updateFeedback(row, field, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <FeedbackImages images={feedbackImages[row] ?? []} busy={imageUploading}
                  onAdd={(file) => uploadFeedbackImage(row, file)}
                  onRemove={(id) => removeFeedbackImage(row, id)}
                  onError={(message) => showToast(message, 'warning')} />

                <div className={styles.modalFooter}>
                  <button className={styles.mbtn} onClick={() => setFeedbackModalRow(null)}>Cancel</button>
                  <button className={styles.mbtnPrimary} onClick={async () => {
                    if (imageUploadingRef.current) { showToast('Wait for the image upload to finish.', 'warning'); return; }
                    if (!await pushState()) return;
                    if (dirtyRef.current.liveFields.has('feedbackData') && !await pushState()) return;
                    if (!dirtyRef.current.liveFields.has('feedbackData')) localStorage.removeItem(draftKey);
                    setFeedbackModalRow(null);
                  }}>Save feedback</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Host/co-host briefing pop-out (Document PiP) ── */}
      {pipWindow && pipKind === 'briefing' && briefingAvailable && createPortal(
        <BriefingScriptPip win={pipWindow} onCopyError={() => showToast('Could not copy briefing message. Check clipboard permissions.', 'warning')} />,
        pipWindow.document.body
      )}

      {/* ── Trainee pop-out (Document PiP) ── */}
      {pipWindow && pipKind === 'trainee' && pipRow !== null && createPortal(
        (() => {
          const row = pipRow;
          const win = pipWindow;
          const detail = traineeDetails[row] ?? buildTraineeDetail(session, row);
          const t = timers[row];
          const fb = getFeedback(row);
          const done = completedRows[row];
          return (
            <div style={{ padding: 14 }}>
              <div className={styles.traineePipGrid}>
                <div className={styles.pipInfoRow}><span className={styles.pipInfoLabel}>Name</span><span className={styles.pipInfoValue}>{detail.discord || 'Trainee'}</span></div>
                <div className={styles.pipInfoRow}><span className={styles.pipInfoLabel}>Discord ID</span><span className={styles.pipInfoValue}>{detail.discordId || '—'}</span></div>
                <div className={styles.pipInfoRow}><span className={styles.pipInfoLabel}>Roblox</span><span className={styles.pipInfoValue}>{detail.roblox || '—'}</span></div>
                <div className={styles.pipInfoRow}><span className={styles.pipInfoLabel}>Zone</span><span className={styles.pipInfoValue}>{detail.zone || '—'}</span></div>
                <div className={styles.pipInfoRow}><span className={styles.pipInfoLabel}>Trainer</span><span className={styles.pipInfoValue}>{detail.trainerName || '—'}</span></div>
              </div>

              {t && (
                <div className={styles.timerCellInner} style={{ marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <LiveTimerText
                    timer={t}
                    fallbackSeconds={(session.trainee_timer || 12) * 60}
                    warningSeconds={prefTraineeWarning ? prefTraineeWarningTimes : []}
                    onWarning={playTraineeWarning.bind(null, row, t.syncedAt)}
                    onExpired={() => expireTimer(row)}
                  />
                  <button className={`${styles.timerBtn} ${t.running ? styles.active : ''}`} disabled={!t.running && t.remainingSeconds <= 0} onClick={() => toggleTimer(row)}><FontAwesomeIcon icon={t.running ? ICONS.pause : ICONS.play} /></button>
                  <button className={styles.timerBtn} onClick={() => resetTimer(row, (session.trainee_timer || 12) * 60)}><FontAwesomeIcon icon={ICONS.redo} /></button>
                  <button
                    className={`${styles.timerBtn} ${t.setupSeconds != null ? styles.recorded : ''}`}
                    title={t.setupSeconds != null ? 'Setup time recorded — use the edit button below to change it' : 'Mark setup done'}
                    disabled={t.setupSeconds != null}
                    onClick={() => recordSetupDone(row, (session.trainee_timer || 12) * 60)}
                  >
                    <FontAwesomeIcon icon={ICONS.check} />
                  </button>
                </div>
              )}

              <div className={styles.pipInfoRow} style={{ marginTop: 6, border: 'none' }}>
                <span className={styles.pipInfoLabel}>Setup time</span>
                <span className={styles.pipSetupRow}>
                  <span className={styles.pipSetupBadge}>{t?.setupSeconds != null ? fmt(t.setupSeconds) : '—'}</span>
                  {t?.setupSeconds != null && (
                    <button
                      type="button"
                      className={styles.pipSetupEditBtn}
                      title="Override setup time"
                      onClick={() => {
                        const current = fmt(t.setupSeconds ?? 0);
                        const input = win.prompt('Override setup time (MM:SS):', current);
                        if (input === null) return;
                        const parts = input.split(':').map((n) => parseInt(n, 10) || 0);
                        const secs = parts.length === 2 ? parts[0] * 60 + parts[1] : parseInt(input, 10) || 0;
                        setTimers((prev) => ({ ...prev, [row]: { ...prev[row], setupSeconds: secs } }));
                        queueSync('timers');
                      }}
                    >
                      <FontAwesomeIcon icon={ICONS.pen} />
                    </button>
                  )}
                </span>
              </div>

              <div className={styles.pipInfoRow} style={{ marginTop: 10, border: 'none' }}>
                <span className={styles.pipInfoLabel}>Attendance</span>
                <input
                  type="checkbox"
                  className={styles.chk}
                  checked={attendance[row] ?? false}
                  onChange={(e) => updateTraineeAttendance(row, e.currentTarget.checked)}
                />
              </div>

              <div style={{ marginTop: 10 }}>
                <textarea
                  className={styles.cellInput}
                  rows={2}
                  style={{ width: '100%' }}
                  placeholder="Notes for this trainee..."
                  value={detail.notes}
                  onChange={(e) => updateTraineeDetail(row, { notes: e.target.value })}
                />
              </div>

              <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span className={styles.pipInfoLabel} style={{ fontWeight: 600 }}>Script</span>
                  <button
                    type="button"
                    className={`${styles.scriptToggleBtn} ${pipScriptVisible ? styles.active : ''}`}
                    title={pipScriptVisible ? 'Hide script' : 'Show script'}
                    onClick={() => setPipScriptVisible((v) => !v)}
                  >
                    <FontAwesomeIcon icon={pipScriptVisible ? ICONS.eyeSlash : ICONS.eye} />
                  </button>
                </div>
                {pipScriptVisible && (
                  <ScriptPreview
                    minutes={session.trainee_timer || 12}
                    win={win}
                    traineeName={detail.discord}
                    location={detail.zone}
                  />
                )}
              </div>

              <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span className={styles.pipInfoLabel} style={{ fontWeight: 600 }}>Feedback</span>
                  <button
                    type="button"
                    className={`${styles.copyFeedbackBtn} ${pipCopyFlash ? styles.copied : ''}`}
                    title="Copy full feedback message"
                    onClick={() => {
                       win.navigator.clipboard.writeText(buildFeedbackMessageForRow(row)).then(() => {
                         setPipCopyFlash(true);
                         showToast('Feedback message copied successfully.', 'success');
                         setTimeout(() => setPipCopyFlash(false), 1200);
                      });
                    }}
                  >
                    <FontAwesomeIcon icon={pipCopyFlash ? ICONS.check : ICONS.copy} />
                  </button>
                </div>
                <input
                  className={styles.cellInput}
                  placeholder="Trains signalled"
                  style={{ width: '100%', marginBottom: 8 }}
                  value={fb.trains}
                  onChange={(e) => updateFeedback(row, 'trains', e.target.value)}
                />
                <div className={styles.feedbackPipFields}>
                  {(['setup', 'conflict', 'priority', 'rbtiming', 'overall', 'notes'] as const).map((field) => (
                    <div key={field}>
                      <label>{field}</label>
                      <textarea rows={2} value={fb[field]} onChange={(e) => updateFeedback(row, field, e.target.value)} />
                    </div>
                  ))}
                </div>
                <FeedbackImages images={feedbackImages[row] ?? []} busy={imageUploading}
                  onAdd={(file) => uploadFeedbackImage(row, file)}
                  onRemove={(id) => removeFeedbackImage(row, id)}
                  onError={(message) => showToast(message, 'warning')} />
              </div>


              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className={styles.feedbackBtn} style={{ flex: 1 }} onClick={() => setFeedbackModalRow(row)}>
                  <FontAwesomeIcon icon={ICONS.arrowUpWideShort} /> Full editor
                </button>
                <button className={`${styles.completeBtn} ${done ? styles.done : ''}`} style={{ flex: 1 }} onClick={() => toggleComplete(row)}>
                  {done ? 'Done' : 'Mark done'}
                </button>
              </div>
            </div>
          );
        })(),
        pipWindow.document.body
      )}

      {/* ── Timer pop-out (Document PiP) ── */}
      {pipWindow && pipKind === 'timer' && pipRow !== null && createPortal(
        (() => {
          const row = pipRow;
          const win = pipWindow;
          const t = timers[row];
          const detail = traineeDetails[row] ?? buildTraineeDetail(session, row);
          const canControl = myRole !== 'assistant';
          return (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.32)' }}>{detail.discord || `Trainee ${parseInt(row, 10) + 1}`}</div>
              {t && (
                <LiveTimerText
                  timer={t}
                  fallbackSeconds={(session.trainee_timer || 12) * 60}
                  warningSeconds={prefTraineeWarning ? prefTraineeWarningTimes : []}
                  onWarning={playTraineeWarning.bind(null, row, t?.syncedAt ?? 0)}
                  large
                  onExpired={() => expireTimer(row)}
                />
              )}
              {canControl ? (
                <div className={styles.timerCellInner} style={{ justifyContent: 'center' }}>
                  <button className={`${styles.timerBtn} ${t?.running ? styles.active : ''}`} disabled={Boolean(t && !t.running && t.remainingSeconds <= 0)} onClick={() => toggleTimer(row)}><FontAwesomeIcon icon={t?.running ? ICONS.pause : ICONS.play} /></button>
                  <button className={styles.timerBtn} onClick={() => resetTimer(row, (session.trainee_timer || 12) * 60)}><FontAwesomeIcon icon={ICONS.redo} /></button>
                  <button
                    className={styles.timerBtn}
                    onClick={() => {
                      const input = win.prompt('Set timer to MM:SS:', fmt(t ? computeCurrentRemaining(t) : (session.trainee_timer || 12) * 60));
                      if (input !== null) setTimerValue(row, input);
                    }}
                  >
                    <FontAwesomeIcon icon={ICONS.triangleExclamation} />
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.32)', textAlign: 'center' }}>View only — Assistants can&apos;t control the timer.</div>
              )}
            </div>
          );
        })(),
        pipWindow.document.body
      )}
    </div>
  );
}
