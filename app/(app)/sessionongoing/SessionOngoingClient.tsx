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
import { useLiveSession } from '../LiveSessionContext';
import { ZONE_DATA, ZONES, ANNOUNCEMENT_TEMPLATE, SCRIPT_LINES, STATION_LIST, buildStationAnnouncement, STAFF_ROLES, buildReportText } from '@/lib/session/constants';
import type {
  SessionOngoingRow, LiveState, TimerState, DriverRow, StaffShiftRow, FeedbackDataMap,
  UnallocatedTrainee, TimeTracker, OverridesState, AnnouncementPayload, BellStateRow,
  ViewerRole, MyRole,
} from '@/types/session';
import styles from './sessionongoing.module.css';

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
function ScriptPreview({ minutes, win }: { minutes: number; win: Window }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  return (
    <div className={styles.scriptPreview}>
      {SCRIPT_LINES.map((lineText, i) => {
        const resolvedText = lineText.replace(/XX/g, String(minutes));
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

const DEFAULT_OVERRIDES: OverridesState = {
  'session-details': false, trainees: false, 'staff-roles': false, 'drivers-disable': false,
  'slot-order': false, 'staff-delete': false, 'trainee-details': false, 'trainer-details': false, 'allow-all': false,
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
  viewerRole: ViewerRole;
  myDisplayName: string;
  username: string;
  roleDisplay: string;
  avatarUrl: string | null;
  staffId: string;
  prefTraineeWarning: boolean;
  prefAnnouncementDisplay: 'toast' | 'banner' | 'fullscreen';
  prefAnnouncementEnabled: boolean;
}

export default function SessionOngoingClient(props: Props) {
  const {
    initialSession, staffDirectory, eligibleStaff, eligibleHosts, scheduledStartIso, viewerRole, myDisplayName,
    prefTraineeWarning, prefAnnouncementDisplay, prefAnnouncementEnabled,
  } = props;
  const hostOptions = eligibleHosts ?? Object.keys(staffDirectory);

  const myRole: MyRole = viewerRole === 'Host' ? 'host' : viewerRole === 'Co-Host' ? 'cohost' : 'assistant';
  const isHost = myRole === 'host';
  const isAssistant = myRole === 'assistant';
  const sessionId = initialSession.session_id;

  const myClientId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    let id = localStorage.getItem('yss_client_id');
    if (!id) { id = 'c_' + Math.random().toString(36).slice(2) + Date.now(); localStorage.setItem('yss_client_id', id); }
    return id;
  }, []);

  // ── core state (mirrors the module-level `let`s in sessionongoing.js) ──
  const [session, setSession] = useState<SessionOngoingRow>(initialSession);
  const [liveState, setLiveState] = useState<LiveState>(initialSession.live_state ?? {});
  const [overrides, setOverrides] = useState<OverridesState>(liveState.overrides ?? DEFAULT_OVERRIDES);
  const [timers, setTimers] = useState<Record<string, TimerState>>({});
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [staffShift, setStaffShift] = useState<StaffShiftRow[]>([]);
  const [feedbackData, setFeedbackData] = useState<FeedbackDataMap>(liveState.feedbackData ?? {});
  const [completedRows, setCompletedRows] = useState<Record<string, boolean>>(liveState.completedRows ?? {});
  const [unallocated, setUnallocated] = useState<UnallocatedTrainee[]>(liveState.unallocatedTrainees ?? []);
  const [timeTracker, setTimeTracker] = useState<TimeTracker>(liveState.timeTracker ?? {});
  const [mainAstNotes, setMainAstNotes] = useState(liveState.mainAstNotes ?? '');
  const [statusValue, setStatusValue] = useState((session.session_status || 'inprogress').toLowerCase().replace(/\s+/g, ''));
  // Attendance wasn't wired to state in the initial port — bare checkbox, visual only.
  // Needed for real for the report's "Cancelled/No-show" list, so wiring it up now.
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
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
    const id = setInterval(() => setBellNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const [elapsed, setElapsed] = useState(0);
  const { reportActive, reportInactive } = useLiveSession();
  useEffect(() => {
    reportActive(true);
    return () => reportInactive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirtyRef = useRef({ live: false, staffCore: false, overrides: false, status: false, details: false, attendance: false, traineeRows: new Set<string>() });
  const traineeCountRef = useRef(initialSession.num_slots || 10);

  // ── trainee rows: allocated (1..num_slots) + unallocated, mirrors renumberSlots/addTraineeRow ──
  // (Declared up here, ahead of pushState below, since pushState's dependency
  // array reads rowOrder — declaring it later would be a temporal-dead-zone
  // ReferenceError.)
  const allocatedRows = useMemo(
    () => Array.from({ length: session.num_slots || 10 }, (_, i) => String(i)),
    [session.num_slots]
  );
  const [rowOrder, setRowOrder] = useState<string[]>(() => initialSession.live_state?.slotOrder ?? allocatedRows);
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
      for (const row of allocatedRows) {
        if (!next[row]) {
          next[row] = { remainingSeconds: (session.trainee_timer || 12) * 60, running: false, syncedAt: Date.now() };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocatedRows]);

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
    for (const row of allocatedRows) map[row] = buildTraineeDetail(initialSession, row);
    return map;
  });
  const updateTraineeDetail = useCallback((row: string, patch: Partial<TraineeDetail>) => {
    setTraineeDetails((prev) => ({ ...prev, [row]: { ...(prev[row] ?? buildTraineeDetail(session, row)), ...patch } }));
    dirtyRef.current.traineeRows.add(row);
    queueSync();
  }, [buildTraineeDetail, session]);


  const showToast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);
  // Native `disabled` blocks the click event entirely, so a toast could never
  // fire from it — this is the alternative for controls where we want an
  // explicit "here's why" message instead of just a greyed-out look.
  const lockedClick = useCallback((isLocked: boolean, message: string, action: () => void) => {
    if (isLocked) { showToast(message); return; }
    action();
  }, [showToast]);
  const showConfirm = useCallback((message: string, title = 'Are you sure?') => {
    return new Promise<boolean>((resolve) => setConfirmState({ title, message, resolve }));
  }, []);

  // ── realtime wiring — replaces setInterval(pushState/pullState, 5000) ──
  useSessionRealtime(sessionId, (row) => {
    setSession(row);
    if (!dirtyRef.current.status) {
      setStatusValue((row.session_status || 'inprogress').toLowerCase().replace(/\s+/g, ''));
    }
    setTraineeDetails((prev) => {
      const next = { ...prev };
      for (const r of allocatedRows) {
        if (dirtyRef.current.traineeRows.has(r)) continue; // don't clobber an unsent local edit
        next[r] = buildTraineeDetail(row, r);
      }
      return next;
    });
    const remote = row.live_state ?? {};
    setLiveState(remote);
    if (remote.feedbackData) setFeedbackData((f) => ({ ...f, ...remote.feedbackData }));
    if (remote.completedRows) setCompletedRows(remote.completedRows);
    if (remote.timeTracker) setTimeTracker((t) => ({ ...t, ...remote.timeTracker }));
    if (remote.mainAstNotes !== undefined) setMainAstNotes(remote.mainAstNotes);
    if (remote.drivers) setDrivers(remote.drivers);
    if (remote.staffShift) setStaffShift(remote.staffShift);
    if (remote.unallocatedTrainees) setUnallocated(remote.unallocatedTrainees);
    if (remote.slotOrder) setRowOrder(remote.slotOrder);
    if (row.trainee_attendance && !dirtyRef.current.attendance) {
      const parts = row.trainee_attendance.split(',');
      const order = remote.slotOrder ?? rowOrder;
      setAttendance((prev) => {
        const next = { ...prev };
        order.forEach((r, i) => { next[r] = parts[i] === '1'; });
        return next;
      });
    }
    if (remote.overrides) setOverrides(remote.overrides);
    if (remote.timers) {
      setTimers((prev) => {
        const next = { ...prev };
        for (const [row2, t] of Object.entries(remote.timers!)) next[row2] = t;
        return next;
      });
    }
    reportActive(true);
  });

  useBellRealtime(sessionId, setBell);

  const announcementSoundRef = useRef<HTMLAudioElement>(null);
  const { send: sendAnnouncementRaw } = useAnnouncementBroadcast(sessionId, (a: AnnouncementPayload) => {
    if (!prefAnnouncementEnabled) return;
    const text = `${a.senderName}: ${a.message}`;
    if (announcementSoundRef.current) { announcementSoundRef.current.currentTime = 0; announcementSoundRef.current.play().catch(() => {}); }
    if (prefAnnouncementDisplay === 'fullscreen') {
      setAnnounceFullscreen(text);
    } else if (prefAnnouncementDisplay === 'banner') {
      setAnnounceBanner(text);
      setTimeout(() => setAnnounceBanner((cur) => (cur === text ? null : cur)), 12000);
    } else {
      showToast(text);
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
    showToast('Announcement sent to everyone.');
  }, [announceMessage, sendAnnouncementRaw, session.host, myClientId, showToast]);

  // ── debounced push (replaces pushState / queueLiveStateSync) ──
  const pushState = useCallback(async () => {
    const d = dirtyRef.current;
    if (!d.live && !d.staffCore && !d.overrides && !d.status && !d.details && !d.attendance && d.traineeRows.size === 0) return;

    const updates: Record<string, unknown> = {};
    if (d.status) updates.session_status = statusValue;
    if (d.details) {
      updates.host = session.host;
      updates.session_date = session.session_date;
      updates.session_time = session.session_time;
      updates.trainee_timer = session.trainee_timer;
    }
    if (d.attendance) {
      // one '1'/'0' char per allocated row, in display order — matches the
      // original's scanTraineeRows() attendanceParts / trainee_attendance column
      updates.trainee_attendance = rowOrder.map((r) => (attendance[r] ? '1' : '0')).join(',');
    }
    if (d.traineeRows.size > 0) {
      for (const row of d.traineeRows) {
        const idx = parseInt(row, 10) + 1;
        const detail = traineeDetails[row];
        if (!detail) continue;
        updates[`trainee_${idx}_discord`] = detail.discord;
        updates[`trainee_${idx}_discord_id`] = detail.discordId;
        updates[`trainee_${idx}_name`] = detail.roblox; // yes — roblox lives under the "_name" column, see TraineeDetail comment above
        updates[`trainee_${idx}_zone`] = detail.zone ? parseInt(detail.zone.replace('Zone ', ''), 10) : null;
        updates[`trainee_${idx}_trainer_name`] = detail.trainerName;
        updates[`trainee_${idx}_note`] = detail.notes;
      }
    }

    const live_state: Partial<LiveState> = {
      timers, drivers, staffShift, feedbackData, completedRows,
      unallocatedTrainees: unallocated, timeTracker, mainAstNotes, slotOrder: rowOrder,
    };
    if (d.overrides) live_state.overrides = overrides;

    dirtyRef.current = { live: false, staffCore: false, overrides: false, status: false, details: false, attendance: false, traineeRows: new Set() };

    await fetch(`/api/session/${sessionId}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, updates, live_state }),
    });
  }, [sessionId, statusValue, session.host, session.session_date, session.session_time, session.trainee_timer, timers, drivers, staffShift, feedbackData, completedRows, unallocated, timeTracker, mainAstNotes, overrides, rowOrder, attendance, traineeDetails]);

  const queueSync = useCallback(() => { dirtyRef.current.live = true; }, []);
  // Marks one of the 4 Session Details fields dirty + queues a push, same
  // gating as the original's `.details-field` class (only sent when the
  // Override Session Details toggle unlocked them for editing).
  const queueDetailsSync = useCallback(() => { dirtyRef.current.details = true; }, []);

  useEffect(() => {
    const id = setInterval(pushState, 3000); // debounce window; realtime handles the pull side now
    return () => clearInterval(id);
  }, [pushState]);

  // ── global elapsed-time clock (replaces the setInterval on #global-timer-display) ──
  useEffect(() => {
    const startMs = session.started_at ? new Date(session.started_at).getTime() : Date.now();
    const id = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000))), 1000);
    return () => clearInterval(id);
  }, [session.started_at]);

  // ── overtime flag — measured from the SCHEDULED start (scheduledStartIso),
  // not from whenever the host actually clicked "Start Session Setup", so
  // starting early doesn't shift the overtime window. Separate clock from
  // the elapsed-time display above, same split as the original PHP file. ──
  const [overtime, setOvertime] = useState(false);
  useEffect(() => {
    const scheduledMs = scheduledStartIso
      ? new Date(scheduledStartIso).getTime()
      : session.started_at ? new Date(session.started_at).getTime() : Date.now();
    const durationSeconds = (parseInt(session.session_duration as unknown as string, 10) || 0) * 60;
    const id = setInterval(() => {
      if (durationSeconds <= 0) { setOvertime(false); return; }
      const elapsedSinceScheduled = Math.max(0, Math.floor((Date.now() - scheduledMs) / 1000));
      setOvertime(elapsedSinceScheduled > durationSeconds);
    }, 1000);
    return () => clearInterval(id);
  }, [scheduledStartIso, session.started_at, session.session_duration]);

  // ── signal time apply — replaces applySignalMinutes(): pushes the new
  // per-trainee countdown length and resets every non-running row to it ──
  const applySignalTime = useCallback(() => {
    const unlocked = overrides['allow-all'] || overrides['session-details'];
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
    queueSync();
    showToast(`Signal time set to ${minutes} minutes for all trainees.`);
  }, [overrides, session.trainee_timer, queueSync, showToast]);

  // ── 1s ticker for running timers ──
  useEffect(() => {
    const id = setInterval(() => {
      setTimers((prev) => {
        let changed = false;
        for (const t of Object.values(prev)) if (t.running) changed = true;
        return changed ? { ...prev } : prev; // force a re-render; computeCurrentRemaining derives the live value
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── overrides ──
  const toggleOverride = useCallback(async (key: keyof OverridesState) => {
    if (!isHost) { showToast('Only the Host can toggle overrides.'); return; }
    if (key === 'allow-all' && !overrides[key]) {
      const ok = await showConfirm(
        "This unlocks every field for every user and bypasses all individual overrides, including host-only ones. This can't be undone quietly — everyone will be able to edit everything.",
        'Allow Override for Everyone?'
      );
      if (!ok) return;
    }
    setOverrides((prev) => ({ ...prev, [key]: !prev[key] }));
    dirtyRef.current.overrides = true;
    queueSync();
  }, [isHost, overrides, showConfirm, showToast, queueSync]);

  const allowAll = overrides['allow-all'];
  const locked = {
    sessionDetails: !(allowAll || overrides['session-details']),
    trainees: !(allowAll || overrides.trainees),
    traineeDetails: !(allowAll || overrides['trainee-details']),
    trainerDetails: !(allowAll || overrides['trainer-details']),
    staffRoles: !(allowAll || overrides['staff-roles']),
    driversDisabled: !allowAll && overrides['drivers-disable'],
    slotOrder: !(allowAll || overrides['slot-order']),
    staffDelete: !(allowAll || (isHost && overrides['staff-delete'])),
  };

  const allDone = useMemo(() => {
    const rows = Object.keys(completedRows);
    return rows.length > 0 && rows.every((r) => completedRows[r]);
  }, [completedRows]);
  const statusUnlocked = allowAll || overrides['session-details'] || allDone || isHost;

  // ── trainee timer controls (replace toggleTimer/resetTimer/setTimerValue/recordSetupDone) ──
  const toggleTimer = useCallback((row: string) => {
    setTimers((prev) => {
      const t = prev[row] ?? { remainingSeconds: (session.trainee_timer || 12) * 60, running: false, syncedAt: Date.now() };
      if (!t.running) return { ...prev, [row]: { ...t, running: true, syncedAt: Date.now() } };
      return { ...prev, [row]: { ...t, running: false, remainingSeconds: computeCurrentRemaining(t) } };
    });
    queueSync();
  }, [queueSync, session.trainee_timer]);

  const resetTimer = useCallback((row: string, totalSeconds: number) => {
    setTimers((prev) => ({ ...prev, [row]: { remainingSeconds: totalSeconds, running: false, syncedAt: Date.now(), setupSeconds: prev[row]?.setupSeconds } }));
    queueSync();
  }, [queueSync]);

  const setTimerValue = useCallback((row: string, mmss: string) => {
    const parts = mmss.split(':').map((n) => parseInt(n, 10) || 0);
    const remainingSeconds = parts.length === 2 ? parts[0] * 60 + parts[1] : parseInt(mmss, 10) || 0;
    setTimers((prev) => ({ ...prev, [row]: { ...prev[row], remainingSeconds, syncedAt: Date.now() } }));
    queueSync();
  }, [queueSync]);

  const recordSetupDone = useCallback((row: string, totalSeconds: number) => {
    setTimers((prev) => {
      const t = prev[row] ?? { remainingSeconds: totalSeconds, running: false, syncedAt: Date.now() };
      const setupSeconds = Math.max(0, totalSeconds - computeCurrentRemaining(t));
      return { ...prev, [row]: { ...t, setupSeconds } };
    });
    queueSync();
  }, [queueSync]);

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
    queueSync();
  }, [locked.slotOrder, queueSync]);

  // ── column show/hide — mirrors TRAINEE_COLUMNS / EXTRA_COLUMNS / hide-extras-btn ──
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
  const [pipKind, setPipKind] = useState<'trainee' | 'timer' | null>(null);
  const [pipRow, setPipRow] = useState<string | null>(null);
  const [pipCopyFlash, setPipCopyFlash] = useState(false);
  const [pipScriptVisible, setPipScriptVisible] = useState(false);
  useEffect(() => { setPipScriptVisible(false); }, [pipRow, pipKind]);

  const pipSupported = useCallback(() => typeof window !== 'undefined' && 'documentPictureInPicture' in window, []);

  const openPip = useCallback(async (kind: 'trainee' | 'timer', row: string, opts: { width: number; height: number; title: string }) => {
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

  const addUnallocatedTrainee = useCallback(() => {
    if (locked.trainees) return;
    setUnallocated((prev) => [...prev, { uid: newUid(), discord: '', discordId: '', roblox: '', zone: '', notes: '', trainerName: '' }]);
    queueSync();
  }, [locked.trainees, queueSync]);

  const toggleComplete = useCallback((row: string) => {
    if (isAssistant) return;
    setCompletedRows((prev) => ({ ...prev, [row]: !prev[row] }));
    queueSync();
  }, [isAssistant, queueSync]);

  // ── feedback modal (replaces openFeedbackModal / fb-save et al.) ──
  const getFeedback = useCallback((row: string) => feedbackData[row] ?? { trains: '', setup: '', conflict: '', priority: '', rbtiming: '', overall: '', notes: '' }, [feedbackData]);
  const updateFeedback = useCallback((row: string, field: string, value: string) => {
    setFeedbackData((prev) => ({ ...prev, [row]: { ...getFeedback(row), [field]: value } }));
    queueSync();
  }, [getFeedback, queueSync]);

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
**Date of session**: ${datePart} | ${timePart} BST
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

If you believe you were unfairly assessed or have any additional questions, feel free to ask!
Thank you for attending.`;
  }, [traineeDetails, buildTraineeDetail, session, getFeedback, timers]);

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

  const sessionHasCohost = Boolean(session.co_host1 || session.co_host2 || session.co_host3 || session['co_host4/supervisor']);
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
    setBellLocalCooldownUntil((prev) => ({ ...prev, [role]: Date.now() + 5000 }));
  }, [myRole, bell, ringBell, ackBell, getBellButtonState, showToast]);

  // ── conclude session (replaces #conclude-session-btn handler) ──
  const [concludeOpen, setConcludeOpen] = useState(false);
  const concludeSession = useCallback(async () => {
    const incomplete = allocatedRows.filter((r) => !completedRows[r]);
    let html = `You're about to conclude this session. This finalizes the session record — the status will be set to Concluded and it can no longer be edited as an active session.`;
    if (statusValue === 'cancelled') html += `\n\nIf the session status is currently Cancelled, concluding it will record the session as cancelled-and-concluded — make sure that's intended.`;
    if (incomplete.length) html += `\n\n${incomplete.length} trainee(s) have not been marked done yet.`;
    const ok = await showConfirm(html, 'Conclude this session?');
    if (!ok) return;

    dirtyRef.current.live = true;
    await pushState();
    const result = await fetch(`/api/session/${sessionId}/conclude`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    }).then((r) => r.json());

    if (!result.success) { showToast('Failed to conclude: ' + (result.message || 'Unknown error')); return; }
    showToast('Session concluded and archived. Redirecting...');
    setTimeout(() => { window.location.href = '/dashboard'; }, 2000);
  }, [allocatedRows, completedRows, statusValue, showConfirm, pushState, sessionId, showToast]);

  const concludeUnlocked = isHost && (statusValue === 'cancelled' || statusValue === 'concluded');

  // ── announcement resolve (per-trainee zone template, replaces resolveAnnouncement) ──
  const resolveAnnouncement = useCallback((row: string, traineeName: string, trainerName: string, zone: string) => {
    const info = zone ? ZONE_DATA[zone] : null;
    return ANNOUNCEMENT_TEMPLATE
      .replaceAll('[ZONE COVERAGE]', info?.coverage ?? '[ZONE COVERAGE]')
      .replaceAll('[DEPOT & SIDING (WITHIN ZONE)]', info?.depot ?? '[DEPOT & SIDING (WITHIN ZONE)]')
      .replaceAll('[DEPOT & SIDING NEARBY ZONE]', info?.depotNearby ?? '[DEPOT & SIDING NEARBY ZONE]')
      .replaceAll('[NOTES]', info?.notes ?? '[NOTES]')
      .replaceAll('[TRAINEE]', traineeName || '[TRAINEE]')
      .replaceAll('[TRAINER]', trainerName || '[TRAINER]')
      .replaceAll('[ZONE]', zone || '[ZONE]');
  }, []);

  // ── station generator ──
  const [stationCode, setStationCode] = useState(STATION_LIST[0].code);

  return (
    <div className={styles.wrap}>
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
                <button className={`${styles.ovrBtn} ${overrides['session-details'] ? styles.on : ''}`} onClick={() => toggleOverride('session-details')}>
                  <FontAwesomeIcon icon={ICONS.lock} /> Override Session Details
                </button>
                <button className={`${styles.ovrBtn} ${overrides.trainees ? styles.on : ''}`} onClick={() => toggleOverride('trainees')}>
                  <FontAwesomeIcon icon={ICONS.userPlus} /> Override Trainees
                </button>
                <button className={`${styles.ovrBtn} ${overrides['trainee-details'] ? styles.on : ''}`} onClick={() => toggleOverride('trainee-details')}>
                  <FontAwesomeIcon icon={ICONS.idCard} /> Override Trainee Details
                </button>
                <button className={`${styles.ovrBtn} ${overrides['slot-order'] ? styles.on : ''}`} onClick={() => toggleOverride('slot-order')}>
                  <FontAwesomeIcon icon={ICONS.arrowUpWideShort} /> Override Slot Ordering
                </button>
              </div>
              <div className={styles.overrideCol}>
                <button className={`${styles.ovrBtn} ${overrides['staff-roles'] ? styles.on : ''}`} onClick={() => toggleOverride('staff-roles')}>
                  <FontAwesomeIcon icon={ICONS.userShield} /> Allow Assistant Override Staff Roles
                </button>
                <button className={`${styles.ovrBtn} ${overrides['drivers-disable'] ? styles.on : ''}`} onClick={() => toggleOverride('drivers-disable')}>
                  <FontAwesomeIcon icon={ICONS.ban} /> Disable Assistant Input on Drivers
                </button>
              </div>
              <div className={styles.overrideCol}>
                <button className={`${styles.ovrBtn} ${overrides['trainer-details'] ? styles.on : ''}`} onClick={() => toggleOverride('trainer-details')}>
                  <FontAwesomeIcon icon={ICONS.chalkboardUser} /> Override Trainer Assignment
                </button>
                <button className={`${styles.ovrBtn} ${styles.hostOnly} ${overrides['staff-delete'] ? styles.on : ''}`} onClick={() => toggleOverride('staff-delete')}>
                  <FontAwesomeIcon icon={ICONS.userSlash} /> Override Staff Deletion (Host only)
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
              <input className={styles.cellInput} readOnly disabled value={staffDirectory[session.host ?? ''] ?? ''} />
            </div>
            <div className={styles.infoCell}>
              <div className={styles.infoLabel}>Session Date</div>
              <input
                type="date"
                className={styles.cellInput}
                disabled={locked.sessionDetails}
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
                    onChange={(e) => { setStatusValue(e.target.value); dirtyRef.current.status = true; queueSync(); }}
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
                  value={session.trainee_timer ?? 12}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setSession((s) => ({ ...s, trainee_timer: Number.isNaN(val) ? s.trainee_timer : val }));
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
              <div className={styles.globalTimerValue}>{fmtHMS(elapsed)}</div>
              {overtime && (
                <span className={styles.overtimePill}>
                  <FontAwesomeIcon icon={ICONS.triangleExclamation} /> Overtime — please pick up the pace and conclude the session now.
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ── Time Tracker (host only) ── */}
        {isHost && (
          <section className={styles.panel}>
            <div className={styles.panelTitle}>Time Tracker</div>
            <div className={styles.timeTrackerGrid}>
              {(['briefingStart', 'sgShiftStart', 'screenieTime'] as const).map((key) => (
                <div key={key} className={styles.timeTrackerRow}>
                  <span className={styles.pipLabel}>
                    {key === 'briefingStart' ? 'Actual Briefing Start' : key === 'sgShiftStart' ? 'Actual SG Shift Start' : 'Actual Screenie Time'}
                  </span>
                  <span className={styles.timeTrackerValue}>
                    {timeTracker[key] ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(timeTracker[key]) + ' BST/GMT' : '— not recorded —'}
                  </span>
                  {!timeTracker[key] && (
                    <button className={styles.miniOverrideBtn} onClick={() => { setTimeTracker((p) => ({ ...p, [key]: Date.now() })); queueSync(); }}>
                      <FontAwesomeIcon icon={ICONS.play} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Trainees table ── */}
        <section className={styles.panel}>
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
                {rowOrder.map((row, orderIndex) => {
                  const idx = parseInt(row, 10) + 1;
                  const t = timers[row] ?? { remainingSeconds: (session.trainee_timer || 12) * 60, running: false, syncedAt: Date.now() };
                  const detail = traineeDetails[row] ?? buildTraineeDetail(session, row);
                  const live = computeCurrentRemaining(t);
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
                          <div className={styles.slotCell}>
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
                          </div>
                        </td>
                      )}
                      {!hiddenCols.has(3) && (
                        <td>
                          <input
                            className={styles.cellInput}
                            disabled={locked.traineeDetails}
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
                          <span className={`${styles.timerDisplay} ${t.running && live > 60 ? styles.running : live <= 0 ? styles.expired : live <= 60 ? styles.low : ''}`}>{fmt(live)}</span>
                          {!isAssistant && (
                            <>
                              <button className={`${styles.timerBtn} ${t.running ? styles.active : ''}`} onClick={() => toggleTimer(row)}><FontAwesomeIcon icon={t.running ? ICONS.pause : ICONS.play} /></button>
                              <button className={styles.timerBtn} onClick={() => resetTimer(row, (session.trainee_timer || 12) * 60)}><FontAwesomeIcon icon={ICONS.redo} /></button>
                              <button className={styles.timerBtn} onClick={() => recordSetupDone(row, (session.trainee_timer || 12) * 60)}><FontAwesomeIcon icon={ICONS.check} /></button>
                              <button
                                className={styles.timerBtn}
                                title="Override timer value"
                                onClick={() => {
                                  const input = window.prompt('Set timer to MM:SS (e.g. 05:30):', fmt(live));
                                  if (input !== null) setTimerValue(row, input);
                                }}
                              >
                                <FontAwesomeIcon icon={ICONS.triangleExclamation} />
                              </button>
                            </>
                          )}
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
                            onChange={(e) => { setAttendance((prev) => ({ ...prev, [row]: e.target.checked })); dirtyRef.current.attendance = true; queueSync(); }}
                          />
                        </td>
                      )}
                      {!hiddenCols.has(10) && (
                        <td>
                          <select
                            className={styles.cellInput}
                            disabled={locked.trainerDetails}
                            value={detail.trainerName}
                            onChange={(e) => updateTraineeDetail(row, { trainerName: e.target.value })}
                          >
                            <option value="">— None —</option>
                            <option value={session.host}>{session.host}</option>
                            {eligibleStaff['Co-Host'].map((n) => <option key={n} value={n}>{n}</option>)}
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
                        <td>
                          <div className={styles.announcementCell}>
                            <button className={styles.announcementCopyBtn} onClick={() => navigator.clipboard.writeText(resolveAnnouncement(row, detail.discord, detail.trainerName, detail.zone))}>
                              <FontAwesomeIcon icon={ICONS.copy} />
                            </button>
                          </div>
                        </td>
                      )}
                      {!hiddenCols.has(14) && (
                        <td>
                          <textarea
                            className={styles.cellInput}
                            rows={1}
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
                          <button className={styles.rowDelBtn} disabled={locked.trainees}><FontAwesomeIcon icon={ICONS.trash} /></button>
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
                          value={u.discord}
                          onChange={(e) => { setUnallocated((prev) => prev.map((x) => x.uid === u.uid ? { ...x, discord: e.target.value } : x)); queueSync(); }}
                        />
                      </td>
                    )}
                    {!hiddenCols.has(4) && (
                      <td>
                        <input
                          className={styles.cellInput}
                          disabled={locked.traineeDetails}
                          value={u.discordId}
                          onChange={(e) => { setUnallocated((prev) => prev.map((x) => x.uid === u.uid ? { ...x, discordId: e.target.value } : x)); queueSync(); }}
                        />
                      </td>
                    )}
                    {!hiddenCols.has(5) && (
                      <td>
                        <input
                          className={styles.cellInput}
                          disabled={locked.traineeDetails}
                          value={u.roblox}
                          onChange={(e) => { setUnallocated((prev) => prev.map((x) => x.uid === u.uid ? { ...x, roblox: e.target.value } : x)); queueSync(); }}
                        />
                      </td>
                    )}
                    {!hiddenCols.has(6) && (
                      <td>
                        <select
                          className={styles.cellInput}
                          disabled={locked.traineeDetails}
                          value={u.zone}
                          onChange={(e) => { setUnallocated((prev) => prev.map((x) => x.uid === u.uid ? { ...x, zone: e.target.value } : x)); queueSync(); }}
                        >
                          <option value="">Select</option>{ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                        </select>
                      </td>
                    )}
                    {[7, 8, 9, 10, 11, 12, 13].map((n) => !hiddenCols.has(n) && <td key={n} />)}
                    {!hiddenCols.has(14) && (
                      <td>
                        <textarea
                          className={styles.cellInput}
                          rows={1}
                          value={u.notes}
                          onChange={(e) => { setUnallocated((prev) => prev.map((x) => x.uid === u.uid ? { ...x, notes: e.target.value } : x)); queueSync(); }}
                        />
                      </td>
                    )}
                    {!hiddenCols.has(15) && <td />}
                    {!hiddenCols.has(16) && (
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className={styles.rowDelBtn}
                          disabled={locked.trainees}
                          onClick={() => { setUnallocated((prev) => prev.filter((x) => x.uid !== u.uid)); queueSync(); }}
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
            <button
              className={`${styles.addBtn} ${locked.trainees ? styles.locked : ''}`}
              onClick={() => lockedClick(locked.trainees, 'This requires the Override Trainees toggle. Ask the host to enable it.', addUnallocatedTrainee)}
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
                    <td><input className={styles.cellInput} disabled={locked.driversDisabled} defaultValue={d.discord}
                      onBlur={(e) => { setDrivers((p) => p.map((x, j) => j === i ? { ...x, discord: e.target.value } : x)); queueSync(); }} /></td>
                    <td><input className={styles.cellInput} disabled={locked.driversDisabled} defaultValue={d.roblox}
                      onBlur={(e) => { setDrivers((p) => p.map((x, j) => j === i ? { ...x, roblox: e.target.value } : x)); queueSync(); }} /></td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" className={styles.chk} disabled={locked.driversDisabled} checked={d.attended}
                        onChange={(e) => { setDrivers((p) => p.map((x, j) => j === i ? { ...x, attended: e.target.checked } : x)); queueSync(); }} />
                    </td>
                    <td><button className={styles.rowDelBtn} onClick={() => { setDrivers((p) => p.filter((_, j) => j !== i)); queueSync(); }}><FontAwesomeIcon icon={ICONS.trash} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className={styles.addRowBar}>
              <button className={styles.addBtn} onClick={() => { setDrivers((p) => [...p, { discord: '', roblox: '', attended: false }]); queueSync(); }}>
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
                      <select className={styles.cellInput} disabled={locked.staffRoles} value={s.role}
                        onChange={(e) => { setStaffShift((p) => p.map((x, j) => j === i ? { ...x, role: e.target.value as StaffShiftRow['role'] } : x)); dirtyRef.current.staffCore = true; queueSync(); }}>
                        {STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className={styles.cellInput} value={s.discord}
                        onChange={(e) => { setStaffShift((p) => p.map((x, j) => j === i ? { ...x, discord: e.target.value } : x)); dirtyRef.current.staffCore = true; queueSync(); }}>
                        <option value="">— Select —</option>
                        {(s.role === 'Co-Host' ? eligibleStaff['Co-Host'] : s.role === 'Assistant' ? eligibleStaff.Assistant : Object.keys(staffDirectory)).map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" className={styles.chk} checked={s.attended}
                        onChange={(e) => { setStaffShift((p) => p.map((x, j) => j === i ? { ...x, attended: e.target.checked } : x)); queueSync(); }} />
                    </td>
                    <td><input className={styles.cellInput} defaultValue={s.notes} onBlur={(e) => { setStaffShift((p) => p.map((x, j) => j === i ? { ...x, notes: e.target.value } : x)); queueSync(); }} /></td>
                    <td>
                      <button className={styles.rowDelBtn} disabled={locked.staffDelete} onClick={() => { setStaffShift((p) => p.filter((_, j) => j !== i)); dirtyRef.current.staffCore = true; queueSync(); }}>
                        <FontAwesomeIcon icon={ICONS.trash} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className={styles.addRowBar}>
              <button className={styles.addBtn} disabled={staffShift.length >= 10}
                onClick={() => { setStaffShift((p) => [...p, { role: 'Assistant', discord: '', notes: '', attended: false }]); dirtyRef.current.staffCore = true; queueSync(); }}>
                <FontAwesomeIcon icon={ICONS.plus} /> Add staff member
              </button>
            </div>
          </section>
        </div>

        {/* ── Station generator ── */}
        <section className={styles.panel}>
          <div className={styles.panelTitle}><FontAwesomeIcon icon={ICONS.cameraRetro} /> Screenshot Station</div>
          <div className={styles.stationGenRow}>
            <select className={styles.cellInput} value={stationCode} onChange={(e) => setStationCode(e.target.value)}>
              {STATION_LIST.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
            </select>
            <button className={styles.miniOverrideBtn} onClick={() => setStationCode(STATION_LIST[Math.floor(Math.random() * STATION_LIST.length)].code)}>
              <FontAwesomeIcon icon={ICONS.shuffle} />
            </button>
            <button className={styles.announcementCopyBtn} onClick={() => {
              const station = STATION_LIST.find((s) => s.code === stationCode)!;
              navigator.clipboard.writeText(buildStationAnnouncement(station));
            }}>
              <FontAwesomeIcon icon={ICONS.copy} />
            </button>
          </div>
        </section>

        {/* ── Conclude ── */}
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

        {/* ── Main AST notes ── */}
        <section className={styles.panel}>
          <div className={styles.panelTitle}>Main AST Notes</div>
          <textarea
            className={styles.cellInput}
            rows={6}
            style={{ width: '100%' }}
            value={mainAstNotes}
            onChange={(e) => { setMainAstNotes(e.target.value); queueSync(); }}
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
                  .map((row, i) => ({ row, idx: i + 1, name: (session[`trainee_${i + 1}_name`] as string) || '', trainer: (session[`trainee_${i + 1}_trainer_name`] as string) || '' }))
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
                  hostName: session.host,
                  sessionDateIso: session.session_date,
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
      <div className={styles.toastContainer}>
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles.show}`}>
            <div className={styles.toastMsg}><FontAwesomeIcon icon={ICONS.lock} /> {t.message}</div>
          </div>
        ))}
      </div>

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
        const live = t ? computeCurrentRemaining(t) : 0;
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
                          queueSync();
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
                          showToast('Feedback message copied.');
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
                  <span className={`${styles.timerDisplay} ${t?.running && live > 60 ? styles.running : live <= 0 ? styles.expired : live <= 60 ? styles.low : ''}`}>{fmt(live)}</span>
                  <button className={`${styles.timerBtn} ${t?.running ? styles.active : ''}`} title="Start/pause" onClick={() => toggleTimer(row)}>
                    <FontAwesomeIcon icon={t?.running ? ICONS.pause : ICONS.play} />
                  </button>
                  <button className={styles.timerBtn} title="Reset" onClick={() => resetTimer(row, totalSeconds)}>
                    <FontAwesomeIcon icon={ICONS.redo} />
                  </button>
                  <button
                    className={styles.timerBtn}
                    title="Mark setup done"
                    disabled={setupDone}
                    onClick={() => { if (!setupDone) recordSetupDone(row, totalSeconds); }}
                  >
                    <FontAwesomeIcon icon={ICONS.check} /> {setupDone ? 'Setup Done' : 'Mark setup done'}
                  </button>
                  <button
                    className={styles.timerBtn}
                    title="Override timer value"
                    onClick={() => {
                      const input = window.prompt('Set timer to MM:SS (e.g. 05:30):', fmt(live));
                      if (input !== null) setTimerValue(row, input);
                    }}
                  >
                    <FontAwesomeIcon icon={ICONS.triangleExclamation} /> Override
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
                    {scriptVisible && <ScriptPreview minutes={session.trainee_timer || 12} win={window} />}
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

                <div className={styles.modalFooter}>
                  <button className={styles.mbtn} onClick={() => setFeedbackModalRow(null)}>Cancel</button>
                  <button className={styles.mbtnPrimary} onClick={() => setFeedbackModalRow(null)}>Save feedback</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Trainee pop-out (Document PiP) ── */}
      {pipWindow && pipKind === 'trainee' && pipRow !== null && createPortal(
        (() => {
          const row = pipRow;
          const win = pipWindow;
          const detail = traineeDetails[row] ?? buildTraineeDetail(session, row);
          const t = timers[row];
          const live = t ? computeCurrentRemaining(t) : 0;
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
                <div className={styles.timerCell} style={{ marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <span className={`${styles.timerDisplay} ${t.running && live > 60 ? styles.running : live <= 0 ? styles.expired : live <= 60 ? styles.low : ''}`}>{fmt(live)}</span>
                  <button className={`${styles.timerBtn} ${t.running ? styles.active : ''}`} onClick={() => toggleTimer(row)}><FontAwesomeIcon icon={t.running ? ICONS.pause : ICONS.play} /></button>
                  <button className={styles.timerBtn} onClick={() => resetTimer(row, (session.trainee_timer || 12) * 60)}><FontAwesomeIcon icon={ICONS.redo} /></button>
                  <button className={styles.timerBtn} onClick={() => recordSetupDone(row, (session.trainee_timer || 12) * 60)}><FontAwesomeIcon icon={ICONS.check} /></button>
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
                        queueSync();
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
                  onChange={(e) => { setAttendance((prev) => ({ ...prev, [row]: e.target.checked })); dirtyRef.current.attendance = true; queueSync(); }}
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
                {pipScriptVisible && <ScriptPreview minutes={session.trainee_timer || 12} win={win} />}
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
          const live = t ? computeCurrentRemaining(t) : 0;
          const detail = traineeDetails[row] ?? buildTraineeDetail(session, row);
          const canControl = myRole !== 'assistant';
          return (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.32)' }}>{detail.discord || `Trainee ${parseInt(row, 10) + 1}`}</div>
              {t && (
                <span className={`${styles.timerDisplay} ${t.running && live > 60 ? styles.running : live <= 0 ? styles.expired : live <= 60 ? styles.low : ''}`} style={{ fontSize: '2rem' }}>{fmt(live)}</span>
              )}
              {canControl ? (
                <div className={styles.timerCell} style={{ justifyContent: 'center' }}>
                  <button className={`${styles.timerBtn} ${t?.running ? styles.active : ''}`} onClick={() => toggleTimer(row)}><FontAwesomeIcon icon={t?.running ? ICONS.pause : ICONS.play} /></button>
                  <button className={styles.timerBtn} onClick={() => resetTimer(row, (session.trainee_timer || 12) * 60)}><FontAwesomeIcon icon={ICONS.redo} /></button>
                  <button
                    className={styles.timerBtn}
                    onClick={() => {
                      const input = win.prompt('Set timer to MM:SS:', fmt(live));
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