import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getApiUser } from '@/lib/apiAuth';
import { buildKey, deleteFromR2, uploadToR2 } from '@/lib/r2';

const MAX_SIZE = 3 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
type Context = { params: Promise<{ id: string }> };

function json(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

async function authorize(context: Context) {
  const sessionId = Number((await context.params).id);
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) return { error: json('Invalid session ID.', 400) };
  const user = await getApiUser();
  if (!user) return { error: json('Unauthorized.', 401) };
  const supabase = await createClient();
  const [{ data: session }, { data: profile }, { data: staff }] = await Promise.all([
    supabase.from('session_ongoing').select('session_id').eq('session_id', sessionId).maybeSingle(),
    supabase.from('profiles').select('discord_username').eq('id', user.id).maybeSingle(),
    supabase.from('session_staff').select('staff_name').eq('session_id', sessionId),
  ]);
  if (!session) return { error: json('Ongoing session not found.', 404) };
  const username = profile?.discord_username?.trim().toLowerCase();
  if (!user.isAdmin && !staff?.some((row) => row.staff_name.trim().toLowerCase() === username)) {
    return { error: json('You are not assigned to this session.', 403) };
  }
  return { sessionId, user };
}

function imageUrl(key: string) {
  return `${process.env.R2_PUBLIC_URL?.replace(/\/$/, '')}/${key}`;
}

function isImageBytes(type: string, bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  if (type === 'image/png') return b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === 'image/webp') return b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP';
  return false;
}

export async function GET(_req: NextRequest, context: Context) {
  const auth = await authorize(context);
  if (auth.error) return auth.error;
  if (!process.env.R2_PUBLIC_URL) return json('R2 public URL is not configured.', 500);
  const { data, error } = await createAdminClient().from('feedback_images')
    .select('id, slot_number, position, object_key, file_name, content_type, size_bytes')
    .eq('session_id', auth.sessionId!).eq('status', 'ready').order('position');
  if (error) return json(error.message, 500);
  return NextResponse.json({ success: true, images: (data ?? []).map((row) => ({ ...row, url: imageUrl(row.object_key) })) });
}

export async function POST(req: NextRequest, context: Context) {
  const auth = await authorize(context);
  if (auth.error) return auth.error;
  if (!process.env.R2_PUBLIC_URL || !process.env.R2_BUCKET_NAME || !process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    return json('R2 is not configured.', 500);
  }
  if (req.headers.get('content-type')?.startsWith('multipart/form-data')) {
    const length = Number(req.headers.get('content-length'));
    if (length > MAX_SIZE + 32 * 1024) return json('Image is larger than 3 MB.', 413);
    const form = await req.formData().catch(() => null);
    return upload(form, auth.sessionId!, auth.user!.id);
  }
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.action === 'prepare') return prepare(body, auth.sessionId!, auth.user!.id);
  return json('Invalid image action.', 400);
}

async function prepare(body: Record<string, unknown>, sessionId: number, userId: string) {
  const slotNumber = Number(body.slot_number);
  const size = Number(body.size_bytes);
  const type = String(body.content_type ?? '');
  const name = String(body.file_name ?? '').slice(0, 255);
  if (!Number.isSafeInteger(slotNumber) || slotNumber < 1 || !Number.isSafeInteger(size) || size < 1 || size > MAX_SIZE || !TYPES.has(type) || !name) {
    return json('Choose a PNG, JPEG, JPG, or WebP image up to 3 MB.', 400);
  }
  const db = createAdminClient();
  const { data: trainee } = await db.from('session_trainees')
    .select('trainee_row_id, trainee_discord_id, trainee_discord, trainee_roblox_username')
    .eq('session_id', sessionId).eq('slot_number', slotNumber).maybeSingle();
  if (!trainee) return json('Trainee slot not found.', 404);
  if (trainee.trainee_discord_id == null && !trainee.trainee_discord?.trim() && !trainee.trainee_roblox_username?.trim()) {
    return json('Select a trainee before uploading feedback images.', 400);
  }

  const { data: expired } = await db.from('feedback_images').select('id, object_key')
    .eq('session_id', sessionId).eq('slot_number', slotNumber).eq('status', 'pending').lt('expires_at', new Date().toISOString());
  for (const row of expired ?? []) {
    try {
      await deleteFromR2(row.object_key);
      await db.from('feedback_images').delete().eq('id', row.id).eq('status', 'pending');
    } catch { /* Keep the reservation so cleanup can be retried. */ }
  }

  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[type]!;
  const key = buildKey(`feedback/${sessionId}/${slotNumber}`, `image.${extension}`);
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: existing, error: readError } = await db.from('feedback_images').select('position')
      .eq('session_id', sessionId).eq('slot_number', slotNumber);
    if (readError) return json(readError.message, 500);
    const used = new Set((existing ?? []).map((row) => row.position));
    const position = Array.from({ length: 10 }, (_, i) => i + 1).find((n) => !used.has(n));
    if (!position) return json('This feedback already has 10 images.', 409);
    const { data, error } = await db.from('feedback_images').insert({
      session_id: sessionId, slot_number: slotNumber, trainee_row_id: trainee.trainee_row_id,
      position, object_key: key,
      file_name: name, content_type: type, size_bytes: size, uploaded_by: userId,
    }).select('id').single();
    if (error?.code === '23505') continue;
    if (error || !data) return json(error?.message || 'Could not reserve image slot.', 500);
    return NextResponse.json({ success: true, id: data.id });
  }
  return json('Another image was added at the same time. Try again.', 409);
}

async function upload(form: FormData | null, sessionId: number, userId: string) {
  const id = String(form?.get('id') ?? '');
  const file = form?.get('image');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json('Invalid image ID.', 400);
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_SIZE || !TYPES.has(file.type)) {
    return json('Choose a PNG, JPEG, JPG, or WebP image up to 3 MB.', 400);
  }
  const db = createAdminClient();
  const { data: image } = await db.from('feedback_images').select('*')
    .eq('id', id).eq('session_id', sessionId).eq('uploaded_by', userId).eq('status', 'pending').maybeSingle();
  if (!image) return json('Image upload reservation not found.', 404);
  if (file.size !== image.size_bytes || file.type !== image.content_type) return json('Image does not match its upload reservation.', 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!isImageBytes(file.type, bytes)) return json('The file contents do not match its image type.', 400);
  try {
    await uploadToR2(image.object_key, bytes, file.type);
    const { data, error } = await db.from('feedback_images').update({ status: 'ready', expires_at: null })
      .eq('id', id).eq('status', 'pending')
      .select('id, slot_number, position, object_key, file_name, content_type, size_bytes').single();
    if (error || !data) {
      await deleteFromR2(image.object_key).catch(() => {});
      return json(error?.message || 'Could not save image.', 500);
    }
    return NextResponse.json({ success: true, image: { ...data, url: imageUrl(data.object_key) } });
  } catch (error) {
    console.error('Feedback image upload to R2 failed:', error);
    return json('Could not upload the image to R2.', 502);
  }
}

export async function DELETE(req: NextRequest, context: Context) {
  const auth = await authorize(context);
  if (auth.error) return auth.error;
  const { id } = await req.json().catch(() => ({})) as { id?: string };
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json('Invalid image ID.', 400);
  const db = createAdminClient();
  const { data: image, error } = await db.from('feedback_images').select('object_key')
    .eq('id', id).eq('session_id', auth.sessionId!).maybeSingle();
  if (error) return json(error.message, 500);
  if (!image) return json('Image not found.', 404);
  try { await deleteFromR2(image.object_key); }
  catch { return json('Could not delete the image from R2.', 502); }
  const result = await db.from('feedback_images').delete().eq('id', id).eq('session_id', auth.sessionId!);
  if (result.error) return json(result.error.message, 500);
  return NextResponse.json({ success: true });
}
