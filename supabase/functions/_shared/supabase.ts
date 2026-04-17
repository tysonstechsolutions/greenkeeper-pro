/**
 * Supabase client factories for use inside edge functions.
 *
 * Two flavors, pick the right one for your use case:
 *
 *   getUserClient(req)   — acts as the CALLING USER. Row-level security
 *                          applies. Use whenever the function is exposing
 *                          data the user is already authorized to see.
 *
 *   getAdminClient()     — service-role key, BYPASSES RLS. Only use for
 *                          operations that must succeed regardless of the
 *                          caller's permissions (cron jobs, verifying a PIN
 *                          that an unauthenticated user is submitting, etc.)
 *                          NEVER return admin-client data directly without
 *                          re-checking authorization.
 */
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Return a Supabase client scoped to the calling user (RLS applies).
 * Uses the Authorization header the client sent with the request.
 */
export function getUserClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Return an admin client with the service-role key. Bypasses RLS. Handle
 * with care.
 */
export function getAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Extract the authenticated user from the request. Returns null if the
 * caller is anonymous or the JWT is invalid.
 */
export async function getUser(req: Request) {
  const client = getUserClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}
