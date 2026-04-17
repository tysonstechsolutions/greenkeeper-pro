# Migration: Next.js PWA/TWA → Capacitor Native Android App

**Goal:** ship a genuinely native-feeling Android app (no browser chrome, native camera, bundled web assets, Play Store published) while keeping ~90% of the existing React code. Supabase stays as the backend.

**Branch:** `capacitor-migration`. Do NOT merge to `main` until all phases are green — `main` keeps deploying the working TWA to Vercel.

---

## Current state inventory

What the app uses today that needs migration attention:

| Feature | Current impl | Capacitor target |
|---|---|---|
| Frontend | Next.js 16 App Router, Server Components | Static export (`output: "export"`) — no SSR, no RSC streaming |
| API routes | 12 routes in `src/app/api/*` | Supabase Edge Functions (Deno) |
| Middleware | `src/middleware.ts` for auth redirects | Client-side route guards |
| Auth | Supabase Auth + PIN login | Unchanged |
| Service worker | Serwist for offline cache | Not needed inside Capacitor (assets are local) |
| Camera | `getUserMedia` → `<canvas>` snapshot | `@capacitor/camera` native plugin |
| Barcode scan | `html5-qrcode` webcam | `@capacitor-mlkit/barcode-scanning` native |
| Push notifications | `/api/push` + VAPID | `@capacitor/push-notifications` + FCM |
| File storage | Supabase Storage | Unchanged |
| Sentry | `@sentry/nextjs` | `@sentry/capacitor` |
| Vercel Analytics | `@vercel/analytics` | Removed — doesn't apply |

**Affected API routes** (each must become a Supabase Edge Function):
1. `ai-assistant` — OpenAI/Anthropic chat
2. `auth` — PIN verification
3. `cron` — scheduled jobs
4. `daily-briefing` — AI-generated summaries
5. `drone` — GeoTIFF processing
6. `fix-instructions` — AI-generated maintenance guides
7. `green-fix-instructions` — AI-generated green repair guides
8. `morning-route` — AI route optimization
9. `push` — web push dispatch
10. `reports` — PDF generation (may need to stay client-side)
11. `spray-window` — weather + spray suitability
12. `translate` — i18n translation

---

## Phase 0 — Foundation (THIS SESSION) ✅

- [x] Create `capacitor-migration` branch
- [x] Install `@capacitor/{core,cli,android,camera,filesystem,preferences,push-notifications,status-bar,splash-screen}`
- [x] Create `capacitor.config.ts`
- [x] Commit the roadmap (this file)

**Next step to run on your machine** (after you install prerequisites):
```bash
# Install Android Studio + JDK 17 once (one-time setup)
# Then from the repo:
npx cap add android
```
This creates the `android/` folder with the native Android Studio project.

---

## Phase 1 — Static export compatibility (1–2 sessions)

Goal: make `npm run build` produce a fully static `out/` directory with no server dependencies.

### 1.1 — Switch Next.js to static export

In `next.config.ts`, add:
```ts
output: "export",
images: { unoptimized: true }, // required with static export
trailingSlash: true,            // prevents 404s on direct navigation in Capacitor
```

### 1.2 — Remove everything that static export can't do

**Must be removed or moved:**
- `src/middleware.ts` → convert auth guard logic to a client-side `<AuthGate>` wrapper component in layout
- Any `dynamic = "force-dynamic"` page configs → remove
- Any `generateStaticParams` that references the DB → replace with client-side fetching

**Must be deleted from the Capacitor build:**
- `src/app/api/**` — API routes cannot exist alongside static export

Strategy: keep the API routes on `main` for the TWA-on-Vercel users, migrate them to Edge Functions in parallel (Phase 2), then delete from the `capacitor-migration` branch.

### 1.3 — Blockers to hunt

Things that will break the static build and need case-by-case fixes:
- Dynamic route segments with `generateStaticParams` fetching Supabase (needs client fetch instead)
- Components using `cookies()`, `headers()`, `draftMode()` — all server-only
- Any `<Image src=...>` with external URLs (need `unoptimized: true` + full URLs)
- Sentry's Next.js webpack plugin (switch to `@sentry/capacitor`)

### 1.4 — Verification
```bash
npm run build
ls out/   # should show index.html, _next/, etc.
```

---

## Phase 2 — Migrate API routes to Supabase Edge Functions (2–4 sessions)

Each route becomes a Deno function in `supabase/functions/<name>/index.ts`. Deploy with `supabase functions deploy <name>`.

Priority order (easiest → hardest):
1. **`translate`** — simple proxy to translation API
2. **`push`** — web-push library exists in Deno
3. **`spray-window`** — weather API call + logic
4. **`fix-instructions`, `green-fix-instructions`, `morning-route`, `daily-briefing`, `ai-assistant`** — all LLM proxies, same pattern
5. **`auth`** — PIN verification logic
6. **`cron`** — Supabase has built-in `pg_cron` — might be replaced entirely by a DB trigger
7. **`drone`** — GeoTIFF processing. Heavy. Might need a small VPS or stay as last-mile server.
8. **`reports`** — PDF generation. Keep client-side using jsPDF (already in deps).

Client calls change from:
```ts
fetch("/api/ai-assistant", { method: "POST", body: JSON.stringify(...) })
```
to:
```ts
supabase.functions.invoke("ai-assistant", { body: {...} })
```

Write a small wrapper in `src/lib/api.ts` so route names can be grep-replaced in one commit.

---

## Phase 3 — Native plugins (1 session)

### 3.1 — Camera (`@capacitor/camera`)

Replace the `InlineCamera` component's `getUserMedia` path with:
```ts
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

const image = await Camera.getPhoto({
  quality: 90,
  allowEditing: false,
  resultType: CameraResultType.Uri,
  source: CameraSource.Camera,
  saveToGallery: false,
});
// image.webPath -> display in <img>
// convert to File for upload: await fetch(image.webPath).then(r => r.blob())
```

Keep the component interface (`open`, `onCapture`, `onClose`) identical so calling pages don't change.

### 3.2 — Barcode scanner

Swap `html5-qrcode` for `@capacitor-mlkit/barcode-scanning` — native ML Kit, much faster, better low-light accuracy. Used in:
- `src/app/assets/scan/page.tsx`
- `src/app/assets/[id]/page.tsx` (link-barcode flow)

### 3.3 — Push notifications

Swap web push for native FCM via `@capacitor/push-notifications`. Supabase has a function trigger for sending via FCM.

### 3.4 — Splash + status bar

Already configured in `capacitor.config.ts`. Generate icons/splash via:
```bash
npm install --save-dev @capacitor/assets
npx capacitor-assets generate --android
```
You'll need a 1024x1024 logo and a 2732x2732 splash PNG.

---

## Phase 4 — Build + Play Store (1 session)

### 4.1 — Build APK

```bash
npm run build              # produces /out
npx cap sync android       # copies /out into android/app/src/main/assets
npx cap open android       # opens Android Studio
# In Android Studio: Build > Generate Signed Bundle / APK > Android App Bundle
```

### 4.2 — Signing

Generate a keystore ONCE, keep it in a password manager forever:
```bash
keytool -genkey -v -keystore vmgc-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias vmgc
```

### 4.3 — Play Store submission

1. Pay $25 Google Play Console fee (one-time)
2. Create app listing: "VMGC GreenKeeper"
3. Upload `.aab` (Android App Bundle)
4. Fill in store listing: screenshots, description, privacy policy URL
5. Submit for review (~24-48h first time)

---

## What stays the same

- All Supabase tables, RLS policies, functions
- All React components (business logic)
- Routing (Next.js App Router file structure is fine in static export)
- Styling (Tailwind works as-is)
- State management, hooks, contexts
- PIN login flow (adapts to use Edge Function for verification)

---

## Running log

- **2026-04-17** Phase 0 complete. Capacitor packages installed, config created, branch `capacitor-migration` pushed. Next: Phase 1 — static export config.
