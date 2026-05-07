"use client";

import { useState, useCallback } from "react";
import {
  getCachedUserId,
  directSelectList,
  directInsertRow,
  directPatchRowReturning,
  directDeleteRow,
} from "@/lib/supabase/rest";
import type { ParkingLotIssue } from "@/types/database";

export const issueTypeLabels: Record<string, string> = {
  pothole: "Pothole",
  low_area: "Low Area",
  badly_cracked: "Badly Cracked",
  crack: "Crack",
  drainage: "Drainage",
  erosion: "Erosion",
  marking: "Marking",
  curbing: "Curbing",
  other: "Other",
};

export const issueTypeIcons: Record<string, string> = {
  pothole: "🕳️",
  low_area: "⬇️",
  badly_cracked: "💥",
  crack: "↗️",
  drainage: "💧",
  erosion: "🏜️",
  marking: "🅿️",
  curbing: "🧱",
  other: "📍",
};

export const issueTypeColors: Record<string, string> = {
  pothole: "#DC2626",
  low_area: "#854D0E",
  badly_cracked: "#991B1B",
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
      const data = await directSelectList<ParkingLotIssue>(
        "parking_lot_issues",
        {
          columns: "*",
          orderBy: [{ column: "created_at", ascending: false }],
          label: "useParkingLotIssues.fetch",
        },
      );
      setIssues(data);
      return data;
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
    pin_x?: number;
    pin_y?: number;
    issue_type: string;
    severity: string;
    photos?: string[];
    estimated_cost?: number;
    assigned_to?: string;
  }) => {
    try {
      // Cached user-id read avoids the supabase.auth.getUser() wedge.
      const userId = getCachedUserId();
      if (!userId) throw new Error("Not authenticated");

      const data = await directInsertRow<ParkingLotIssue>(
        "parking_lot_issues",
        {
          reported_by: userId,
          title: issue.title,
          description: issue.description || null,
          location: issue.location || null,
          pin_x: issue.pin_x ?? null,
          pin_y: issue.pin_y ?? null,
          issue_type: issue.issue_type,
          severity: issue.severity,
          photos: issue.photos || [],
          estimated_cost: issue.estimated_cost || null,
          assigned_to: issue.assigned_to || null,
        },
        "useParkingLotIssues.create",
      );
      setIssues((prev) => [data, ...prev]);
      return data;
    } catch (err) {
      console.error("Error creating parking lot issue:", err);
      return null;
    }
  }, []);

  const updateIssue = useCallback(async (issueId: string, updates: Partial<ParkingLotIssue>) => {
    try {
      const updateData: Partial<ParkingLotIssue> = {
        ...updates,
        updated_at: new Date().toISOString(),
      };
      if (updates.status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }
      const data = await directPatchRowReturning<ParkingLotIssue>(
        "parking_lot_issues",
        "id",
        issueId,
        updateData,
        "useParkingLotIssues.update",
      );
      setIssues((prev) => prev.map((i) => (i.id === issueId ? data : i)));
      return data;
    } catch (err) {
      console.error("Error updating parking lot issue:", err);
      return null;
    }
  }, []);

  const deleteIssue = useCallback(async (issueId: string) => {
    try {
      await directDeleteRow(
        "parking_lot_issues",
        "id",
        issueId,
        "useParkingLotIssues.delete",
      );
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
