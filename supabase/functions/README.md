# Edge Functions

All former `src/app/api/*` routes live here as Deno edge functions, so the
Capacitor build can ship without a Next.js server.

## Status

| Original Next.js route        | Edge function name        | Status |
|---                            |---                        |---     |
| `/api/translate`              | `translate`               | ✅ ported |
| `/api/push/subscribe`         | `push-subscribe`          | ✅ ported |
| `/api/push/send`              | `push-send`               | ✅ ported |
| `/api/ai-assistant`           | `ai-assistant`            | ⬜ todo |
| `/api/fix-instructions`       | `fix-instructions`        | ⬜ todo |
| `/api/green-fix-instructions` | `green-fix-instructions`  | ⬜ todo |
| `/api/daily-briefing`         | `daily-briefing`          | ⬜ todo |
| `/api/morning-route`          | `morning-route`           | ⬜ todo |
| `/api/spray-window`           | `spray-window`            | ⬜ todo |
| `/api/auth/pin-login`         | `pin-login`               | ⬜ todo |
| `/api/auth/pin-signup`        | `pin-signup`              | ⬜ todo |
| `/api/cron/*`                 | `pg_cron` trigger         | ⬜ todo (DB-level) |
| `/api/reports/*`              | client-side jsPDF         | ⬜ todo (move to client) |
| `/api/drone/upload`           | `drone-upload`            | ⬜ todo (heavy, last) |

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
