"use client";

/**
 * useAiGenerate — the single path every AI text feature runs through.
 *
 *   const ai = useAiGenerate("work_order");
 *   const res = await ai.run({ input, inputMeta, callAi });   // library-first
 *   const res = await ai.regenerate({ input, inputMeta, callAi }); // force paid
 *   await ai.saveFinal({ input, inputMeta, text, servedText });    // learn edits
 *
 * run():        library match (free) → else paid AI (saved) → else fallback.
 * regenerate(): always pays for a fresh AI answer (the "I don't like it" button).
 * saveFinal():  stores the user's final/edited text so the library learns.
 *
 * If the paid AI throws (model retired, outage, timeout) both run() and
 * regenerate() degrade gracefully: a lower-threshold library match, then a
 * built-in template — so the user is never blocked.
 */
import { useCallback, useState } from "react";
import {
  matchLibrary,
  saveLibraryEntry,
  bumpLibraryUse,
} from "./library";
import { AI_TEMPLATES, type TemplateFn } from "./templates";

export type AiSource = "library" | "ai" | "fallback";

export interface AiResult {
  text: string;
  meta: Record<string, unknown>;
  source: AiSource;
  /** Library row id when reused; the saved row id when freshly generated. */
  entryId: string | null;
  /** True when the AI failed and we served a library/template fallback. */
  degraded: boolean;
}

export interface AiCallResult {
  text: string;
  meta?: Record<string, unknown>;
  model?: string;
}

export interface RunArgs {
  /** Salient request text used for matching + storage. */
  input: string;
  inputMeta?: Record<string, unknown>;
  /** The existing paid-AI call for this feature. */
  callAi: () => Promise<AiCallResult>;
  /** Reuse threshold (0–1 trigram similarity). Default 0.30. */
  threshold?: number;
  /** Degraded threshold used only when the AI is down. Default 0.10. */
  fallbackThreshold?: number;
  /** Override the built-in offline template for this feature. */
  template?: TemplateFn;
}

async function payAndStore(feature: string, args: RunArgs): Promise<AiResult> {
  try {
    const ai = await args.callAi();
    const entryId = await saveLibraryEntry({
      feature,
      input: args.input,
      inputMeta: args.inputMeta ?? {},
      output: ai.text,
      outputMeta: ai.meta ?? {},
      source: "ai",
      model: ai.model ?? null,
    });
    return { text: ai.text, meta: ai.meta ?? {}, source: "ai", entryId, degraded: false };
  } catch (aiErr) {
    // AI is unreachable — never block the user.
    const fb = await matchLibrary(feature, args.input, args.fallbackThreshold ?? 0.1);
    if (fb) {
      await bumpLibraryUse(fb.id);
      return {
        text: fb.output_text,
        meta: fb.output_meta ?? {},
        source: "fallback",
        entryId: fb.id,
        degraded: true,
      };
    }
    const tmpl = args.template ?? AI_TEMPLATES[feature];
    if (tmpl) {
      const t = tmpl(args.inputMeta ?? {}, args.input);
      return { text: t.text, meta: t.meta ?? {}, source: "fallback", entryId: null, degraded: true };
    }
    throw aiErr;
  }
}

export function useAiGenerate(feature: string) {
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<AiSource | null>(null);

  /** Library-first. Only pays for the AI when there's no close past answer. */
  const run = useCallback(
    async (args: RunArgs): Promise<AiResult> => {
      setLoading(true);
      try {
        const match = await matchLibrary(feature, args.input, args.threshold ?? 0.3);
        if (match) {
          await bumpLibraryUse(match.id);
          const res: AiResult = {
            text: match.output_text,
            meta: match.output_meta ?? {},
            source: "library",
            entryId: match.id,
            degraded: false,
          };
          setSource(res.source);
          return res;
        }
        const res = await payAndStore(feature, args);
        setSource(res.source);
        return res;
      } finally {
        setLoading(false);
      }
    },
    [feature],
  );

  /** Always generate a fresh paid answer (the regenerate / "I don't like it" path). */
  const regenerate = useCallback(
    async (args: RunArgs): Promise<AiResult> => {
      setLoading(true);
      try {
        const res = await payAndStore(feature, args);
        setSource(res.source);
        return res;
      } finally {
        setLoading(false);
      }
    },
    [feature],
  );

  /** Persist the user's final/edited text so the library learns how they want it. */
  const saveFinal = useCallback(
    async (args: {
      input: string;
      inputMeta?: Record<string, unknown>;
      text: string;
      meta?: Record<string, unknown>;
      /** The text we served; skip storing if unchanged. */
      servedText?: string;
    }): Promise<void> => {
      if (args.servedText !== undefined && args.text.trim() === args.servedText.trim()) return;
      await saveLibraryEntry({
        feature,
        input: args.input,
        inputMeta: args.inputMeta ?? {},
        output: args.text,
        outputMeta: args.meta ?? {},
        source: "edited",
        dedupe: true,
      });
    },
    [feature],
  );

  return { run, regenerate, saveFinal, loading, source };
}
