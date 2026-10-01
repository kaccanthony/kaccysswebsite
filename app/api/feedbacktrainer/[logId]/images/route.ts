import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getFeedbackTrainerAccess } from '@/lib/feedbackTrainerAccess';
import { buildKey, deleteFromR2, uploadToR2 } from '@/lib/r2';

type Context = { params: Promise<{ logId: string }> };
const MAX_SIZE = 3 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function error(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

async function authorize(context: Context) {
  const access = await getFeedbackTrainerAccess();
  if (!access) return { failure: error('Forbidden.', 403) };
  const logId = Number((await context.params).logId);
  if (!Number.isSafeInteger(logId) || logId <= 0) return { failure: error('Invalid feedback entry.', 400) };
  const db = createAdminClient();
  const { data: log } = await db.from('session_feedback_logs').select('log_id').eq('log_id', logId).maybeSingle();
  if (!log) return { failure: error('Feedback entry not found.', 404) };
  return { access, logId, db };
}

function validBytes(type: string, bytes: Buffer) {
  if (type === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return type === 'image/webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
}

export async function POST(request: NextRequest, context: Context) {
  const auth = await authorize(context);
  if (auth.failure) return auth.failure;
  if (!process.env.R2_PUBLIC_URL || !process.env.R2_BUCKET_NAME || !process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    return error('R2 is not configured.', 500);
  }
  const length = Number(request.headers.get('content-length'));
  if (length > MAX_SIZE + 65536) return error('Image is larger than 3 MB.', 413);
  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_SIZE || !TYPES.has(file.type)) {
    return error('Choose a PNG, JPEG, JPG, or WebP image up to 3 MB.', 400);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!validBytes(file.type, bytes)) return error('The file contents do not match its image type.', 400);

  const db = auth.db!;
  const logId = auth.logId!;
  const { data: existing, error: readError } = await db.from('feedback_images')
    .select('id, position, status, expires_at, object_key').eq('feedback_log_id', logId);
  if (readError) return error(readError.message, 500);
  for (const image of existing ?? []) {
    if (image.status === 'pending' && image.expires_at && new Date(image.expires_at).getTime() < Date.now()) {
      await deleteFromR2(image.object_key).catch(() => {});
      await db.from('feedback_images').delete().eq('id', image.id).eq('status', 'pending');
    }
  }
  const { data: current } = await db.from('feedback_images').select('position').eq('feedback_log_id', logId);
  const used = new Set((current ?? []).map((image) => image.position));
  const position = Array.from({ length: 10 }, (_, index) => index + 1).find((value) => !used.has(value));
  if (!position) return error('This feedback already has 10 images.', 409);

  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type]!;
  const key = buildKey(`feedback-log/${logId}`, `image.${extension}`);
  const { data: reserved, error: insertError } = await db.from('feedback_images').insert({
    session_id: null, slot_number: null, feedback_log_id: logId, position,
    object_key: key, file_name: file.name.slice(0, 255), content_type: file.type,
    size_bytes: file.size, uploaded_by: auth.access!.userId,
  }).select('id').single();
  if (insertError || !reserved) return error(insertError?.code === '23505' ? 'Another image was added. Try again.' : insertError?.message ?? 'Could not reserve image.', 409);

  try {
    await uploadToR2(key, bytes, file.type);
    const { data, error: finishError } = await db.from('feedback_images')
      .update({ status: 'ready', expires_at: null }).eq('id', reserved.id)
      .select('id, slot_number, position, object_key, file_name, content_type, size_bytes, created_at').single();
    if (finishError || !data) throw finishError ?? new Error('Could not save image.');
    return NextResponse.json({ success: true, image: { ...data, url: `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}` } });
  } catch (cause) {
    console.error('Feedback page image upload failed:', cause);
    await deleteFromR2(key).catch(() => {});
    await db.from('feedback_images').delete().eq('id', reserved.id).eq('status', 'pending');
    return error('Could not upload the image to R2.', 502);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await authorize(context);
  if (auth.failure) return auth.failure;
  const { id } = await request.json().catch(() => ({})) as { id?: string };
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return error('Invalid image ID.', 400);
  const db = auth.db!;
  const { data: image } = await db.from('feedback_images').select('object_key')
    .eq('id', id).eq('feedback_log_id', auth.logId!).maybeSingle();
  if (!image) return error('Image not found.', 404);
  try { await deleteFromR2(image.object_key); }
  catch { return error('Could not delete the image from R2.', 502); }
  const { error: deleteError } = await db.from('feedback_images')
    .delete().eq('id', id).eq('feedback_log_id', auth.logId!);
  if (deleteError) return error(deleteError.message, 500);
  return NextResponse.json({ success: true });
}
