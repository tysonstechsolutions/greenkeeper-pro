/**
 * Standard CORS headers every edge function needs.
 *
 * The Capacitor webview serves pages from an unusual origin (capacitor:// or
 * https://localhost), and during development the app hits the functions from
 * the Next.js dev server at localhost:3000. We permissively allow any origin
 * because auth is enforced by the Supabase JWT the client sends in the
 * Authorization header — not by origin.
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/**
 * Short-circuit the OPTIONS preflight request. Call this at the top of every
 * function's handler:
 *
 *   if (req.method === "OPTIONS") return handleCors();
 */
export function handleCors(): Response {
  return new Response("ok", { headers: corsHeaders });
}

/**
 * Wrap any successful JSON body in a Response with CORS + content-type set.
 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Consistent error shape: { error: string, status: number }.
 */
export function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
