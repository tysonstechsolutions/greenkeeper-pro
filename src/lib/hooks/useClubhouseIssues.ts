"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
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
      const supabase = createClient();
      const { data, error } = await supabase.from("clubhouse_issues")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setIssues(data || []);
      return data || [];
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
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.from("clubhouse_issues")
        .insert({
          reported_by: user.id,
          title: issue.title,
          description: issue.description || null,
          location: issue.location || null,
          category: issue.category,
          priority: issue.priority,
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
      console.error("Error creating clubhouse issue:", err);
      return null;
    }
  }, []);

  const updateIssue = useCallback(async (issueId: string, updates: Partial<ClubhouseIssue>) => {
    try {
      const supabase = createClient();
      const updateData: Partial<ClubhouseIssue> = {
        ...updates,
        updated_at: new Date().toISOString(),
      };
      if (updates.status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }
      const { data, error } = await supabase.from("clubhouse_issues")
        .update(updateData)
        .eq("id", issueId)
        .select()
        .single();
      if (error) throw error;
      setIssues((prev) => prev.map((i) => (i.id === issueId ? data : i)));
      return data;
    } catch (err) {
      console.error("Error updating clubhouse issue:", err);
      return null;
    }
  }, []);

  const deleteIssue = useCallback(async (issueId: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase.from("clubhouse_issues")
        .delete()
        .eq("id", issueId);
      if (error) throw error;
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
