# Onboarding & SOP library — design (2026-06-17)

## Goal
A GM-side page to assemble new-hire packets for the four staff types (maintenance, food & beverage, pro shop, rec aides). Author the document content now; let the GM edit it in-app; download a selected set as one combined PDF.

## Decisions (from brainstorm with owner)
- **Author now + editable in-app** (DB-backed, seeded from authored defaults).
- **Download = one combined PDF** (cover page + selected docs, page-broken).
- **Role-aware workflow:** pick a role → auto-select that role's docs (its own + shared all-staff) → adjust → download.

## Architecture
- **Content:** `src/lib/onboarding/default-documents.ts` — 24 authored docs (Markdown bodies), each with `slug`, `title`, `category`, `roles[]`, `sort_order`. Canonical "factory" content.
- **Storage:** Supabase table `onboarding_documents` (migration `20260617120000_…`; RLS `for all to authenticated`). Seeded on first load via idempotent upsert by `slug`; edits persist to the table. "Restore defaults" re-upserts.
- **Data layer:** `src/lib/onboarding/use-onboarding-docs.ts` — load / seed-if-empty / save / create / delete / restore.
- **PDF:** `src/lib/onboarding/build-packet-pdf.ts` — jsPDF; cover page + per-doc pages; small Markdown renderer (headings, bullets, `- [ ]`, numbered, tables, `---`, blockquotes), footer page numbers.
- **Page:** `src/app/onboarding/page.tsx` — role chips (auto-select), type filter, search, checkbox list, preview (react-markdown) + edit/new/delete overlays, sticky "Download packet (PDF)" bar.
- **Entry points:** GM dashboard toolbox + GM sidebar + page-title map.

## Categories / roles
Categories: training, sop, policy, opening-closing, cart, worksheet, info.
Roles: all (shared), maintenance, fnb, pro-shop, rec-aide.

## Status — IMPLEMENTED & VERIFIED 2026-06-17
typecheck + lint + production build pass (117 routes incl. /onboarding). Live: page seeds 24 docs (DB confirmed), Maintenance chip auto-selects 10 docs, combined PDF generates (~65 KB valid application/pdf), and in-app title edit persists to the DB.

## Possible follow-ups
- Per-employee "issued packet" tracking / signatures.
- Rich-text editor instead of Markdown textarea.
- Add F&B/maintenance-specific cart notes as separate docs if needed.
