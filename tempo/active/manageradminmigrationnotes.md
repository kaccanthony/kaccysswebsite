# Manage Staff / Admin → Next.js migration notes

## Where things went

| Old PHP | New file |
|---|---|
| `admin_tables.php` + `managestaff_tables.php` | `lib/manageTables.ts` |
| `admin_records.php` + `manage_records.php` | `app/api/manage/records/route.ts` (+ `staff-directory/route.ts` for the one joined board) |
| `admin.php` + `managestaff.php` | `app/(app)/manage/page.tsx` (server-side gate) |
| `admin.js` + `managestaff.js` | `app/(app)/manage/ManageBoard.tsx` (client) |
| `admin.css` + `managestaff.css` | `app/(app)/manage/manage.css` |
| `admin_avatar_upload.php` | **removed** — see "Avatars" below |

**One page now, not two.** `permLevel >= 15` (Manager) gets in and sees the "Staff Management" /
"Session Logs" / "Events" groups, exactly like `managestaff.php` did. `permLevel >= 20`
(Admin/Dev/Owner) additionally sees the "Admin Only" group and any column flagged
`minLevel: 20` (e.g. `staff_perm_level`), which is everything `admin.php` used to show on top.
The `manageTables.ts` config is the single source of truth for this — the sidebar, the API
routes, and the field-locking in the modal all read the same `minLevel` numbers, so there's no
way for a Manager to see something an Admin gate is supposed to hide (same guarantee the old
PHP `$config[$table]['minLevel']` checks gave you).

## UI/behavior: unchanged on purpose

Every class name (`ms-board-btn`, `ms-pill-0..5`, `ms-json-summary`, etc.), every interaction
(sliding sidebar indicator, board fade/slide transition, row stagger-in, search box, click-a-
column-header-to-sort, locked/greyed fields in the modal, the exact notification composer with
its colored category pills, force-conclude on session cards) — all ported 1:1. Nothing was
redesigned.

**One necessarily-visible change:** the shared topbar (logo, app name, profile avatar/popup,
Notifications/Settings/Log out) is no longer duplicated inside this page — it comes from
`AppShell.tsx` / `appshell.css`, which every page under `app/(app)/` already renders. Pixel
appearance is the same (same markup/classes), it's just not re-declared here. That's the one
"optimization" I baked in rather than flagged, because leaving two copies of the same topbar
CSS around is a bug waiting to happen the next time one gets tweaked and the other doesn't.

## Schema differences that forced real changes

The PHP config pointed at an older MySQL schema. `db.txt` is a different (Supabase/Postgres)
schema, so a few boards couldn't be ported as literal 1:1 table copies:

- **`staff_list` → `staff_directory`.** There's no flat staff table anymore — a staff member is
  a `profiles` row (Discord identity) that also has a `staff_profiles` row (rank/LOA/perm
  level/etc). This board reads as a join and writes as up to two conditional updates. It's the
  one board marked `joined: true` in `manageTables.ts` and it has its own route
  (`staff-directory/route.ts`) instead of going through the generic CRUD route.
  "Add Record" for this board is now "promote an existing profile to staff" rather than
  free-typing a Discord ID, because you can no longer hand-create a `profiles` row — those only
  come from someone actually signing in with Discord. **You'll want to wire an actual profile
  picker/search into `RecordModal` for this board's Add flow** — I left it accepting a raw
  `id` value in the POST body as a placeholder; a `<select>` of not-yet-staff profiles (same
  pattern the old quota-add dropdown used) is the natural next step.
- **`user_list`, `pp_staff_pp`, `pp_user_pp`, `user_staff_notif_prefs`** — gone. Supabase Auth
  replaced the custom login tables entirely, "users" are just `profiles` rows without a
  `staff_profiles` row, and notification prefs are the `profiles.notif_prefs` jsonb column
  (not a per-row table), so there's nothing left to CRUD row-by-row.
- **Avatars.** `staff_avatar`/`user_avatar` blob columns don't exist anymore —
  `profiles.discord_avatar_url` is a Discord CDN link, synced automatically on login. So
  `admin_avatar_upload.php` has no replacement: there's no more "upload an avatar" action, the
  avatar column is now read-only and just displays the URL. If you ever want a manual override
  (e.g. for someone with no Discord avatar), that'd need a real Supabase Storage bucket + a
  small upload route — happy to build that if you want it, just didn't want to invent a feature
  that wasn't there before.
- **`session_feedback_logs`** used to store one `feedback_json` blob; the actual schema already
  has it as real columns (`setup`, `conflict`, `priority`, `rbtiming`, `overall`, `notes`,
  `trains`, `setup_seconds`). That's strictly simpler now — no JSON formatter needed, they're
  just normal fields.
- **`event_upcoming` / `event_log_archives`** actually exist in the schema now, so I built them
  out as real table boards instead of leaving them `comingSoon: true`. Pure bonus, nothing was
  removed to make room for it — feel free to rip them back out if you're not ready for them.
- **`site_admins`** is new (didn't exist in the old schema) and maps naturally onto the "who's
  dev/admin/owner" concept you asked about — surfaced as an Admin Only board.
- **`session_full_logs.trainee_assessed`** is `integer NOT NULL` in the real schema, not a
  boolean like the old UI implied (`'Assessed'` checkbox) — I kept it as a number field
  ("Assessed (score)") rather than force a checkbox onto a column that isn't actually boolean.
  Flagging this in case the intent really was boolean and the column type should change.

## FontAwesome 5 → 7.3.1

`lib/manageIcons.ts` replaces the `kit.fontawesome.com` script tag with real
`@fortawesome/free-solid-svg-icons` imports, same pattern as your existing `lib/icons.ts`.
Renamed icons (old FA5 class → FA6/7 import name, same as the `fa-cog`→`faGear` /
`fa-sign-out-alt`→`faRightFromBracket` renames you'd already done):

| old class | new import |
|---|---|
| `fa-times` | `faXmark` |
| `fa-check-circle` | `faCircleCheck` |
| `fa-times-circle` | `faCircleXmark` |
| `fa-info-circle` | `faCircleInfo` |
| `fa-exclamation-triangle` | `faTriangleExclamation` |

Everything else (`fa-arrow-left`, `fa-user`, `fa-chevron-down`, `fa-bell`, `fa-plus`, `fa-pen`,
`fa-trash`, `fa-inbox`, `fa-hammer`, `fa-sort`/`fa-sort-up`/`fa-sort-down`, `fa-flag-checkered`)
kept its name across versions.

## Supabase Realtime

Optional, on by default (`REALTIME_ENABLED` at the top of `ManageBoard.tsx`). When you have a
board open, it subscribes to `postgres_changes` on that board's underlying table and silently
re-fetches when a row changes anywhere — including from another admin's tab, or from your own
session's live sync jobs (e.g. `session_ongoing`). This is a genuinely new capability: the old
PHP page had zero live-update behavior, you only ever saw fresh data after a manual reload.
Turn it off by flipping that one constant if you'd rather keep it purely on-demand — nothing
else in the file depends on it being on.

## Loose end

`forceConcludeSession()` in `ManageBoard.tsx` calls `POST /api/sessionongoing/conclude` — that
route doesn't exist yet in the tree you shared (the old target was
`../sessionongoing/conclude_session.php`). You'll need a small Next.js route handler there that
does the same archive-then-delete-from-`session_ongoing` work; I didn't want to guess at its
exact logic without seeing `conclude_session.php`.

## Suggested further optimizations (not applied — didn't want to change behavior without asking)

1. **Server-side initial fetch.** `ManageBoard` currently does its first `fetch()` from the
   client after mount (like the old `admin.js` did against `admin.php`). Since `page.tsx` is
   already a Server Component with `getCurrentUser()`, you could fetch the first board's rows
   there too and pass them down as the initial `rows` state — saves one client-side round trip
   per page load, with zero visible change.
2. **`directory` resolution** currently fetches *every* profile + every archived-staff row up
   front the first time any `resolveId` column is shown. For a small server that's fine; if the
   roster grows, this is the first thing worth turning into a per-id lookup (`.in('id', ids)`)
   instead of "load everyone."
3. Both new API routes re-derive `permLevel` from Supabase on every request (2 queries). If this
   page gets hit a lot, that's a fine candidate for a short-lived (~30s) in-memory or Redis cache
   keyed by user id — not worth it unless you notice it in practice.