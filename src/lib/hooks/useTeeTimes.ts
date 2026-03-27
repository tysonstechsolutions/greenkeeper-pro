"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import type { TeeTime, TeeTimeStatus } from "@/types/member";

interface UseTeeTimesReturn {
  teeTimes: TeeTime[];
  loading: boolean;
  fetchMyTeeTimes: () => Promise<TeeTime[]>;
  fetchTeeTimesForDate: (date: string) => Promise<TeeTime[]>;
  bookTeeTime: (
    date: string,
    time: string,
    numPlayers: number,
    playerNames: string[],
    cartRequested: boolean,
    notes?: string
  ) => Promise<{ success: boolean; error: string | null }>;
  cancelTeeTime: (id: string) => Promise<boolean>;
  getAvailableSlots: (date: string) => Promise<string[]>;
}

// Generate time slots from 6:30 AM to 4:00 PM every 10 minutes
function generateAllTimeSlots(): string[] {
  const slots: string[] = [];
  let hour = 6;
  let minute = 30;

  while (hour < 16 || (hour === 16 && minute === 0)) {
    slots.push(
      `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`
    );
    minute += 10;
    if (minute >= 60) {
      minute = 0;
      hour += 1;
    }
  }

  return slots;
}

const ALL_TIME_SLOTS = generateAllTimeSlots();

export function useTeeTimes(): UseTeeTimesReturn {
  const supabase = createClient();
  const { profile } = useAuth();
  const [teeTimes, setTeeTimes] = useState<TeeTime[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch user's tee times (upcoming and past)
  const fetchMyTeeTimes = useCallback(async (): Promise<TeeTime[]> => {
    if (!profile) return [];

    setLoading(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("tee_times")
      .select(
        `
        *,
        booker:profiles!tee_times_user_id_fkey(full_name, avatar_url)
      `
      )
      .eq("user_id", profile.id)
      .order("tee_date", { ascending: false })
      .order("tee_time", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error fetching tee times:", error);
      setLoading(false);
      return [];
    }

    const teeTimesData = (data || []) as TeeTime[];
    setTeeTimes(teeTimesData);
    setLoading(false);
    return teeTimesData;
  }, [supabase, profile]);

  // Fetch all tee times for a specific date (to show availability)
  const fetchTeeTimesForDate = useCallback(
    async (date: string): Promise<TeeTime[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("tee_times")
        .select("tee_time, status, num_players")
        .eq("tee_date", date)
        .eq("status", "confirmed");

      if (error) {
        console.error("Error fetching tee times for date:", error);
        return [];
      }

      return (data || []) as TeeTime[];
    },
    [supabase]
  );

  // Get available time slots for a date
  const getAvailableSlots = useCallback(
    async (date: string): Promise<string[]> => {
      const bookedTimes = await fetchTeeTimesForDate(date);
      const bookedSlots = new Set(bookedTimes.map((t) => t.tee_time));

      return ALL_TIME_SLOTS.filter((slot) => !bookedSlots.has(slot));
    },
    [fetchTeeTimesForDate]
  );

  // Book a tee time
  const bookTeeTime = useCallback(
    async (
      date: string,
      time: string,
      numPlayers: number,
      playerNames: string[],
      cartRequested: boolean,
      notes?: string
    ): Promise<{ success: boolean; error: string | null }> => {
      if (!profile) {
        return { success: false, error: "Please sign in to book a tee time" };
      }

      // Check if slot is still available
      const existingTimes = await fetchTeeTimesForDate(date);
      const isBooked = existingTimes.some((t) => t.tee_time === time);

      if (isBooked) {
        return { success: false, error: "This time slot is no longer available" };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("tee_times").insert({
        user_id: profile.id,
        tee_date: date,
        tee_time: time,
        num_players: numPlayers,
        player_names: playerNames.filter((n) => n.trim() !== ""),
        cart_requested: cartRequested,
        notes: notes || null,
        status: "confirmed" as TeeTimeStatus,
      });

      if (error) {
        console.error("Error booking tee time:", error);
        return { success: false, error: "Failed to book tee time. Please try again." };
      }

      // Refresh user's tee times
      await fetchMyTeeTimes();
      return { success: true, error: null };
    },
    [supabase, profile, fetchTeeTimesForDate, fetchMyTeeTimes]
  );

  // Cancel a tee time
  const cancelTeeTime = useCallback(
    async (id: string): Promise<boolean> => {
      if (!profile) return false;

      // Check if cancellation is at least 24 hours ahead
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: teeTime } = await (supabase as any)
        .from("tee_times")
        .select("tee_date, tee_time")
        .eq("id", id)
        .eq("user_id", profile.id)
        .single();

      if (!teeTime) {
        console.error("Tee time not found");
        return false;
      }

      const teeDateTime = new Date(`${teeTime.tee_date}T${teeTime.tee_time}`);
      const now = new Date();
      const hoursUntilTeeTime = (teeDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilTeeTime < 24) {
        console.error("Cannot cancel less than 24 hours before tee time");
        return false;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("tee_times")
        .update({
          status: "cancelled" as TeeTimeStatus,
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", profile.id);

      if (error) {
        console.error("Error cancelling tee time:", error);
        return false;
      }

      // Refresh user's tee times
      await fetchMyTeeTimes();
      return true;
    },
    [supabase, profile, fetchMyTeeTimes]
  );

  return {
    teeTimes,
    loading,
    fetchMyTeeTimes,
    fetchTeeTimesForDate,
    bookTeeTime,
    cancelTeeTime,
    getAvailableSlots,
  };
}

// Helper to format time for display
export function formatTeeTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}
