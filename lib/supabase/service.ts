import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// The service_role key bypasses RLS entirely (rolbypassrls) -- there is
// no user session to scope to here, since this is used exclusively by
// the Mux webhook route, which receives anonymous, unauthenticated
// requests from Mux's own servers. Never expose this client, or the key
// it holds, to anything reachable from a user's browser or session.
export function createServiceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
