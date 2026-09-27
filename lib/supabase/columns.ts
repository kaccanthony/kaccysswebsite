// Explicit physical columns returned wherever callers need the full row shape.
export const SESSION_ONGOING_COLUMNS = 'session_id, session_status, session_name, session_desc, session_duration, num_slots, trainer_assignment_mode, session_date, session_time, started_at, additional_notes, live_state, last_updated, trainee_timer';

export const SESSION_UPCOMING_COLUMNS = 'session_id, session_status, session_booked, session_name, session_desc, session_duration, num_slots, trainer_assignment_mode, session_date, session_time, additional_notes, trainee_timer';

export const SESSION_BELL_COLUMNS = 'session_id, active, initiator_role, initiator_client, acks, ring_started_at, last_ring_at, ring_count, cooldown_until, updated_at';
