# Storage Posture Report — 2026-07-11

**Project:** Supabase `mbgublyqnyghmvqfooao` · **Method:** read-only introspection of `storage.buckets`, `storage.objects` (aggregates only — no filenames or URLs were extracted), and `pg_policies` for `storage.objects`; plus a full sweep of application storage call sites. **No changes were made.**

## 1. Live buckets

| Bucket | Public? | Objects | Size | Purpose (from code) |
|---|---|---|---|---|
| `photos` | **PUBLIC** | 674 | ~680 MB | Course/task/equipment/diagnostic photos; also green & hole observation photos (hooks upload here, not to the dedicated buckets) |
| `documents` | **PUBLIC** | 1 | ~120 KB | Generated documents store (SOW, sole-source, onboarding packets) — currently one sole-source PDF |
| `staff-documents` | **PUBLIC** | **0** | — | Employee/HR document uploads (`src/lib/staff/use-employee.ts`) |
| `vendor-files` | private | 69 | ~18 MB | Vendor quotes (46) + Section 889 forms (23) |
| `hole-observations` | private | 3 | ~13 MB | Vestigial — current uploads go to `photos` |
| `green-observations` | private | 0 | — | Vestigial — current uploads go to `photos` |
| `drone-flights` | private | 0 | — | Dormant (drone routes removed from nav) |

Top-level folder aggregates only (no object names listed): `photos` = shared-account UID folder (604), `equipment/` (52), `diagnostics/` (12), one other UID folder (6); `vendor-files` = `quotes/` (46), `889-forms/` (23); `documents` = `sole_source/` (1).

## 2. The key question: are staff/personnel files in a public bucket?

**Today: no files exist (0 objects) — but the code path guarantees they will be public the first time the feature is used.**

- The bucket itself is `public: true`, created that way **by migration** (`20260617140000_staff_system.sql:76`), with a `to public` SELECT policy (`staff_docs_select`, line 88-89).
- The upload path `src/lib/staff/use-employee.ts:145-146` uploads to `staff-documents` and stores `publicStorageUrl(BUCKET, path)` — an **unsigned, non-expiring public CDN URL** — in the `staff_documents` table.
- So the exposure is **latent, not realized**: the moment Tyson uploads an employee's food-handler card, ID, or any HR document, it becomes world-readable to anyone with the URL, and the URL is stored in a table readable by the shared account.

This is the single most important storage finding: it can be fixed **before** any sensitive file ever lands in it.

Same pattern, already realized at tiny scale: `documents` bucket (generated procurement documents) is public with a `to public` SELECT policy (`20260617170000_created_documents.sql`) and currently holds 1 sole-source justification PDF. The `/documents` page's re-download links depend on public URLs (`createdDocUrl()` → `publicStorageUrl`, `saved-documents.ts:131-133`), so flipping this bucket private requires a small read-path code change.

Positive: **`vendor-files` (quotes + 889 forms) is correctly private** and read via authenticated `storage.download()` (`pr-audit/download.ts:124`), proving the private-bucket pattern already works in this codebase.

## 3. storage.objects policies (live)

27 policies. Notable:

| Policy | Effect | Assessment |
|---|---|---|
| `staff_docs_select` — SELECT `to public` on `staff-documents` | Anon/object-API read of staff docs | ❌ Remove with bucket privatization |
| `documents_select` — SELECT `to public` on `documents` | Anon read of generated docs | ❌ Tied to management decision (§ handoff) |
| `Public can read photos` — SELECT `to anon` on `photos` | Photos world-readable | 🟡 By design (CDN course photos) — accepted kiosk behavior, but note staff/task photos ride in the same bucket |
| `Anyone can view green/hole observation photos` — SELECT `to public` on the two private observation buckets | anon can read via object API despite bucket privacy | 🟡 Vestigial (3 legacy objects); harmless now, remove in cleanup |
| `photos_*_own_folder` (INSERT/UPDATE/DELETE scoped to uploader's UID folder) | Write hygiene | ✅ but collapses to one folder under the shared account |
| `vendor_files_*_management` (write restricted to manager roles via profiles lookup) | ✅ Correct restrictive pattern | keep |
| Overlapping legacy photo policies (`Authenticated users can …` ×4 + `storage_authenticated_*` ×4) | Redundant permissive stacks on the same buckets | 🟡 Consolidation candidate, not urgent |

## 4. Every `getPublicUrl()` / public-URL call site (as requested)

**Helper definitions** (root of the pattern):
1. `src/lib/supabase/storage.ts:294-299` — `getPublicUrl()` (hardcoded `photos` bucket); used by `uploadPhoto`/`uploadPhotoBlob` (lines 113, 149, 245)
2. `src/lib/supabase/rest.ts:673-677` — `publicStorageUrl(bucket, path)` (string-builds `/storage/v1/object/public/<bucket>/<path>`)

**Consumers:**

| # | Call site | Bucket | Status |
|---|---|---|---|
| 3 | `src/lib/hooks/usePhotos.ts:488,496` | photos | works (public by design) |
| 4 | `src/app/photos/timeline/page.tsx:130-131` | photos | works |
| 5 | `src/app/parking-lot/page.tsx:211` | photos | works |
| 6 | `src/app/clubhouse/page.tsx:152` | photos | works |
| 7 | `src/lib/hooks/useGreenObservations.ts:250` | photos | works |
| 8 | `src/lib/hooks/useHoleObservations.ts:253` | photos | works |
| 9 | `src/lib/utils/offline-queue.ts:239,495` | photos | works |
| 10 | `src/lib/hooks/useKnowledge.ts:805` | **`attachments` — bucket does not exist** | **broken** (upload at :798 fails first; feature silently no-ops) |
| 11 | `src/lib/staff/use-employee.ts:146` (via `publicStorageUrl`) | **staff-documents (public)** | works — **this is the latent HR exposure** |
| 12 | `src/lib/documents/saved-documents.ts:131-133` (`createdDocUrl` via `publicStorageUrl`) | **documents (public)** | works — load-bearing for `/documents` re-download links |
| 13 | `src/components/features/map/course-map-component.tsx:383` | hardcoded public URL to **`drone-flights` (private!)** | **broken-if-used** — public URL endpoint refuses private buckets; feature dormant (0 objects, routes removed) |

**Signed URLs:** `createSignedUrl` is used **nowhere** in the codebase. The `SECURITY.md` implication of expiring/signed access is not implemented for any bucket; private buckets are read via authenticated `.download()` only (vendor-files).

## 5. Assessment summary

| Finding | Severity | Why |
|---|---|---|
| `staff-documents` public + code stores public URLs | **High (latent)** | HR/PII files will be world-readable on first use; zero objects today makes this the cheapest possible time to fix |
| `documents` public (generated SOW/sole-source/onboarding) | Medium | Procurement-sensitive docs at unsigned permanent URLs; 1 object today; fix needs a small read-path change |
| `photos` public | Accepted (kiosk design) | Course photos intended for fast CDN display; note staff-related photos share the bucket |
| Observation-bucket anon policies, redundant photo policy stacks, dead `drone-flights` URL builder, missing `attachments` bucket | Low | Cleanup items; `attachments` is a functional bug not an exposure |
| No signed-URL usage anywhere | Structural | The privatization fixes must introduce `.download()` or `createSignedUrl` patterns (vendor-files shows the working template) |

---
*Read-only Phase 0A deliverable. No buckets, policies, objects, or code were modified. No object names or URLs are reproduced in this report.*
