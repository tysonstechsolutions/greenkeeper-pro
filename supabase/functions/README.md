# Edge Functions

All former `src/app/api/*` routes live here as Deno edge functions, so the
Capacitor build can ship without a Next.js server.

## Status

| Original Next.js route        | Edge function name        | Status |
|---                            |---                        |---     |
| `/api/translate`              | `translate`               | ✅ ported |
| `/api/push/subscribe`         | `push-subscribe`          | ✅ ported |
| `/api/push/send`              | `push-send`               | ✅ ported |
| `/api/ai-assistant`           | `ai-assistant`            | ✅ ported |
| `/api/fix-instructions`       | `fix-instructions`        | ✅ ported |
| `/api/green-fix-instructions` | `green-fix-instructions`  | ✅ ported |
| `/api/daily-briefing`         | `daily-briefing`          | ✅ ported |
| `/api/morning-route`          | `morning-route`           | ✅ ported |
| `/api/spray-window`           | `spray-window`            | ✅ ported |
| `/api/auth/pin-login`         | `pin-login`               | ✅ ported (deploy with `--no-verify-jwt`) |
| `/api/auth/pin-signup`        | `pin-signup`              | ✅ ported (deploy with `--no-verify-jwt`) |
| `/api/cron/*`                 | `pg_cron` trigger         | ✅ scheduled — see `supabase/migrations/20260417c_add_pg_cron_daily_briefing.sql` |
| `/api/reports/*`              | client-side jsPDF         | ✅ all 11 migrated — see `supabase/functions/REPORTS_MIGRATION.md` |
| `/api/drone/upload`           | `drone-upload`            | ✅ ported (see note in file about large-TIFF body-size limits) |

## Deploy

```bash
# Link your local repo to the remote Supabase project (one-time)
supabase link --project-ref <your-project-ref>

# Deploy all functions
supabase functions deploy

# Deploy one
supabase functions deploy translate
```

## Secrets

Set once per environment via the Supabase dashboard or CLI:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-...
supabase secrets set VAPID_PRIVATE_KEY=...
supabase secrets set VAPID_PUBLIC_KEY=...
supabase secrets set VAPID_SUBJECT=mailto:admin@example.com
# daily-briefing is called by pg_cron/scheduled triggers with a shared secret:
supabase secrets set DAILY_BRIEFING_SECRET=$(openssl rand -hex 32)
# morning-route needs weather data:
supabase secrets set NEXT_PUBLIC_WEATHER_API_KEY=...
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
auto-injected by Supabase — don't set them manually.

## Client flipover

When a function is deployed and verified, add its name to `EDGE_ROUTES` in
`src/lib/api/client.ts`. Every `callApi("translate", …)` call will
automatically switch from `fetch("/api/translate")` to
`supabase.functions.invoke("translate")` with zero callsite changes.

## The porting pattern

For each Next.js route `src/app/api/<name>/route.ts`:

1. Create `supabase/functions/<name>/index.ts` (replace `/` in the name
   with `-`; e.g. `/api/push/send` → `push-send/`).
2. Import shared helpers:
   ```ts
   import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
   import { getUser, getUserClient } from "../_shared/supabase.ts";
   ```
3. Wrap your handler:
   ```ts
   Deno.serve(async (req) => {
     if (req.method === "OPTIONS") return handleCors();
     // ... your logic
     return jsonResponse({ ... });
   });
   ```
4. Swap Next.js primitives:
   - `NextRequest` → `Request`
   - `NextResponse.json(body, { status })` → `jsonResponse(body, status)` / `jsonError(msg, status)`
   - `process.env.X` → `Deno.env.get("X")`
   - `createClient()` (Next SSR helper) → `getUserClient(req)` or `getAdminClient()`
   - Node's `crypto.createHash` → Web Crypto `crypto.subtle.digest`
5. npm packages work via the `npm:` prefix: `import webpush from "npm:web-push@3.6.7";`
6. Deploy and test:
   ```bash
   supabase functions deploy <name>
   curl -X POST https://<project>.functions.supabase.co/<name> \
     -H "Authorization: Bearer <user-jwt>" \
     -H "Content-Type: application/json" \
     -d '{...}'
   ```
7. Add `<name>` to `EDGE_ROUTES` in `src/lib/api/client.ts`.

## Auth patterns

- **Signed-in user required**: `const user = await getUser(req); if (!user) return jsonError("Unauthorized", 401);`
- **RLS applies to DB queries**: `const supabase = getUserClient(req);`
- **Bypass RLS (use rarely)**: `const supabase = getAdminClient();` — only
  for operations that need to work for unauthenticated callers (PIN
  verification) or cross-user admin tasks.

## Testing locally

```bash
# In one terminal, run the function locally
supabase functions serve translate

# In another, hit it with a real JWT from your dev Supabase project
curl -X POST http://localhost:54321/functions/v1/translate \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"text":"Mow the fairway","from":"en","to":"es"}'
```
