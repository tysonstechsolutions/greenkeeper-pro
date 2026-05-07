"use client";

import { useState, useCallback } from "react";
import {
  getCachedUserId,
  hasValidCachedSession,
  directSelectList,
  directInsertRow,
  directPatchRowReturning,
} from "@/lib/supabase/rest";
import type { AssetDisposal, DisposalStatus } from "@/types/database";

const SESSION_EXPIRED_MSG =
  "Your session expired. Please sign in again with your PIN.";

export function useAssetDisposal() {
  const [disposal, setDisposal] = useState<AssetDisposal | null>(null);
  const [allDisposals, setAllDisposals] = useState<AssetDisposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Cached-session require: reads the persisted session synchronously from
  // localStorage instead of going through supabase.auth.getSession(). The
  // async path has wedged the app on "Loading..." too many times — the
  // cached path is sync, can't hang, and gives us the same user.id we need
  // for the inserts below.
  const requireSession = (): { userId: string | null } => {
    const userId = getCachedUserId();
    if (!userId || !hasValidCachedSession()) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth:session-expired"));
      }
      return { userId: null };
    }
    return { userId };
  };

  const fetchDisposal = useCallback(async (equipmentId: string) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await directSelectList<AssetDisposal>("asset_disposals", {
        columns: "*",
        filters: [
          `equipment_id=eq.${encodeURIComponent(equipmentId)}`,
          `status=neq.completed`,
        ],
        orderBy: [{ column: "created_at", ascending: false }],
        limit: 1,
        label: "useAssetDisposal.fetchDisposal",
      });
      const data = rows[0] ?? null;
      setDisposal(data);
      return data;
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
      const data = await directSelectList<AssetDisposal>("asset_disposals", {
        columns: "*",
        filters: [`status=neq.completed`],
        orderBy: [{ column: "created_at", ascending: false }],
        label: "useAssetDisposal.fetchAllDisposals",
      });
      setAllDisposals(data);
      return data;
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
      const { userId } = requireSession();
      if (!userId) {
        setError(SESSION_EXPIRED_MSG);
        return { data: null, error: SESSION_EXPIRED_MSG };
      }

      const data = await directInsertRow<AssetDisposal>(
        "asset_disposals",
        {
          equipment_id: equipmentId,
          reason,
          status: "pending_request" as DisposalStatus,
          requested_by: userId,
          requested_at: new Date().toISOString(),
        },
        "useAssetDisposal.createDisposal",
      );

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
      const { userId } = requireSession();
      if (!userId) {
        setError(SESSION_EXPIRED_MSG);
        return { data: null, error: SESSION_EXPIRED_MSG };
      }

      const data = await directPatchRowReturning<AssetDisposal>(
        "asset_disposals",
        "id",
        id,
        { ...fields, updated_at: new Date().toISOString() },
        "useAssetDisposal.updateDisposal",
      );

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
      const { userId } = requireSession();
      if (!userId) {
        setError(SESSION_EXPIRED_MSG);
        return { data: null, error: SESSION_EXPIRED_MSG };
      }

      const data = await directPatchRowReturning<AssetDisposal>(
        "asset_disposals",
        "id",
        id,
        {
          ...fields,
          status: nextStatus,
          updated_at: new Date().toISOString(),
        },
        "useAssetDisposal.advanceStep",
      );

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
