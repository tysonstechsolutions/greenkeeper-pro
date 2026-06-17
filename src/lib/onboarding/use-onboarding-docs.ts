"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_DOCUMENTS,
  type OnboardingCategory,
  type OnboardingRole,
} from "./default-documents";

export interface OnboardingDoc {
  id: string;
  slug: string;
  title: string;
  category: OnboardingCategory;
  roles: OnboardingRole[];
  body: string;
  sort_order: number;
}

const TABLE = "onboarding_documents";

function defaultsAsRows() {
  return DEFAULT_DOCUMENTS.map((d) => ({
    slug: d.slug,
    title: d.title,
    category: d.category,
    roles: d.roles,
    body: d.body,
    sort_order: d.sort_order,
  }));
}

export function useOnboardingDocs() {
  const supabase = createClient();
  const [docs, setDocs] = useState<OnboardingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seededRef = useRef(false);

  const fetchDocs = useCallback(async (): Promise<OnboardingDoc[]> => {
    const { data, error: err } = await supabase
      .from(TABLE)
      .select("id, slug, title, category, roles, body, sort_order")
      .order("sort_order", { ascending: true });
    if (err) throw err;
    return (data ?? []) as OnboardingDoc[];
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let rows = await fetchDocs();
      // Seed any authored defaults missing from the table — first run, or new
      // built-in docs added to default-documents.ts since. Idempotent upsert by
      // slug; runs once per mount so an in-session delete of a built-in still
      // sticks for the session (it re-seeds on the next visit).
      if (!seededRef.current) {
        seededRef.current = true;
        const have = new Set(rows.map((r) => r.slug));
        const missing = defaultsAsRows().filter((r) => !have.has(r.slug));
        if (missing.length > 0) {
          const { error: seedErr } = await supabase
            .from(TABLE)
            .upsert(missing, { onConflict: "slug" });
          if (seedErr) throw seedErr;
          rows = await fetchDocs();
        }
      }
      setDocs(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [fetchDocs, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const saveDoc = useCallback(
    async (
      id: string,
      patch: Partial<Pick<OnboardingDoc, "title" | "category" | "roles" | "body">>,
    ) => {
      const { error: err } = await supabase
        .from(TABLE)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (err) throw err;
      await load();
    },
    [supabase, load],
  );

  const createDoc = useCallback(
    async (input: {
      title: string;
      category: OnboardingCategory;
      roles: OnboardingRole[];
      body: string;
    }) => {
      const maxOrder = docs.reduce((m, d) => Math.max(m, d.sort_order), 0);
      const slug = `custom-${Date.now()}`;
      const { data, error: err } = await supabase
        .from(TABLE)
        .insert({
          slug,
          title: input.title,
          category: input.category,
          roles: input.roles,
          body: input.body,
          sort_order: maxOrder + 1,
        })
        .select("id")
        .single();
      if (err) throw err;
      await load();
      return data?.id as string | undefined;
    },
    [supabase, docs, load],
  );

  const deleteDoc = useCallback(
    async (id: string) => {
      const { error: err } = await supabase.from(TABLE).delete().eq("id", id);
      if (err) throw err;
      await load();
    },
    [supabase, load],
  );

  const restoreDefaults = useCallback(async () => {
    const { error: err } = await supabase
      .from(TABLE)
      .upsert(defaultsAsRows(), { onConflict: "slug" });
    if (err) throw err;
    await load();
  }, [supabase, load]);

  return {
    docs,
    loading,
    error,
    reload: load,
    saveDoc,
    createDoc,
    deleteDoc,
    restoreDefaults,
  };
}
