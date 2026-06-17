/**
 * AI learning library — data layer.
 *
 * Every AI text generation in the app is routed through this library first:
 * we look for a close past answer (free, via Postgres pg_trgm similarity) and
 * only fall back to a paid AI call when there's no good match. Accepted/edited
 * outputs are saved back so the library gets better — and cheaper — over time.
 *
 * All functions here are best-effort and never throw on the hot path: if the
 * library is unreachable we return null so the caller falls through to the AI.
 */
import { createClient } from "@/lib/supabase/client";

export type AiLibrarySource = "ai" | "edited" | "manual";

export interface LibraryMatch {
  id: string;
  output_text: string;
  output_meta: Record<string, unknown>;
  source: AiLibrarySource;
  score: number;
}

export interface LibraryEntry {
  id: string;
  feature: string;
  input_text: string;
  input_meta: Record<string, unknown>;
  output_text: string;
  output_meta: Record<string, unknown>;
  source: AiLibrarySource;
  model: string | null;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE = "ai_library";

/** Best library answer for a feature, by trigram similarity. null = no match. */
export async function matchLibrary(
  feature: string,
  input: string,
  threshold = 0.3,
): Promise<LibraryMatch | null> {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  const supabase = createClient();
  try {
    const { data, error } = await supabase.rpc("match_ai_library", {
      p_feature: feature,
      p_input: trimmed,
      p_threshold: threshold,
    });
    if (error) {
      console.warn("[ai-library] match failed:", error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      id: row.id,
      output_text: row.output_text,
      output_meta: row.output_meta ?? {},
      source: row.source,
      score: row.score,
    };
  } catch (e) {
    console.warn("[ai-library] match error:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Save a generated/edited answer. Returns the new row id (or existing id when deduped). */
export async function saveLibraryEntry(args: {
  feature: string;
  input: string;
  inputMeta?: Record<string, unknown>;
  output: string;
  outputMeta?: Record<string, unknown>;
  source: AiLibrarySource;
  model?: string | null;
  /** Skip insert if an identical (feature, input, output) row already exists. */
  dedupe?: boolean;
}): Promise<string | null> {
  const output = (args.output ?? "").trim();
  const input = (args.input ?? "").trim();
  if (!output || !input) return null;
  const supabase = createClient();
  try {
    if (args.dedupe) {
      const { data: existing } = await supabase
        .from(TABLE)
        .select("id")
        .eq("feature", args.feature)
        .eq("input_text", input)
        .eq("output_text", output)
        .limit(1);
      if (existing && existing.length > 0) return existing[0].id as string;
    }
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        feature: args.feature,
        input_text: input,
        input_meta: args.inputMeta ?? {},
        output_text: output,
        output_meta: args.outputMeta ?? {},
        source: args.source,
        model: args.model ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[ai-library] save failed:", error.message);
      return null;
    }
    return (data?.id as string) ?? null;
  } catch (e) {
    console.warn("[ai-library] save error:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Increment usage stats when a library answer is reused (best-effort). */
export async function bumpLibraryUse(id: string): Promise<void> {
  if (!id) return;
  const supabase = createClient();
  try {
    await supabase.rpc("bump_ai_library_use", { p_id: id });
  } catch {
    /* usage stats are non-critical */
  }
}

// ── Management-page helpers (these may throw; callers handle errors) ─────────

export async function listLibrary(): Promise<LibraryEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LibraryEntry[];
}

export async function updateLibraryEntry(
  id: string,
  patch: Partial<Pick<LibraryEntry, "output_text" | "output_meta" | "input_text">>,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from(TABLE)
    .update({ ...patch, source: "edited" })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteLibraryEntry(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
