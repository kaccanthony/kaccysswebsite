-- Apply before deploying the session feedback image routes.
-- This creates the upload reservation table. Apply
-- link-feedback-images-to-trainees.sql after the archive RPC is installed to
-- capture trainee identity and attach images to archived feedback log IDs.
begin;

create table if not exists public.feedback_images (
  id uuid primary key default gen_random_uuid(),
  session_id integer not null,
  slot_number smallint not null check (slot_number between 1 and 100),
  position smallint not null check (position between 1 and 10),
  object_key text not null unique,
  file_name text not null,
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 3145728),
  status text not null default 'pending' check (status in ('pending', 'ready')),
  expires_at timestamptz default (now() + interval '15 minutes'),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (session_id, slot_number, position)
);

-- Also tightens an existing installation of this migration. NOT VALID keeps
-- older oversized attachments readable while enforcing 3 MB for new rows.
alter table public.feedback_images drop constraint if exists feedback_images_size_bytes_check;
alter table public.feedback_images add constraint feedback_images_size_bytes_check
  check (size_bytes > 0 and size_bytes <= 3145728) not valid;

-- Keep previously uploaded GIF rows readable while disallowing new ones.
alter table public.feedback_images drop constraint if exists feedback_images_content_type_check;
alter table public.feedback_images add constraint feedback_images_content_type_check
  check (content_type in ('image/png', 'image/jpeg', 'image/webp')) not valid;

create index if not exists feedback_images_session_idx
  on public.feedback_images (session_id, slot_number, position);

alter table public.feedback_images enable row level security;
revoke all on public.feedback_images from anon, authenticated;
grant all on public.feedback_images to service_role;

commit;
