# GreenKeeper Pro — Disaster Recovery Review & Checklist

**Date:** 2026-07-12 · **Reviewed by:** Fable (read-only; no app or config changes made)
**Scope:** Can we recover GreenKeeper Pro if the database, the app, or the files are lost — and what does one person need in order to do it.

---

## Bottom line (read this first)

| Question | Answer |
|---|---|
| If the **database** fails, can we restore it? | **Mostly yes.** Supabase is taking an automatic full backup **every day**, and 8 daily backups are on hand (a rolling ~7-day window). You could lose **up to 24 hours** of data, and a backup is only useful if the problem is found **within 7 days**. Point-in-time recovery is **OFF**. |
| If the **app** fails, how do we rebuild it? | **Yes, cleanly** — the code is on GitHub and the app is rebuilt from it. The one true blocker would be losing the Android signing key (see risks). |
| Are our **files and documents** protected? | **This is the weak spot.** Photos, vendor quotes, 889 forms, and generated documents live in Supabase Storage, which is **not covered by the daily database backup** and has **no self-serve restore**. If a file is deleted or storage is lost, there is currently no copy to restore from. |
| What must be **saved so someone else could recover the system**? | A specific short list of accounts, keys, and secrets — see "What you personally must save" below. Right now that knowledge lives mostly in your head and on your PC. |
| What should we **test before continuing development**? | One database **restore drill into a throwaic project**, and one **storage export**. Details at the end. |

**Overall recovery readiness: 6/10.** The database is genuinely protected day-to-day. The gaps are (1) files/storage have no independent backup, (2) the recovery "keys to the kingdom" are not written down anywhere a second person could find them, and (3) no restore has ever been tested.

---

## 1. If the database fails — can we restore it?

**Yes, to a daily snapshot.** Verified live against the Supabase project on 2026-07-12:

- Automatic daily physical backups are **enabled and succeeding** (8 completed backups on hand, newest from this morning).
- Retention is a **rolling ~7 days** (oldest on hand: 2026-07-05).
- **Point-in-time recovery (PITR) is OFF.** You can restore to one of the daily snapshots, but **not** to an arbitrary minute.
- The database is Postgres 17, region us-east-2, currently healthy.

**What this means in practice:**
- **Worst-case data loss (RPO): up to ~24 hours** — whatever changed since the last nightly backup.
- **You must notice a problem within 7 days.** A corruption or bad bulk-edit discovered on day 8 has no backup to go back to.
- **A restore overwrites the whole database.** Supabase restores are project-level — restoring rewinds *everything* to that snapshot. There is no "restore just one table" from these backups.
- **Restores are done through Supabase**, from the dashboard (Project → Database → Backups → Restore) or via a support request — not by you running a command.

**How to restore (high level):**
1. Log in to the Supabase dashboard for the "Superintendent" project.
2. Go to Database → Backups.
3. Pick the most recent good daily backup and choose Restore.
4. Confirm — this replaces the current database. Expect a short outage while it runs.
5. After restore, re-run the anon-access probe (`node scripts/security/anon-probe.mjs`) to confirm the security hardening is still in place, and spot-check row counts.

---

## 2. If the app fails — how do we rebuild it?

**The app is rebuildable from source.** There are two pieces:

**A. The web app (Vercel):**
- Source of truth: the GitHub repo `tysonstechsolutions/greenkeeper-pro`.
- Rebuild = redeploy that repo to Vercel (`npm ci` → `npm run build`, config already in `vercel.json`).
- It will not run without the environment variables (below) set in Vercel.

**B. The Android app (APK) for the shop devices:**
- Built from the same repo via Capacitor (`APK_BUILD_GUIDE.md`, `docs/release.md`).
- **Critical:** the release APK is signed with the keystore `vmgc-release.jks` (+ its passwords in `android/keystore.properties`). **If that keystore is lost, you can never publish an update to the existing installed app** — you'd have to ship a brand-new app and reinstall on every device. This file is deliberately kept out of GitHub, so it exists **only on your PC right now**. Backing it up is the single most important item in this whole review.

**The backend (Supabase edge functions):**
- Also in the repo (`supabase/functions/`), redeployed with the Supabase CLI.
- They need their secrets re-set after any fresh setup (`scripts/set-supabase-secrets.ps1` reads them from your `.env.local`).

**So a full app rebuild needs:** the GitHub repo + the environment variables + the edge-function secrets + the Android keystore. Lose the first and you rebuild from a local copy; lose the last and the mobile app is effectively unrecoverable for updates.

---

## 3. Are our files and documents protected?

**This is the biggest gap.** Supabase Storage currently holds (as of 2026-07-12):

| Bucket | Contents | Objects | ~Size |
|---|---|---|---|
| `photos` | course/equipment/diagnostic photos | 674 | ~680 MB |
| `vendor-files` | vendor quotes (46) + Section 889 forms (23) | 69 | ~18 MB |
| `hole-observations` | legacy hole photos | 3 | ~13 MB |
| `documents` | generated docs (sole source, etc.) | 1 | small |
| `staff-documents` | HR docs (now private) | 0 | — |

**The problem:** the daily database backup covers the **database only** — the tables, not the files. Supabase Storage objects are **not included** in those backups and there is **no self-serve "restore storage" button**. If an object is deleted (by accident, by a bug, or by a bad actor with the shared login) or if storage is lost, there is currently **no independent copy to restore from**.

The database *does* keep the file *paths* (e.g. `staff_documents.storage_path`, `purchase_requests.quote_paths`), so after a DB restore the app would still *point* at the files — but if the files themselves are gone, those links break.

**Recommendation:** periodically export the buckets (see the checklist). At ~700 MB total this is a small, cheap monthly download.

---

## 4. What you personally must save or document

Right now, the ability to recover this system lives mostly on your PC and in your head. If you were unavailable, a competent person handed this list could rebuild everything. **Store these in a password manager and/or a sealed offline copy — never in the GitHub repo.**

### Accounts & access (write down *who owns* and *how to log in*)
- [ ] **Supabase** account + the "Superintendent" project (org `wssywvtwwhwcsuwunbqd`, ref `mbgublyqnyghmvqfooao`). This is the database, storage, and backups.
- [ ] **Vercel** account + the GreenKeeper Pro project (hosts the web app).
- [ ] **GitHub** account + repo `tysonstechsolutions/greenkeeper-pro` (the source code).
- [ ] **Anthropic** account (the AI features' API key).
- [ ] **WeatherAPI.com** account.
- [ ] **Sentry** account (error monitoring), if still used.
- [ ] **Supabase CLI access token** — currently in your Windows Credential Manager as "Supabase CLI:supabase". Used to apply migrations. Save a copy of how to regenerate it.

### Secrets & keys (the actual values — save securely, do **not** print or commit)
- [ ] **The `.env.local` file** from your PC (contains every key the build needs). This is the master secret list.
- [ ] **Supabase:** project URL, anon key, **service-role key**.
- [ ] **`ANTHROPIC_API_KEY`** and the current `ANTHROPIC_MODEL` value.
- [ ] **`NEXT_PUBLIC_WEATHER_API_KEY`** / `WEATHER_API_KEY`.
- [ ] **`PIN_USER_PASSWORD`** (the shared account password behind PIN login).
- [ ] **`NEXT_PUBLIC_APP_EMAIL` / `NEXT_PUBLIC_APP_PASSWORD` / `NEXT_PUBLIC_APP_PIN`** (the shared kiosk login).
- [ ] **`DAILY_BRIEFING_SECRET`** (protects the scheduled daily-briefing job).
- [ ] **VAPID keys** (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) — push notifications.
- [ ] **`FCM_SERVICE_ACCOUNT`** (Android push), if configured.

### The irreplaceable file
- [ ] **`vmgc-release.jks`** (the Android signing keystore) **and** the passwords in `android/keystore.properties`. Back this up to at least two safe places. Losing it means you can never update the installed Android app. It exists only on your PC today.

### Write down the "how" (a one-page runbook for a successor)
- [ ] Which service hosts what (Supabase = data/files, Vercel = web app, GitHub = code).
- [ ] How migrations get applied (Supabase Management API with the CLI token; you are the only one who does this).
- [ ] How the APK is built and signed (`APK_BUILD_GUIDE.md`) and where the keystore lives.
- [ ] That **you are the only deployer** — nobody else currently can push or deploy.

---

## 5. Risks found (prioritized)

| # | Risk | Severity | Why it matters |
|---|---|---|---|
| R1 | **Storage has no independent backup and no self-serve restore.** ~700 MB of photos, quotes, and 889 forms would be unrecoverable if deleted or lost. | **High** | The daily backup does not cover files. A single bad delete (the shared login can delete storage objects) is permanent. |
| R2 | **The Android signing keystore exists only on your PC.** | **High** | Lose it and you can never update the installed shop app — only reinstall a new one everywhere. Not in GitHub by design. |
| R3 | **No restore has ever been tested.** | **High** | "We have backups" is not the same as "we can recover." Untested backups fail more often than people expect. |
| R4 | **Recovery secrets/accounts are not documented anywhere a second person could find them.** | **High** | If you were unavailable, no one could rebuild the system. Bus-factor of one. |
| R5 | **Only 7 days of backup retention, and no point-in-time recovery.** | **Medium** | A problem found on day 8 has no backup. A bad edit at 4pm can only be undone back to last night's snapshot (up to 24h loss). |
| R6 | **Single shared login can delete data and files.** | **Medium** | Combined with R1, any accidental or malicious delete through the app is permanent for storage and up-to-24h-costly for the database. (This is the accepted kiosk model — noted, not a new problem.) |
| R7 | **`SECURITY.md` still claims backups are "tested quarterly" and an audit trail exists.** | **Low** | Neither is true yet. The doc oversells current protection. (Correcting it is a later, separate item — no change made here.) |

---

## 6. What to test before continuing development

Two concrete drills. Neither changes the live app.

**Drill A — Database restore (proves R3 is closed):**
1. In Supabase, create a **new throwaway project** (do **not** restore over production).
2. Restore the most recent daily backup into it (or load a `pg_dump` taken from production).
3. Confirm the tables and row counts match (e.g. 18 active PINs, 17 profiles, the PR and inventory data).
4. Confirm the security hardening survived (run `scripts/security/anon-probe.mjs` against the throwaway project — anon should be denied).
5. Write down how long it took and any surprises. Delete the throwaway project.
> Doing it in a throwaway project means you learn the restore procedure **without any risk to live data**. Only ever restore over production in a real emergency.

**Drill B — Storage export (starts closing R1):**
1. Download the `photos`, `vendor-files`, and `documents` buckets to an external/backup drive (Supabase dashboard or CLI). ~700 MB, quick.
2. Confirm a few files open.
3. Decide a cadence — monthly is reasonable at this size — and put it on the calendar as a recurring obligation.

**Before that, today (5 minutes):** back up the `vmgc-release.jks` keystore and `.env.local` to a password manager or encrypted drive (R2, R4). That single step removes the two scariest single-points-of-failure.

---

## Suggested cadence going forward
- **Monthly:** export storage buckets; confirm the latest daily DB backup shows "completed."
- **Quarterly:** run Drill A (a real restore into a throwaway project).
- **On any secret/account change:** update the saved copy in your password manager.
- **Consider:** turning on Supabase **PITR** and/or longer retention if the operation's data becomes more valuable — it shrinks worst-case data loss from ~24h to minutes.

---

*Documentation only. No application code, database, storage, or configuration was changed to produce this review. Companion docs: `docs/security/live-db-drift-report-2026-07-11.md`, `docs/security/storage-posture-report-2026-07-11.md`, `docs/deployment.md`, `docs/release.md`, `APK_BUILD_GUIDE.md`.*
