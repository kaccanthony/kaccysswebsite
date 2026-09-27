# Supabase optimization diff

These are representative before/after snippets. Tracked-source diff is available with `git diff`; the new SQL and column-list files are untracked until added. Apply the SQL in `database/optimize_session_writes.sql` and `database/optimize_rls_auth_uid.sql` before expecting the optimized RPC path. Application callers fall back to previous requests when an RPC is missing (`PGRST202`).

## Explicit read columns

```diff
- .from('session_ongoing').select('*')
+ .from('session_ongoing').select(SESSION_ONGOING_COLUMNS)
- .from('staff_roster').select('*')
+ .from('staff_roster').select('staff_rank, staff_joined, staff_perm_level, op_dept, host_auth, cohost_auth, asst_auth, comm_dept, eventh_auth, eventch_auth, ih_auth')
```

Reason: Full session rows retain their shape; the roster lookup omits four unused columns and future schema additions no longer inflate existing reads. All `select('*')` calls in application code were replaced.

## Trainee cache write

```diff
- for (const entry of entries) await upsertKnownTrainee(supabase, entry);
+ await supabase.rpc('upsert_known_trainees_batch', { p_entries: entries });
```

Reason: After SQL rollout, a form with N trainees uses one HTTP request instead of about 2N lookup/write requests. Rows are processed in original order inside PostgreSQL; an unavailable RPC uses the old path.

## Staff and trainee replacement

```diff
- await supabase.from('session_staff').delete().eq('session_id', sessionId);
- await supabase.from('session_staff').insert(staffRows);
- await supabase.from('session_trainees').delete().eq('session_id', sessionId);
- await supabase.from('session_trainees').insert(traineeRows);
+ await supabase.rpc('replace_session_children', { p_session_id: sessionId, p_staff: staffRows, p_trainees: traineeRows });
```

Reason: Replacing both child tables takes one HTTP request instead of two to four; PostgreSQL rolls back both replacements on an insert error. The upcoming parent row is still written separately.

## Upcoming session deletion

```diff
- await Promise.all([deleteStaff(), deleteTrainees()]);
- await deleteUpcoming();
+ await supabase.rpc('delete_upcoming_session', { p_session_id: sessionId });
```

Reason: One HTTP request replaces three and groups deletion in one transaction after SQL rollout.

## Concurrent browser reads

```diff
- const data = await (await fetch(url)).json();
+ const data = await readJson(url); // same in-flight URL shares one Promise
```

Reason: Concurrent identical board/directory loads share one request. Cache entry is removed on completion, so subsequent reads always fetch current data.

## RLS and index

```diff
- auth.uid()
+ (select auth.uid())
+ create index if not exists notification_recipients_profile_notif_idx
+   on public.notification_recipients (profile_id, notif_id);
```

Reason: Idempotent policy migration lets PostgreSQL evaluate the user ID once per statement; recipient lookup gains an index for its RLS predicate. No cross-table policy was rewritten as a direct column comparison because that would change access rules.

## Remaining constraints

- `session/[id]/sync` still performs per-row writes and a compare-and-swap update. Combining these into one RPC requires preserving its conflict retries and response shape in database code.
- `saveSession` still writes the upcoming parent row before the child RPC. `conclude_session` also has a separate post-log update. Their whole flows are not yet atomic.
- The management board subscribes to an entire table so it can see newly inserted rows. A row filter would miss inserts outside that filter. Session and bell subscriptions already filter by `session_id`; announcement broadcast uses a session-specific channel and event.
- Existing session, staff, and trainee reads are already batched. Nested PostgREST relationships require foreign keys that are not declared in `database/current_db.sql`; adding them without inspecting live data could alter writes. Existing count-only checks use head/count queries. Other callers need row details.
- Schema snapshots contain no index definitions. Live indexes on `staff_profiles.id`, `site_admins.id`, `profiles.id`, `notification_reads.profile_id`, and `admin_view_as_logs.admin_id` must be checked before declaring them missing. `notification_recipients.profile_id` receives an index here.
- No local PostgreSQL client or connected Supabase database was available to execute the migrations. Apply SQL, refresh PostgREST schema cache if needed, then smoke-test a session save and delete.
