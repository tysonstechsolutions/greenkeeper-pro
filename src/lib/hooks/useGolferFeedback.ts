"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";

export type FeedbackType = "compliment" | "complaint" | "suggestion";
export type FeedbackArea =
  | "greens"
  | "fairways"
  | "bunkers"
  | "tees"
  | "cart_paths"
  | "pace_of_play"
  | "course_setup"
  | "cleanliness"
  | "other";
export type FeedbackStatus = "new" | "acknowledged" | "in_progress" | "resolved" | "dismissed";

export interface GolferFeedback {
  id: string;
  submitted_by: string;
  feedback_date: string;
  feedback_type: FeedbackType;
  area: FeedbackArea;
  hole_number: number | null;
  notes: string;
  status: FeedbackStatus;
  superintendent_response: string | null;
  created_at: string;
  // Joined data
  submitter?: {
    full_name: string;
    avatar_url: string | null;
  };
}

export const feedbackTypeLabels: Record<FeedbackType, string> = {
  compliment: "Compliment",
  complaint: "Complaint",
  suggestion: "Suggestion",
};

export const feedbackTypeColors: Record<FeedbackType, string> = {
  compliment: "#22c55e", // green
  complaint: "#ef4444", // red
  suggestion: "#3b82f6", // blue
};

export const feedbackAreaLabels: Record<FeedbackArea, string> = {
  greens: "Greens",
  fairways: "Fairways",
  bunkers: "Bunkers",
  tees: "Tees",
  cart_paths: "Cart Paths",
  pace_of_play: "Pace of Play",
  course_setup: "Course Setup",
  cleanliness: "Cleanliness",
  other: "Other",
};

export const feedbackStatusLabels: Record<FeedbackStatus, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  in_progress: "In Progress",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

export function useGolferFeedback() {
  const supabase = createClient();
  const { profile, isSuper, isAsstSuper, isPro } = useAuth();
  const [feedback, setFeedback] = useState<GolferFeedback[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch feedback (superintendents see all, pro sees only their own submissions)
  const fetchFeedback = useCallback(
    async (status?: FeedbackStatus, limit = 50): Promise<GolferFeedback[]> => {
      if (!profile) return [];

      setLoading(true);

      try {
        let query = supabase
          .from("golfer_feedback")
          .select(
            `
            *,
            submitter:profiles!golfer_feedback_submitted_by_fkey(full_name, avatar_url)
          `
          )
          .order("created_at", { ascending: false })
          .limit(limit);

        // Pro can only see their own feedback
        if (isPro && !isSuper && !isAsstSuper) {
          query = query.eq("submitted_by", profile.id);
        }

        // Filter by status if provided
        if (status) {
          query = query.eq("status", status);
        }

        const { data, error } = await query;

        if (error) {
          console.error("Error fetching feedback:", error);
          return [];
        }

        const feedbackData = (data || []) as unknown as GolferFeedback[];
        setFeedback(feedbackData);
        return feedbackData;
      } catch (err) {
        console.error("Unexpected error fetching feedback:", err);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [supabase, profile, isPro, isSuper, isAsstSuper]
  );

  // Count new feedback items (for badge)
  const getNewFeedbackCount = useCallback(async (): Promise<number> => {
    try {
      const { count, error } = await supabase
        .from("golfer_feedback")
        .select("*", { count: "exact", head: true })
        .eq("status", "new");

      if (error) {
        console.error("Error counting new feedback:", error);
        return 0;
      }

      return count || 0;
    } catch (err) {
      console.error("Unexpected error counting feedback:", err);
      return 0;
    }
  }, [supabase]);

  // Submit new feedback (pro or superintendent)
  const submitFeedback = useCallback(
    async (
      feedbackType: FeedbackType,
      area: FeedbackArea,
      notes: string,
      holeNumber?: number
    ): Promise<boolean> => {
      if (!profile) return false;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("golfer_feedback").insert({
          submitted_by: profile.id,
          feedback_date: new Date().toISOString().split("T")[0],
          feedback_type: feedbackType,
          area,
          hole_number: holeNumber || null,
          notes,
          status: "new" as FeedbackStatus,
        });

        if (error) {
          console.error("Error submitting feedback:", error);
          return false;
        }

        return true;
      } catch (err) {
        console.error("Unexpected error submitting feedback:", err);
        return false;
      }
    },
    [supabase, profile]
  );

  // Update feedback status (superintendent only)
  const updateFeedbackStatus = useCallback(
    async (
      feedbackId: string,
      status: FeedbackStatus,
      response?: string
    ): Promise<boolean> => {
      if (!profile || (!isSuper && !isAsstSuper)) {
        console.error("Only superintendents can update feedback status");
        return false;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("golfer_feedback")
          .update({
            status,
            superintendent_response: response || null,
          })
          .eq("id", feedbackId);

        if (error) {
          console.error("Error updating feedback:", error);
          return false;
        }

        // Update local state
        setFeedback((prev) =>
          prev.map((f) =>
            f.id === feedbackId
              ? { ...f, status, superintendent_response: response || null }
              : f
          )
        );

        return true;
      } catch (err) {
        console.error("Unexpected error updating feedback:", err);
        return false;
      }
    },
    [supabase, profile, isSuper, isAsstSuper]
  );

  return {
    feedback,
    loading,
    fetchFeedback,
    getNewFeedbackCount,
    submitFeedback,
    updateFeedbackStatus,
    canRespond: isSuper || isAsstSuper,
  };
}
