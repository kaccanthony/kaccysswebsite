import { createHmac, timingSafeEqual } from 'crypto';
import type { ViewAsAuthFlags } from './rankMap';

const COOKIE_NAME = 'yss_view_as';
const MAX_AGE_SECONDS = 4 * 60 * 60;

export interface ViewAsPayload {
  adminId: string;
  mode: 'rank' | 'person';
  rank: string;
  permLevel: number;
  auths: ViewAsAuthFlags;
  personLabel?: string; // discord_username — only set when mode === 'person'
  logId: number;
  exp: number;
}

function secret(): string {
  const s = process.env.VIEW_AS_SECRET;
  if (!s) throw new Error('VIEW_AS_SECRET is not set — see README for setup.');
  return s;
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url');
}

export function encodeViewAsCookie(payload: ViewAsPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function decodeViewAsCookie(cookieValue: string | undefined, requesterId: string): ViewAsPayload | null {
  if (!cookieValue) return null;
  const [body, sig] = cookieValue.split('.');
  if (!body || !sig) return null;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: ViewAsPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (payload.adminId !== requesterId) return null;

  return payload;
}

export const VIEW_AS_COOKIE_NAME = COOKIE_NAME;
export const VIEW_AS_MAX_AGE_SECONDS = MAX_AGE_SECONDS;