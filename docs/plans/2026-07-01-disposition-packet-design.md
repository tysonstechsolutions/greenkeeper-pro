# Disposition Packet Builder + DD-form fixes

**Date:** 2026-07-01
**Surface:** DD forms (`/dd-forms/*`, new `/dd-forms/packet`), Assets

Turn one-asset disposition paperwork into a multi-item **packet**, plus several
DD-form fixes. Builds on [[dd-forms-feature]].

## Requirements (from Tyson)
1. Box 11b (typed name) defaults to **"Bruce Tyson K"**.
2. Box 9 disposition (Lost/Damaged/Destroyed + category) selectable **per item**
   (the filler already has the dropdowns; the one-click flow hardcoded destroyed).
3. Item-description text **bleeds past its cell** — must wrap to a second line
   within the cell instead of shrinking to a sliver and overflowing.
4. Reasons more detailed than "Beyond economical repair":
   - Lost → "cannot be located on the grounds; no record of it under my management."
   - Damaged/Destroyed → **AI drafts from the asset photo** (describe the damage).
5. **Packet:** one DD-2212 (many items, split across sheets past 24) + **one
   DD-200 per item**, each DD-200 **followed by that item's photos**, merged into
   one download. Mixed dispositions in the same packet.

## Pieces

### A. Shared fixes (also help the existing single-form filler)
- `DD200_INITIATOR_NAME = "Bruce Tyson K"` (constants.ts) → default `typedName`
  in the DD-200 filler + from-asset + packet.
- `drawWrapped` in form-overlay.ts: wrap to ≤2 lines within `maxW`, line 1 on the
  baseline, line 2 below (baseline − lineHeight), shrink only if 2 lines still
  overflow. Apply to the 2212 `description` column (row pitch 23.85pt fits 2 small
  lines) and the DD-200 `itemDescription`. Unit-tested.
- Deterministic reason defaults per circumstance (reasons.ts, tested).

### B. AI damage drafting
- New edge fn `dd-forms-ai`, action `describe_damage`: {imageBase64, mediaType,
  item, circumstance} → concise 1–2 sentence reason (Claude sonnet-4-6 vision,
  golf-course-framed, graceful fallback to the deterministic default). Registered
  in callApi EDGE_ROUTES + SLOW_DIRECT_ROUTES. **DEPLOY: `supabase functions
  deploy dd-forms-ai`.**
- Client `draftDamageReason(asset, circumstance)` — fetch the asset photo → base64
  → call; falls back to the deterministic default on any error.

### C. Packet assembly — `src/lib/dd-forms/packet.ts`
- `PacketItem = { asset, circumstance, category, reason }`.
- `buildDispositionPacket(items, opts)` → merged Blob:
  1. Chunk items by 24 → a 2212 sheet per chunk (Sheet i of N), all items.
  2. Per item: its DD-200, then its photo pages (fetch each asset photo, embed
     jpg/png, one per page, captioned with item + asset #; skip failures).
  3. Merge via pdf-lib `copyPages` into one document.
- Reuses `generateDd2212Report` / `generateDd200Report` (blobs) + a photo-page
  embedder. Save to Documents + `saveBlobToDevice`.

### D. Builder page — `/dd-forms/packet`
- Lists `needs_disposed` fy26_assets with checkboxes. Per selected item: disposition
  dropdown (circumstance + category), editable reason (pre-filled default), photo
  thumbnails, "Draft from photo (AI)" (per item + "Draft all").
- Header: initiator name (Bruce Tyson K), activity/date defaults; site comes from
  each asset. "Generate packet" → buildDispositionPacket → save + download.
- Added to the Paperwork hub; linked from the /assets/view disposition card.

## Out of scope (YAGNI)
- Editing blocks 12–14 / page 2 (signed up the chain, still blank).
- Non-disposed assets in the packet builder (only `needs_disposed`).

## Build order (each verified: vitest + tsc + build, then commit)
1. A — shared fixes + wrapping/reason tests.
2. C — packet assembly.
3. D — builder page + wiring.
4. B — AI vision endpoint + draft buttons (deploy-gated, graceful fallback).
