/**
 * Seed the program-standards catalog from the FY24 Navy Standards assessment.
 *
 * Source of truth: public/data/standards_plan.json — the scored assessment for
 * Veterans Memorial Golf Course, Naval Station Great Lakes (as_of 2026-05-22).
 * That file stays as the historical baseline record; this script lifts it into
 * the database so the standards can be owned, evaluated, and worked.
 *
 * Idempotent: upserts on `code`, so re-running only refreshes source-derived
 * fields. It deliberately does NOT touch owner_profile_id, is_active, or notes —
 * those are management's, not the source file's.
 *
 * Emits SQL on stdout. Apply via the Management API (see docs) rather than
 * embedding 93 rows in a migration, so re-seeding after an assessment update is
 * a re-run rather than a new migration.
 *
 *   node scripts/seed-program-standards.mjs > /tmp/seed.sql
 */
import { readFileSync } from "node:fs";

const plan = JSON.parse(
  readFileSync(new URL("../public/data/standards_plan.json", import.meta.url), "utf8"),
);

const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "0" : String(Number(v)));
const j = (v) => `'${JSON.stringify(v ?? []).replace(/'/g, "''")}'::jsonb`;

const SOURCE_DOC = `FY24 Navy Golf Program Standards — scored assessment, ${plan.course}, ${plan.installation}, as_of ${plan.as_of}`;

const out = [];
out.push("BEGIN;");

// ── Sections ───────────────────────────────────────────────────────────────
let sortOrder = 0;
for (const [section, name] of Object.entries(plan.section_names)) {
  const weight = plan.section_weights[section] ?? 0;
  out.push(
    `INSERT INTO public.program_standard_sections (section, name, weight, sort_order)
 VALUES (${q(section)}, ${q(name)}, ${n(weight)}, ${sortOrder++})
 ON CONFLICT (section) DO UPDATE SET name = EXCLUDED.name, weight = EXCLUDED.weight, updated_at = now();`,
  );
}

// ── Subsection baselines (earned/possible incl. the Y answers) ─────────────
for (const [subsection, s] of Object.entries(plan.subsection_scores)) {
  const section = subsection.split(".")[0];
  out.push(
    `INSERT INTO public.program_standard_subsections
   (subsection, section, earned, possible, count_y, count_n, count_na, count_blank, baseline_as_of)
 VALUES (${q(subsection)}, ${q(section)}, ${n(s.earned)}, ${n(s.possible)}, ${n(s.y)}, ${n(s.n)}, ${n(s.na)}, ${n(s.blank)}, ${q(plan.as_of)})
 ON CONFLICT (subsection) DO UPDATE SET
   earned = EXCLUDED.earned, possible = EXCLUDED.possible,
   count_y = EXCLUDED.count_y, count_n = EXCLUDED.count_n,
   count_na = EXCLUDED.count_na, count_blank = EXCLUDED.count_blank,
   baseline_as_of = EXCLUDED.baseline_as_of, updated_at = now();`,
  );
}

// ── Standards (the 93 gaps) ────────────────────────────────────────────────
// Only the gaps (answer N/Blank) are in `entries`; the Y answers live on in the
// subsection earned/possible above. A 'Blank' answer was never assessed — that
// is `requires_confirmation`, NOT a failure.
for (const e of plan.entries) {
  const requiresConfirmation = e.answer === "Blank";
  out.push(
    `INSERT INTO public.program_standards
   (code, section, subsection, title, standard_text, expected_condition, current_state,
    possible_score, recommended_actions, dependencies, owner_role, priority, effort,
    timeline, cost_estimate, source_type, source_document, requires_confirmation,
    evaluation_method, effective_date, notes)
 VALUES (
   ${q(e.id)}, ${q(e.section)}, ${q(e.subsection)}, ${q(e.short_title)}, ${q(e.standard_text)},
   ${q(e.target_state)}, ${q(e.current_state)}, ${n(e.possible_score)},
   ${j(e.actions)}, ${j(e.dependencies)}, ${q(e.owner)}, ${q(e.priority)}, ${q(e.effort)},
   ${q(e.timeline)}, ${n(e.cost_value)}, 'navy_program_standard', ${q(SOURCE_DOC)},
   ${requiresConfirmation}, 'manual', ${q(plan.as_of)}, ${q(e.notes || null)}
 )
 ON CONFLICT (code) DO UPDATE SET
   section = EXCLUDED.section, subsection = EXCLUDED.subsection,
   title = EXCLUDED.title, standard_text = EXCLUDED.standard_text,
   expected_condition = EXCLUDED.expected_condition, current_state = EXCLUDED.current_state,
   possible_score = EXCLUDED.possible_score, recommended_actions = EXCLUDED.recommended_actions,
   dependencies = EXCLUDED.dependencies, owner_role = EXCLUDED.owner_role,
   priority = EXCLUDED.priority, effort = EXCLUDED.effort, timeline = EXCLUDED.timeline,
   cost_estimate = EXCLUDED.cost_estimate, source_document = EXCLUDED.source_document,
   requires_confirmation = EXCLUDED.requires_confirmation, updated_at = now();`,
  );
}

// ── Baseline evaluation per standard ───────────────────────────────────────
// Every seeded standard is a KNOWN gap from the assessment, so record that as
// its first evaluation — honestly, and only once (the append-only guard means
// we must not re-insert a baseline on every re-seed).
//   answer 'N'     -> below_standard (or critical for P1)
//   answer 'Blank' -> not_evaluated  (never assessed; NOT a failure)
for (const e of plan.entries) {
  const status =
    e.answer === "Blank"
      ? "not_evaluated"
      : e.priority === "P1"
        ? "critical"
        : "below_standard";
  const detail =
    e.answer === "Blank"
      ? "Not assessed in the FY24 review — requires management confirmation."
      : e.current_state;
  out.push(
    `INSERT INTO public.standard_evaluations
   (standard_id, status, score_earned, score_possible, method, source_kind, source_ref, detail, is_automated, evaluated_at)
 SELECT s.id, ${q(status)}, ${e.answer === "Blank" ? "NULL" : "0"}, ${n(e.possible_score)},
        'manual', 'assessment', ${q("FY24 assessment " + e.id)}, ${q(detail)}, FALSE, ${q(plan.as_of)}::timestamptz
 FROM public.program_standards s
 WHERE s.code = ${q(e.id)}
   AND NOT EXISTS (
     SELECT 1 FROM public.standard_evaluations ev
     WHERE ev.standard_id = s.id AND ev.source_kind = 'assessment'
   );`,
  );
}

out.push("COMMIT;");
process.stdout.write(out.join("\n") + "\n");
