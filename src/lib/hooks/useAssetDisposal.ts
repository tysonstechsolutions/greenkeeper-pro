"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AssetDisposal, DisposalStatus } from "@/types/database";

const SESSION_EXPIRED_MSG =
  "Your session expired. Please sign in again with your PIN.";

export function useAssetDisposal() {
  const [disposal, setDisposal] = useState<AssetDisposal | null>(null);
  const [allDisposals, setAllDisposals] = useState<AssetDisposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const requireSession = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth:session-expired"));
      }
      return { supabase, session: null as null };
    }
    return { supabase, session };
  };

  const fetchDisposal = useCallback(async (equipmentId: string) => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase.from("asset_disposals")
        .select("*")
        .eq("equipment_id", equipmentId)
        .neq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fetchError) throw fetchError;
      setDisposal(data || null);
      return data || null;
    } catch (err) {
      console.error("Error fetching asset disposal:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAllDisposals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase.from("asset_disposals")
        .select("*")
        .neq("status", "completed")
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      setAllDisposals(data || []);
      return data || [];
    } catch (err) {
      console.error("Error fetching all disposals:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createDisposal = useCallback(async (
    equipmentId: string,
    reason: string
  ): Promise<{ data: AssetDisposal | null; error: string | null }> => {
    setError(null);
    try {
      const { supabase, session } = await requireSession();
      if (!session) {
        setError(SESSION_EXPIRED_MSG);
        return { data: null, error: SESSION_EXPIRED_MSG };
      }

      const { data, error: insertError } = await supabase.from("asset_disposals")
        .insert({
          equipment_id: equipmentId,
          reason,
          status: "pending_request" as DisposalStatus,
          requested_by: session.user.id,
          requested_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error("Supabase insert error:", insertError);
        const msg = insertError.message || "Database error while creating disposal";
        setError(msg);
        return { data: null, error: msg };
      }

      setDisposal(data);
      setAllDisposals((prev) => [data, ...prev]);
      return { data, error: null };
    } catch (err) {
      console.error("Error creating disposal:", err);
      const msg = err instanceof Error ? err.message : "Failed to create disposal";
      setError(msg);
      return { data: null, error: msg };
    }
  }, []);

  const updateDisposal = useCallback(async (
    id: string,
    fields: Partial<AssetDisposal>
  ): Promise<{ data: AssetDisposal | null; error: string | null }> => {
    setError(null);
    try {
      const { supabase, session } = await requireSession();
      if (!session) {
        setError(SESSION_EXPIRED_MSG);
        return { data: null, error: SESSION_EXPIRED_MSG };
      }

      const { data, error: updateError } = await supabase.from("asset_disposals")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        console.error("Supabase update error:", updateError);
        const msg = updateError.message || "Database error while updating disposal";
        setError(msg);
        return { data: null, error: msg };
      }

      setDisposal(data);
      setAllDisposals((prev) => prev.map((d) => (d.id === id ? data : d)));
      return { data, error: null };
    } catch (err) {
      console.error("Error updating disposal:", err);
      const msg = err instanceof Error ? err.message : "Failed to update disposal";
      setError(msg);
      return { data: null, error: msg };
    }
  }, []);

  const advanceStep = useCallback(async (
    id: string,
    nextStatus: DisposalStatus,
    fields?: Partial<AssetDisposal>
  ): Promise<{ data: AssetDisposal | null; error: string | null }> => {
    setError(null);
    try {
      const { supabase, session } = await requireSession();
      if (!session) {
        setError(SESSION_EXPIRED_MSG);
        return { data: null, error: SESSION_EXPIRED_MSG };
      }

      const { data, error: updateError } = await supabase.from("asset_disposals")
        .update({
          ...fields,
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        console.error("Supabase advance step error:", updateError);
        const msg = updateError.message || "Database error while advancing disposal step";
        setError(msg);
        return { data: null, error: msg };
      }

      setDisposal(data);
      setAllDisposals((prev) => prev.map((d) => (d.id === id ? data : d)));
      return { data, error: null };
    } catch (err) {
      console.error("Error advancing disposal step:", err);
      const msg = err instanceof Error ? err.message : "Failed to advance disposal step";
      setError(msg);
      return { data: null, error: msg };
    }
  }, []);

  return {
    disposal,
    allDisposals,
    loading,
    error,
    clearError,
    fetchDisposal,
    fetchAllDisposals,
    createDisposal,
    updateDisposal,
    advanceStep,
  };
}
