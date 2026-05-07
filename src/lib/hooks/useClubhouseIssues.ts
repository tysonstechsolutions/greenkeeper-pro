"use client";

import { useState, useCallback } from "react";
import {
  getCachedUserId,
  directSelectList,
  directInsertRow,
  directPatchRowReturning,
  directDeleteRow,
} from "@/lib/supabase/rest";
import type { ClubhouseIssue } from "@/types/database";

export const categoryLabels: Record<string, string> = {
  damage: "Damage",
  cleaning: "Cleaning",
  order: "Needs Ordered",
  maintenance: "Maintenance",
};

export const categoryColors: Record<string, string> = {
  damage: "#DC2626",
  cleaning: "#2563EB",
  order: "#EA580C",
  maintenance: "#7C3AED",
};

export const categoryIcons: Record<string, string> = {
  damage: "AlertTriangle",
  cleaning: "Sparkles",
  order: "ShoppingCart",
  maintenance: "Wrench",
};

export const clubhousePriorityLabels: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const clubhousePriorityColors: Record<string, string> = {
  low: "#22C55E",
  normal: "#3B82F6",
  high: "#EA580C",
  urgent: "#DC2626",
};

export const clubhouseStatusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  ordered: "Ordered",
  scheduled: "Scheduled",
  completed: "Completed",
};

export const clubhouseStatusColors: Record<string, string> = {
  open: "#DC2626",
  in_progress: "#2563EB",
  ordered: "#7C3AED",
  scheduled: "#CA8A04",
  completed: "#22C55E",
};

export function useClubhouseIssues() {
  const [issues, setIssues] = useState<ClubhouseIssue[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    try {
      const data = await directSelectList<ClubhouseIssue>("clubhouse_issues", {
        columns: "*",
        orderBy: [{ column: "created_at", ascending: false }],
        label: "useClubhouseIssues.fetch",
      });
      setIssues(data);
      return data;
    } catch (err) {
      console.error("Error fetching clubhouse issues:", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createIssue = useCallback(async (issue: {
    title: string;
    description?: string;
    location?: string;
    category: string;
    priority: string;
    photos?: string[];
    estimated_cost?: number;
    assigned_to?: string;
  }) => {
    try {
      // Cached user-id read avoids the supabase.auth.getUser() wedge.
      const userId = getCachedUserId();
      if (!userId) throw new Error("Not authenticated");

      const data = await directInsertRow<ClubhouseIssue>(
        "clubhouse_issues",
        {
          reported_by: userId,
          title: issue.title,
          description: issue.description || null,
          location: issue.location || null,
          category: issue.category,
          priority: issue.priority,
          photos: issue.photos || [],
          estimated_cost: issue.estimated_cost || null,
          assigned_to: issue.assigned_to || null,
        },
        "useClubhouseIssues.create",
      );
      setIssues((prev) => [data, ...prev]);
      return data;
    } catch (err) {
      console.error("Error creating clubhouse issue:", err);
      return null;
    }
  }, []);

  const updateIssue = useCallback(async (issueId: string, updates: Partial<ClubhouseIssue>) => {
    try {
      const updateData: Partial<ClubhouseIssue> = {
        ...updates,
        updated_at: new Date().toISOString(),
      };
      if (updates.status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }
      const data = await directPatchRowReturning<ClubhouseIssue>(
        "clubhouse_issues",
        "id",
        issueId,
        updateData,
        "useClubhouseIssues.update",
      );
      setIssues((prev) => prev.map((i) => (i.id === issueId ? data : i)));
      return data;
    } catch (err) {
      console.error("Error updating clubhouse issue:", err);
      return null;
    }
  }, []);

  const deleteIssue = useCallback(async (issueId: string) => {
    try {
      await directDeleteRow(
        "clubhouse_issues",
        "id",
        issueId,
        "useClubhouseIssues.delete",
      );
      setIssues((prev) => prev.filter((i) => i.id !== issueId));
      return true;
    } catch (err) {
      console.error("Error deleting clubhouse issue:", err);
      return false;
    }
  }, []);

  const stats = {
    total: issues.length,
    open: issues.filter((i) => i.status === "open").length,
    inProgress: issues.filter((i) => i.status === "in_progress").length,
    completed: issues.filter((i) => i.status === "completed").length,
    urgent: issues.filter((i) => i.priority === "urgent").length,
    byCategory: {
      damage: issues.filter((i) => i.category === "damage" && i.status !== "completed").length,
      cleaning: issues.filter((i) => i.category === "cleaning" && i.status !== "completed").length,
      order: issues.filter((i) => i.category === "order" && i.status !== "completed").length,
      maintenance: issues.filter((i) => i.category === "maintenance" && i.status !== "completed").length,
    },
  };

  return { issues, loading, stats, fetchIssues, createIssue, updateIssue, deleteIssue };
}
