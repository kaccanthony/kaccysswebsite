/**
 * Validate an email/password request body at the server boundary before either
 * value is passed to an auth provider. The current site uses OAuth only; this
 * helper is ready for a future credentials endpoint and must be called there.
 */
export function validateEmailPassword(input: unknown):
  | { ok: true; email: string; password: string }
  | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'A request body is required.' };
  }

  const { email, password } = input as Record<string, unknown>;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return { ok: false, error: 'Email and password must both be strings.' };
  }

  const normalizedEmail = email.trim();
  if (!normalizedEmail || !password) {
    return { ok: false, error: 'Email and password are required.' };
  }
  if (normalizedEmail.length > 254 || password.length > 1024) {
    return { ok: false, error: 'Email or password is too long.' };
  }

  return { ok: true, email: normalizedEmail, password };
}
