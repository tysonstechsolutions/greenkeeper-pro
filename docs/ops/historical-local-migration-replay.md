# Historical local migration replay

## Purpose and safety boundary

The retained migration directory represents the production migration ledger; it cannot be replayed from an empty database without historical context that was either archived outside the migration directory or never committed as DDL. This document describes the **local-only** recovery path for fresh development databases.

The recovery path does not alter `supabase/migrations`, does not add a row to a Supabase migration ledger, and does not connect to a hosted project. It creates an unlinked fixture below the operating-system temporary directory, with local project id `greenkeeper-pro-phase1a-matrix`, then runs Docker-backed Supabase against `127.0.0.1` only. It must never be used as a production migration or against an already linked cloud project.

## Root cause and evidence

| Dependency | Evidence | Why a fresh replay failed | Local recovery |
| --- | --- | --- | --- |
| `green_observations` | `45d181e` added `20260407_green_observations.sql`; `f47e2c9` added dependent `20260407_green_area_path.sql`. | Date-only filenames collide, and lexical ordering can apply the `ALTER TABLE` before the table creation. | Give the source files deterministic temporary fixture versions in Git-intended order. The compatibility scenario pre-creates the table and records the omitted creation file in its manifest. |
| `equipment_checkouts` | Exact creation SQL survives in `2d89ac6^:docs/archived-sql/crew-features-tables.sql`; `2d89ac6` removed that archive while consolidating SQL. | Retained migrations refer to the relation but its creation migration was not retained. | Restore the evidenced table shape in the local bootstrap before the retained chain. |
| `equipment_inspections` | No reachable Git revision contains a `CREATE TABLE public.equipment_inspections`. Its column contract is evidenced by `src/types/database.ts`, active inspection writes, and `20260408_fix_equipment_inspections_rls.sql`. | The first retained inspection migration alters/policies a table that an empty database lacks. | Create only the proven application contract locally. Reject an existing table with missing or mismatched required columns rather than guessing a repair. |
| Observation planning tables | Exact DDL survives in `2d89ac6^:docs/archived-sql/observations-tables.sql`, originally archived by `3fe7b4d`. | Later migrations alter these tables, but their original creation SQL was removed from migration history. | Restore the archived DDL locally; guards are limited to existing policy and trigger objects. |
| `irrigation_zones` | `001_initial_schema.sql` creates the earlier shape; `20260415_add_irrigation.sql` uses `CREATE TABLE IF NOT EXISTS` for a different shape, then indexes and seeds columns absent from the earlier table. | `IF NOT EXISTS` kept the old table, so later statements addressed missing columns. | Add only the later migration's required columns and compatible `zone_type` vocabulary locally; a trigger mirrors a supplied `name` into old required `zone_name` only on inserts. Existing rows are never rewritten. |
| `equipment.photos` | `20260508_consolidate_photos_to_condition.sql` reads it as a nullable text-array gallery field. | The chain references a column whose creation migration is absent. | Add the nullable, evidenced column locally without data. |
| legacy `vmgc_*` relations | The Phase 0B/B1 security migration and its probe prove only an `id` column and RLS need; repository search finds no canonical DDL or application use. | B1 locks tables that exist only in the live historical database. | Create empty id-only local RLS shells. This is deliberately not a reconstruction of unknown production data. |
| historical source order | The 20260608 PR audit chain and 20260701 My Day chain contain same-day dependent source files. | Date-only filenames do not encode the required dependency order. | Apply stable temporary fixture ordering matching the commits that introduced the dependent migrations. |
| historical identity seeds | `20260419_add_pin_codes.sql` and `20260419_seed_sops_knowledge_articles.sql` insert unavailable production profile UUIDs. | A clean local auth database cannot satisfy those foreign keys honestly. | Omit only those content/identity seed blocks locally, with the omission recorded in the manifest. No employee, PIN, or content record is invented. |

The recovery source is deliberately outside `supabase/migrations`:

- `supabase/local-bootstrap/20260406000001_historical_foundations.sql`
- `scripts/prepare-phase1a-local-fixture.mjs`

The preparer copies source migrations verbatim except for the two documented identity/content omissions and gives short historical filenames unique temporary 14-digit versions. It records every copy, reorder, bootstrap, and omission in `phase1a-fixture-manifest.json` beside the fixture.

The repository also contains two incompatible historical inspection writers: the legacy equipment detail flow sends `condition_status`, `inspector_id`, and `status`, while the generated interface and Phase B workflow use `inspected_by` and `overall_status`. No reachable migration or Git revision proves the legacy table shape, and the generated `Database.public.Tables` map omits both live-only tables. The bootstrap therefore follows the evidenced Phase B/interface contract and does not guess legacy columns or silently rewrite existing tables; the legacy writer remains a separate application follow-up.

## Creating a clean local database

Use Node 20 or newer, Docker, and the local Supabase CLI. Ensure environment variables do not contain a remote database URL or production project ref.

```powershell
node scripts/prepare-phase1a-local-fixture.mjs create `
  --mode all `
  --out-dir C:\tmp\greenkeeper-fresh-replay

Set-Location C:\tmp\greenkeeper-fresh-replay\supabase
supabase start --ignore-health-check
supabase db reset --local
```

The final command must report application through `20260713230000_daily_operations_phase1a_corrective.sql`. The fixture is ephemeral: make a new temporary directory for every clean replay. Do not copy its generated migration filenames back into `supabase/migrations`.

## Regression matrix

Run the complete local-only matrix with:

```powershell
npm run test:historical-replay
```

For terminal environments with a short command window, each independent case can be run separately:

```powershell
node scripts/test-historical-local-replay.mjs --scenario empty-1
node scripts/test-historical-local-replay.mjs --scenario empty-2
node scripts/test-historical-local-replay.mjs --scenario both
node scripts/test-historical-local-replay.mjs --scenario green-and-inspection
node scripts/test-historical-local-replay.mjs --scenario checkout
node scripts/test-historical-local-replay.mjs --scenario inspection
node scripts/test-historical-local-replay.mjs --scenario partial
```

The matrix verifies two complete empty replays through the Phase 1A corrective migration, data preservation when both equipment tables already exist, preservation when compatible `green_observations` and `equipment_inspections` tables already contain rows, each one-table case, and safe refusal of a partial incompatible inspection table. The compatibility fixtures use UUID-only rows and omit identity foreign keys; they do not create auth users, employees, assignments, operational durations, or policy data because the historical identity contract is not fully recoverable from the repository.

## Rules for future migrations

1. Give every migration a unique 14-digit version; do not rely on date-only filenames where order matters.
2. Commit foundation DDL in the migration directory with the feature that first relies on it. Do not leave it only in archived SQL or a live database.
3. Keep data seeds separate from schema changes. A seed that depends on a real production identity must not be required for a clean schema replay.
4. Test `supabase db reset --local` from an empty database before merging a migration-chain change.
5. If a legacy live-only table has no canonical DDL, document the evidence boundary and use an explicitly local fixture shell rather than inventing a production model or marking a migration as applied.
