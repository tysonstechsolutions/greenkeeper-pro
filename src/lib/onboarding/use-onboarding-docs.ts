"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { directRpc } from "@/lib/supabase/rest";
import { useAuth } from "@/lib/hooks/useAuth";
import { ADMIN_ROLES } from "@/components/auth/role-guard";
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
  const { profile } = useAuth();
  const canManage = !!profile && ADMIN_ROLES.includes(profile.role);
  const [docs, setDocs] = useState<OnboardingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seededRef = useRef(false);

  const fetchDocs = useCallback(async (): Promise<OnboardingDoc[]> => {
    const { data, error: err } = await supabase
      .from(TABLE)
      .select("id, slug, title, category, roles, body, sort_order")
      .eq("is_active", true)
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
      if (!seededRef.current && canManage) {
        seededRef.current = true;
        const have = new Set(rows.map((r) => r.slug));
        const missing = defaultsAsRows().filter((r) => !have.has(r.slug));
        if (missing.length > 0) {
          await directRpc("sync_onboarding_documents", {
            p_documents: missing,
            p_replace_existing: false,
            p_reason: "Missing authored onboarding defaults synchronized",
          }, "onboarding.defaults.sync");
          rows = await fetchDocs();
        }
      }
      setDocs(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [fetchDocs, canManage]);

  useEffect(() => {
    load();
  }, [load]);

  const saveDoc = useCallback(
    async (
      id: string,
      patch: Partial<Pick<OnboardingDoc, "title" | "category" | "roles" | "body">>,
    ) => {
      await directRpc("save_onboarding_document", {
        p_document_id: id,
        p_values: patch,
        p_reason: "Onboarding document updated",
      }, "onboarding.document.update");
      await load();
    },
    [load],
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
      const data = await directRpc<{ id: string }>("save_onboarding_document", {
        p_document_id: null,
        p_values: {
          slug,
          title: input.title,
          category: input.category,
          roles: input.roles,
          body: input.body,
          sort_order: maxOrder + 1,
        },
        p_reason: "Custom onboarding document created",
      }, "onboarding.document.create");
      await load();
      return data?.id;
    },
    [docs, load],
  );

  const deleteDoc = useCallback(
    async (id: string) => {
      const reason = window.prompt("Why is this onboarding document being retired?")?.trim();
      if (!reason) return;
      await directRpc("retire_onboarding_document", {
        p_document_id: id,
        p_reason: reason,
      }, "onboarding.document.retire");
      await load();
    },
    [load],
  );

  const restoreDefaults = useCallback(async () => {
    await directRpc("sync_onboarding_documents", {
      p_documents: defaultsAsRows(),
      p_replace_existing: true,
      p_reason: "Authored onboarding defaults restored",
    }, "onboarding.defaults.restore");
    await load();
  }, [load]);

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
