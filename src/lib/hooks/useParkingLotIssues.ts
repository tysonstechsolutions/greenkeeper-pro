"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ParkingLotIssue } from "@/types/database";

export const issueTypeLabels: Record<string, string> = {
  pothole: "Pothole",
  crack: "Crack",
  drainage: "Drainage",
  erosion: "Erosion",
  marking: "Marking",
  curbing: "Curbing",
  other: "Other",
};

export const issueTypeColors: Record<string, string> = {
  pothole: "#DC2626",
  crack: "#EA580C",
  drainage: "#2563EB",
  erosion: "#CA8A04",
  marking: "#7C3AED",
  curbing: "#6B7280",
  other: "#6B7280",
};

export const severityLabels: Record<string, string> = {
  minor: "Minor",
  moderate: "Moderate",
  severe: "Severe",
  critical: "Critical",
};

export const severityColors: Record<string, string> = {
  minor: "#22C55E",
  moderate: "#EAB308",
  severe: "#EA580C",
  critical: "#DC2626",
};

export const issueStatusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  scheduled: "Scheduled",
  completed: "Completed",
};

export const issueStatusColors: Record<string, string> = {
  open: "#DC2626",
  in_progress: "#2563EB",
  scheduled: "#7C3AED",
  completed: "#22C55E",
};

export function useParkingLotIssues() {
  const [issues, setIssues] = useState<ParkingLotIssue[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await (supabase.from("parking_lot_issues") as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setIssues(data || []);
      return data || [];
    } catch (err) {
      console.error("Error fetching parking lot issues:", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createIssue = useCallback(async (issue: {
    title: string;
    description?: string;
    location?: string;
    issue_type: string;
    severity: string;
    photos?: string[];
    estimated_cost?: number;
    assigned_to?: string;
  }) => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await (supabase.from("parking_lot_issues") as any)
        .insert({
          reported_by: user.id,
          title: issue.title,
          description: issue.description || null,
          location: issue.location || null,
          issue_type: issue.issue_type,
          severity: issue.severity,
          photos: issue.photos || [],
          estimated_cost: issue.estimated_cost || null,
          assigned_to: issue.assigned_to || null,
        })
        .select()
        .single();
      if (error) throw error;
      setIssues((prev) => [data, ...prev]);
      return data;
    } catch (err) {
      console.error("Error creating parking lot issue:", err);
      return null;
    }
  }, []);

  const updateIssue = useCallback(async (issueId: string, updates: Partial<ParkingLotIssue>) => {
    try {
      const supabase = createClient();
      const updateData: any = { ...updates, updated_at: new Date().toISOString() };
      if (updates.status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }
      const { data, error } = await (supabase.from("parking_lot_issues") as any)
        .update(updateData)
        .eq("id", issueId)
        .select()
        .single();
      if (error) throw error;
      setIssues((prev) => prev.map((i) => (i.id === issueId ? data : i)));
      return data;
    } catch (err) {
      console.error("Error updating parking lot issue:", err);
      return null;
    }
  }, []);

  const deleteIssue = useCallback(async (issueId: string) => {
    try {
      const supabase = createClient();
      const { error } = await (supabase.from("parking_lot_issues") as any)
        .delete()
        .eq("id", issueId);
      if (error) throw error;
      setIssues((prev) => prev.filter((i) => i.id !== issueId));
      return true;
    } catch (err) {
      console.error("Error deleting parking lot issue:", err);
      return false;
    }
  }, []);

  const stats = {
    total: issues.length,
    open: issues.filter((i) => i.status === "open").length,
    inProgress: issues.filter((i) => i.status === "in_progress").length,
    completed: issues.filter((i) => i.status === "completed").length,
    critical: issues.filter((i) => i.severity === "critical").length,
  };

  return { issues, loading, stats, fetchIssues, createIssue, updateIssue, deleteIssue };
}
