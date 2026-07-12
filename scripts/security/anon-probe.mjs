/**
 * Phase 0B anon-access probe (read-safe).
 *
 * Checks whether the PUBLIC ANON KEY can reach tables it must not reach.
 * Prints ONLY check names, HTTP statuses, row counts, and allow/deny verdicts —
 * never table contents, PINs, names, phones, or any other values.
 *
 * Every "write" probe is constructed so it cannot change data:
 *   - INSERT sends an empty object into a table whose `id` is NOT NULL with no
 *     default → if access is allowed the request dies on the constraint (23502)
 *     before a row can exist; if access is revoked it dies on permissions (42501).
 *   - UPDATE/DELETE filter on an impossible UUID → zero rows can ever match.
 *
 * Usage:  node scripts/security/anon-probe.mjs
 * Reads NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / _APP_EMAIL / _APP_PASSWORD from
 * .env.local (or the environment). Exits 0 always; verdicts are the output.
 */
import { readFileSync } from "node:fs";

const env = { ...process.env };
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].trim();
  }
} catch { /* .env.local optional if vars are exported */ }

const URL_ = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
if (!URL_ || !ANON) { console.error("Missing SUPABASE url/anon key"); process.exit(1); }

const NIL = "00000000-0000-0000-0000-000000000001"; // impossible row id
const results = [];

async function probe(name, method, path, { body, token } = {}) {
  const headers = {
    apikey: ANON,
    Authorization: `Bearer ${token || ANON}`,
    "Content-Type": "application/json",
    Prefer: "count=exact",
  };
  let status = 0, code = "", rows = null;
  try {
    const res = await fetch(`${URL_}/rest/v1/${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    status = res.status;
    const text = await res.text();
    if (status >= 400) {
      try { code = JSON.parse(text).code || ""; } catch { /* ignore */ }
    } else if (method === "GET") {
      try { rows = JSON.parse(text).length; } catch { rows = null; }
    }
  } catch (e) {
    code = "network:" + (e?.message || "error").slice(0, 40);
  }
  // Allowed = the request got past permissions. A 23502 not-null violation on the
  // empty INSERT means access was ALLOWED (constraint fired inside the table).
  const allowed = (status >= 200 && status < 300) || code === "23502";
  results.push({ name, method, status, code, rows, verdict: allowed ? "ALLOWED" : "denied" });
}

// ── anon probes ───────────────────────────────────────────────────────────────
await probe("anon SELECT pin_codes",          "GET",    "pin_codes?select=id&limit=1");
await probe("anon SELECT profiles",           "GET",    "profiles?select=id&limit=1");
await probe("anon SELECT vmgc_issues",        "GET",    "vmgc_issues?select=id&limit=1");
await probe("anon SELECT vmgc_purchases",     "GET",    "vmgc_purchases?select=id&limit=1");
await probe("anon SELECT vmgc_conversations", "GET",    "vmgc_conversations?select=id&limit=1");
await probe("anon SELECT task_series",        "GET",    "task_series?select=id&limit=1");
await probe("anon SELECT task_templates",     "GET",    "task_templates?select=id&limit=1");
await probe("anon SELECT invites",            "GET",    "invites?select=id&limit=1");
await probe("anon SELECT tasks (control)",    "GET",    "tasks?select=id&limit=1");
await probe("anon INSERT vmgc_issues (constraint-guarded)", "POST", "vmgc_issues", { body: {} });
await probe("anon UPDATE vmgc_issues (0-row match)", "PATCH",  `vmgc_issues?id=eq.${NIL}`, { body: { notes: "probe" } });
await probe("anon DELETE vmgc_issues (0-row match)", "DELETE", `vmgc_issues?id=eq.${NIL}`);
await probe("anon UPDATE invites (0-row match)",     "PATCH",  `invites?id=eq.${NIL}`, { body: { used_by: null } });

// ── authenticated control (shared kiosk account must keep working) ───────────
const email = env.NEXT_PUBLIC_APP_EMAIL, password = env.NEXT_PUBLIC_APP_PASSWORD;
if (email && password) {
  try {
    const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const tok = (await res.json()).access_token;
    if (tok) {
      await probe("AUTH SELECT profiles (control)",  "GET", "profiles?select=id&limit=1",  { token: tok });
      await probe("AUTH SELECT pin_codes (control)", "GET", "pin_codes?select=id&limit=1", { token: tok });
      await probe("AUTH SELECT tasks (control)",     "GET", "tasks?select=id&limit=1",     { token: tok });
      await probe("AUTH SELECT vmgc_issues (control)","GET", "vmgc_issues?select=id&limit=1",{ token: tok });
    } else {
      results.push({ name: "AUTH sign-in", verdict: "FAILED (no token)" });
    }
  } catch (e) {
    results.push({ name: "AUTH sign-in", verdict: "FAILED " + (e?.message || "").slice(0, 40) });
  }
} else {
  results.push({ name: "AUTH controls skipped", verdict: "no app email/password in env" });
}

console.log(`\nAnon-access probe — ${new Date().toISOString()}\n`);
for (const r of results) {
  const pad = (s, n) => String(s ?? "").padEnd(n);
  console.log(`${pad(r.name, 46)} ${pad(r.method || "", 7)} ${pad(r.status ?? "", 4)} ${pad(r.code || "", 14)} rows=${r.rows ?? "-"}  ${r.verdict}`);
}
