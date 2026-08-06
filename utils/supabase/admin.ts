// FILE: utils/supabase/admin.ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// service_role bypasses RLS entirely — this file must NEVER be imported
// into a client component, and SUPABASE_SERVICE_ROLE_KEY must NEVER be
// prefixed with NEXT_PUBLIC_. Only use this for genuine server-side
// operations that legitimately need to act outside a specific user's
// own row, like the staff_roster claim check in auth/callback/route.ts.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}