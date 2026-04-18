# Reports → Client-Side Migration

Every `/api/reports/*` route generates a PDF server-side with `jspdf` (which
runs just fine in the browser) and ships it as a `Content-Type:
application/pdf` response. For the Capacitor build there's no Next.js
server — so each report needs to move into the browser. No data leaves
Supabase that isn't already reachable via RLS, and no crypto/signing
happens server-side, so this is a mechanical lift-and-shift.

## The pattern

**Server (old)**

```ts
// src/app/api/reports/<name>/route.ts
export async function GET(req) {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("...").select("...");
  const doc = new jsPDF(...);  // build the PDF
  return new NextResponse(doc.output("arraybuffer"), {
    headers: { "Content-Type": "application/pdf", ... }
  });
}
```

**Client (new)**

```ts
// src/lib/reports/<name>.ts
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/lib/supabase/client";

export async function generate<Name>Report(): Promise<Blob> {
  const supabase = createClient();
  const { data: rows } = await supabase.from("...").select("...");
  const doc = new jsPDF(...);
  // ... exact same jsPDF code as before ...
  return doc.output("blob");
}
```

**Call site (new)**

```ts
// in the page component
import { generate<Name>Report } from "@/lib/reports/<name>";

const handleDownload = async () => {
  const blob = await generate<Name>Report();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vmgc-<name>-report-${new Date().toISOString().slice(0,10)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};
```

## Why this works in Capacitor

- `jspdf` + `jspdf-autotable` are pure-JS, run anywhere. Already in
  `package.json`.
- `URL.createObjectURL` + anchor-click download works in Capacitor webview.
- RLS on all the relevant tables (`order_items`, `tasks`, `equipment`,
  `observations`, etc.) already allows the signed-in user to read their
  organization's data, so moving the queries client-side doesn't widen
  exposure.
- No "shared PDF secret" gates exist on these routes — only auth — so
  there's nothing to preserve on the server side.

## Status

| Route                          | Client helper                                | Call site(s)                                                                         | Status |
|---                             |---                                           |---                                                                                   |---     |
| `/api/reports/order-list-report`| `src/lib/reports/order-list-report.ts`       | `src/app/order-list/page.tsx`                                                        | ✅ ported |
| `/api/reports/equipment-report` | `src/lib/reports/equipment-report.ts`        | `src/app/equipment/page.tsx`, `src/app/equipment/[id]/page-client.tsx`, `src/app/reports/page.tsx` | ✅ ported |
| `/api/reports/observation-report`| `src/lib/reports/observation-report.ts`     | `src/app/course-map/page.tsx`, `src/app/course-map/[hole]/page-client.tsx`, `src/app/course-map/green/[hole]/page-client.tsx`, `src/app/reports/page.tsx` | ✅ ported |
| `/api/reports/parking-lot-report`| `src/lib/reports/parking-lot-report.ts`     | `src/app/reports/page.tsx`                                                           | ✅ ported |
| `/api/reports/clubhouse-report` | `src/lib/reports/clubhouse-report.ts`        | `src/app/reports/page.tsx`                                                           | ✅ ported |
| `/api/reports/monthly-board`    | `src/lib/reports/monthly-board-report.ts`    | `src/app/reports/monthly-board/page.tsx`                                             | ✅ ported |
| `/api/reports/pin-sheet`        | `src/lib/reports/pin-sheet-report.ts`        | `src/app/settings/pin-sheet/page.tsx`                                                | ✅ ported |
| `/api/reports/illinois-rup`     | `src/lib/reports/illinois-rup-report.ts`     | `src/app/compliance/page.tsx`                                                        | ✅ ported |
| `/api/reports/daily-assignments`| `src/lib/reports/daily-assignments-report.ts`| `src/app/dashboard/page.tsx`                                                         | ✅ ported (server route never existed on migration branch — replaced the 404ing fetch) |
| `/api/reports/navcompt-2212`    | `src/lib/reports/navcompt-2212-report.ts`    | `src/app/equipment/[id]/page-client.tsx`                                             | ✅ ported |
| `/api/reports/full-download`    | `src/lib/reports/full-download.ts`           | `src/app/reports/page.tsx`                                                           | ✅ ported (uses jszip) |

## Porting recipe (~10 min per report)

1. Copy `src/app/api/reports/<name>/route.ts` from the main branch (or from
   any `.claude/worktrees/*` snapshot) into `src/lib/reports/<name>.ts`.
2. Delete the Next.js plumbing:
   - Remove `import { NextRequest, NextResponse } ...`
   - Change the `export async function GET/POST(request)` signature to a
     plain exported async function. Take whatever query params the route
     used (e.g. `hole`, `type`, `month`, `year`) as function arguments.
   - Replace `createClient()` from `@/lib/supabase/server` with
     `createClient()` from `@/lib/supabase/client`.
   - Remove auth checks — the client only runs this for a logged-in user,
     and RLS enforces access at the DB. If there's a role check it's
     redundant too since the UI already gates the button.
3. Change the return:
   - `return new NextResponse(doc.output("arraybuffer"), { ... })` →
     `return doc.output("blob") as Blob`.
4. Update the call site. Search for `fetch("/api/reports/<name>` and
   replace the `fetch` + `response.blob()` dance with:
   ```ts
   const blob = await generate<Name>Report(args);
   const url = URL.createObjectURL(blob);
   const a = document.createElement("a");
   a.href = url;
   a.download = filename;
   a.click();
   URL.revokeObjectURL(url);
   ```
5. Delete `src/app/api/reports/<name>/route.ts` (already gone on the
   migration branch — double-check it didn't come back with a `git merge`).
6. `npm run build` should still be green with `output: "export"`.

## Special cases

- **`illinois-rup`** — called via `window.open(`/api/reports/illinois-rup?…`)`
  in `src/app/compliance/page.tsx:94`. Needs the same download-blob
  treatment, not a new-tab open.
- **`navcompt-2212`** — same as any other, just has a custom query param.
- **`full-download`** — returns a zip of many PDFs. Use `jszip` (already
  installed) to build the archive client-side; concatenate the blobs from
  the per-report helpers.
- **`daily-assignments`** — relatively simple query, same pattern.
