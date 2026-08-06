// FILE: lib/r2Actions.ts
'use server';

import { getCurrentUser } from './getCurrentUser';
import { uploadToR2, buildKey } from './r2';

const MAX_SIZE = 8 * 1024 * 1024; // 8MB — adjust when the real feature lands
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export async function uploadImage(folder: string, file: File): Promise<{ url: string } | { error: string }> {
  await getCurrentUser(); // must be signed in — redirects to /login otherwise

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: 'Only PNG, JPEG, WebP, or GIF images are allowed.' };
  }
  if (file.size > MAX_SIZE) {
    return { error: 'Image is too large (max 8MB).' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = buildKey(folder, file.name);
  const url = await uploadToR2(key, buffer, file.type);

  return { url };
}