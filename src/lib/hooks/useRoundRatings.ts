"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import type { RoundRating } from "@/types/member";

interface RatingStats {
  overall: number;
  greens: number;
  fairways: number;
  bunkers: number;
  tees: number;
  pace: number;
  setup: number;
  cleanliness: number;
  value: number;
  totalRatings: number;
}

interface UseRoundRatingsReturn {
  ratings: RoundRating[];
  loading: boolean;
  fetchMyRatings: () => Promise<RoundRating[]>;
  submitRating: (rating: Omit<RoundRating, "id" | "user_id" | "created_at">) => Promise<boolean>;
  // For superintendent view
  fetchAllRatings: (limit?: number) => Promise<RoundRating[]>;
  getAverageRatings: (
    startDate?: string,
    endDate?: string
  ) => Promise<RatingStats | null>;
  getMemberCount: () => Promise<number>;
  getNewMembersThisMonth: () => Promise<number>;
}

export function useRoundRatings(): UseRoundRatingsReturn {
  const supabase = createClient();
  const { profile } = useAuth();
  const [ratings, setRatings] = useState<RoundRating[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch user's own ratings
  const fetchMyRatings = useCallback(async (): Promise<RoundRating[]> => {
    if (!profile) return [];

    setLoading(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("round_ratings")
      .select("*")
      .eq("user_id", profile.id)
      .order("round_date", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error fetching ratings:", error);
      setLoading(false);
      return [];
    }

    const ratingsData = (data || []) as RoundRating[];
    setRatings(ratingsData);
    setLoading(false);
    return ratingsData;
  }, [supabase, profile]);

  // Submit a new round rating
  const submitRating = useCallback(
    async (
      rating: Omit<RoundRating, "id" | "user_id" | "created_at">
    ): Promise<boolean> => {
      if (!profile) return false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("round_ratings").insert({
        user_id: profile.id,
        ...rating,
      });

      if (error) {
        console.error("Error submitting rating:", error);
        return false;
      }

      // Also add to golfer_feedback for superintendent view
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("golfer_feedback").insert({
        submitted_by: profile.id,
        feedback_date: rating.round_date,
        feedback_type: "suggestion",
        area: "greens",
        notes: `Round Rating: Overall ${rating.overall_rating}/5. ${rating.comments || "No comments"}`,
        status: "new",
      });

      await fetchMyRatings();
      return true;
    },
    [supabase, profile, fetchMyRatings]
  );

  // Fetch all ratings (for superintendent)
  const fetchAllRatings = useCallback(
    async (limit = 50): Promise<RoundRating[]> => {
      setLoading(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("round_ratings")
        .select(
          `
          *,
          user:profiles!round_ratings_user_id_fkey(full_name, avatar_url)
        `
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        console.error("Error fetching all ratings:", error);
        setLoading(false);
        return [];
      }

      setLoading(false);
      return (data || []) as RoundRating[];
    },
    [supabase]
  );

  // Get average ratings for a time period
  const getAverageRatings = useCallback(
    async (
      startDate?: string,
      endDate?: string
    ): Promise<RatingStats | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from("round_ratings")
        .select(
          "overall_rating, greens_rating, fairways_rating, bunkers_rating, tees_rating, pace_rating, setup_rating, cleanliness_rating, value_rating"
        );

      if (startDate) {
        query = query.gte("round_date", startDate);
      }
      if (endDate) {
        query = query.lte("round_date", endDate);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching rating stats:", error);
        return null;
      }

      if (!data || data.length === 0) {
        return null;
      }

      const ratings = data as RoundRating[];
      const count = ratings.length;

      const avg = (field: keyof RoundRating) => {
        const validRatings = ratings.filter((r) => r[field] !== null);
        if (validRatings.length === 0) return 0;
        const sum = validRatings.reduce(
          (acc, r) => acc + (r[field] as number),
          0
        );
        return Math.round((sum / validRatings.length) * 10) / 10;
      };

      return {
        overall: avg("overall_rating"),
        greens: avg("greens_rating"),
        fairways: avg("fairways_rating"),
        bunkers: avg("bunkers_rating"),
        tees: avg("tees_rating"),
        pace: avg("pace_rating"),
        setup: avg("setup_rating"),
        cleanliness: avg("cleanliness_rating"),
        value: avg("value_rating"),
        totalRatings: count,
      };
    },
    [supabase]
  );

  // Get total member count
  const getMemberCount = useCallback(async (): Promise<number> => {
    const { count, error } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "member")
      .eq("is_active", true);

    if (error) {
      console.error("Error getting member count:", error);
      return 0;
    }

    return count || 0;
  }, [supabase]);

  // Get new members this month
  const getNewMembersThisMonth = useCallback(async (): Promise<number> => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count, error } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "member")
      .gte("created_at", startOfMonth.toISOString());

    if (error) {
      console.error("Error getting new members:", error);
      return 0;
    }

    return count || 0;
  }, [supabase]);

  return {
    ratings,
    loading,
    fetchMyRatings,
    submitRating,
    fetchAllRatings,
    getAverageRatings,
    getMemberCount,
    getNewMembersThisMonth,
  };
}
