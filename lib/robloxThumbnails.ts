// FILE: lib/robloxThumbnails.ts

export type RobloxThumbnailType = 'avatar' | 'avatar-bust' | 'avatar-headshot';

/**
 * Fetches a Roblox avatar thumbnail URL for a given user ID.
 * Public Roblox API — no OAuth token or scope needed, just the ID.
 *
 * Usage:
 *   getRobloxThumbnailUrl(robloxId, 'avatar-bust')     // chest-up, used for the topbar profile
 *   getRobloxThumbnailUrl(robloxId, 'avatar')          // full body, e.g. for a future staff overview grid
 *   getRobloxThumbnailUrl(robloxId, 'avatar-headshot') // tight face crop
 */
export async function getRobloxThumbnailUrl(
  robloxId: number | string,
  type: RobloxThumbnailType = 'avatar-bust',
  size: string = '420x420'
): Promise<string | null> {
  const res = await fetch(
    `https://thumbnails.roblox.com/v1/users/${type}?userIds=${robloxId}&size=${size}&format=Png&isCircular=false`
  );

  if (!res.ok) return null;
  const data = await res.json();
  const entry = data?.data?.[0];

  // state can be "Completed", "Pending", "Blocked", etc. — only trust a
  // finished render, otherwise you can end up storing a placeholder image.
  if (!entry || entry.state !== 'Completed') return null;

  return entry.imageUrl ?? null;
}