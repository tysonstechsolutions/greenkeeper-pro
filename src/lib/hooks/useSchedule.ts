"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import { formatLocalDate } from "@/lib/utils/date";
import type {
  Schedule,
  ShiftType,
  Profile,
} from "@/types/database";

// Extended schedule type with joined profile data
export interface ScheduleWithProfile extends Schedule {
  profile?: Pick<Profile, "id" | "full_name" | "display_name" | "role" | "avatar_url" | "phone"> | null;
}

// Schedule entry for creating/updating
export interface ScheduleEntry {
  user_id: string;
  schedule_date: string;
  shift_start?: string | null;
  shift_end?: string | null;
  shift_type?: ShiftType | null;
  crew_assignment?: string | null;
  notes?: string | null;
}

// Day roster entry
export interface DayRosterEntry {
  user_id: string;
  profile: Pick<Profile, "id" | "full_name" | "display_name" | "role" | "avatar_url" | "phone">;
  shift_start: string | null;
  shift_end: string | null;
  shift_type: ShiftType | null;
  crew_assignment: string | null;
}

// Week schedule grouped by user
export interface WeekScheduleByUser {
  user_id: string;
  profile: Pick<Profile, "id" | "full_name" | "display_name" | "role" | "avatar_url" | "phone">;
  schedules: Record<string, ScheduleWithProfile>; // keyed by date string
}

interface UseScheduleReturn {
  schedules: ScheduleWithProfile[];
  loading: boolean;
  error: string | null;
  fetchWeekSchedule: (weekStartDate: string) => Promise<WeekScheduleByUser[]>;
  fetchMySchedule: (startDate: string, endDate: string) => Promise<ScheduleWithProfile[]>;
  fetchDayRoster: (date: string) => Promise<DayRosterEntry[]>;
  setSchedule: (userId: string, date: string, shiftData: Partial<ScheduleEntry>) => Promise<Schedule | null>;
  bulkSetSchedule: (entries: ScheduleEntry[]) => Promise<boolean>;
  deleteSchedule: (userId: string, date: string) => Promise<boolean>;
  copyWeekSchedule: (sourceWeekStart: string, targetWeekStart: string) => Promise<boolean>;
}

// Helper to get dates for a week starting from a given date
function getWeekDates(weekStartDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(weekStartDate + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(formatLocalDate(date));
  }
  return dates;
}

// Helper to add days to a date string
function addDays(dateString: string, days: number): string {
  const date = new Date(dateString + "T00:00:00");
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

export function useSchedule(): UseScheduleReturn {
  const [schedules, setSchedules] = useState<ScheduleWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, profile } = useAuth();

  const supabase = createClient();

  // Build the base query with profile join
  const buildScheduleQuery = useCallback(() => {
    return supabase
      .from("schedules")
      .select(`
        *,
        profile:profiles!schedules_user_id_fkey(id, full_name, display_name, role, avatar_url, phone)
      `);
  }, [supabase]);

  // Fetch all staff schedules for a given week, grouped by user
  const fetchWeekSchedule = useCallback(
    async (weekStartDate: string): Promise<WeekScheduleByUser[]> => {
      setLoading(true);
      setError(null);

      try {
        const weekDates = getWeekDates(weekStartDate);
        const weekEndDate = weekDates[6];

        // Fetch all schedules for the week
        const { data: scheduleData, error: scheduleError } = await buildScheduleQuery()
          .gte("schedule_date", weekStartDate)
          .lte("schedule_date", weekEndDate)
          .order("schedule_date", { ascending: true });

        if (scheduleError) {
          console.error("Error fetching week schedule:", scheduleError);
          setError(scheduleError.message);
          return [];
        }

        // Fetch all active profiles to include users without schedules
        type ProfileQueryResult = Pick<Profile, "id" | "full_name" | "display_name" | "role" | "avatar_url" | "phone">;
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, display_name, role, avatar_url, phone")
          .eq("is_active", true)
          .order("role", { ascending: true })
          .order("full_name", { ascending: true })
          .limit(100) as { data: ProfileQueryResult[] | null; error: Error | null }; // Limit profiles

        if (profilesError) {
          console.error("Error fetching profiles:", profilesError);
          setError(profilesError.message);
          return [];
        }

        // Group schedules by user
        const schedulesByUser = new Map<string, Record<string, ScheduleWithProfile>>();
        const profilesMap = new Map<string, Pick<Profile, "id" | "full_name" | "display_name" | "role" | "avatar_url" | "phone">>();

        // Initialize all profiles
        for (const p of profilesData || []) {
          profilesMap.set(p.id, p);
          schedulesByUser.set(p.id, {});
        }

        // Add schedule data
        for (const schedule of (scheduleData as ScheduleWithProfile[]) || []) {
          const userSchedules = schedulesByUser.get(schedule.user_id) || {};
          userSchedules[schedule.schedule_date] = schedule;
          schedulesByUser.set(schedule.user_id, userSchedules);
        }

        // Convert to array format
        const result: WeekScheduleByUser[] = [];
        for (const [userId, userSchedules] of schedulesByUser) {
          const profileData = profilesMap.get(userId);
          if (profileData) {
            result.push({
              user_id: userId,
              profile: profileData,
              schedules: userSchedules,
            });
          }
        }

        setSchedules(scheduleData as ScheduleWithProfile[] || []);
        return result;
      } catch (err) {
        console.error("Unexpected error fetching week schedule:", err);
        setError("An unexpected error occurred");
        return [];
      } finally {
        setLoading(false);
      }
    },
    [buildScheduleQuery, supabase]
  );

  // Fetch current user's schedule for a date range
  const fetchMySchedule = useCallback(
    async (startDate: string, endDate: string): Promise<ScheduleWithProfile[]> => {
      if (!user) {
        setError("You must be logged in");
        return [];
      }

      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await buildScheduleQuery()
          .eq("user_id", user.id)
          .gte("schedule_date", startDate)
          .lte("schedule_date", endDate)
          .order("schedule_date", { ascending: true });

        if (fetchError) {
          console.error("Error fetching my schedule:", fetchError);
          setError(fetchError.message);
          return [];
        }

        const result = (data as ScheduleWithProfile[]) || [];
        setSchedules(result);
        return result;
      } catch (err) {
        console.error("Unexpected error fetching my schedule:", err);
        setError("An unexpected error occurred");
        return [];
      } finally {
        setLoading(false);
      }
    },
    [user, buildScheduleQuery]
  );

  // Fetch day roster - who's working today
  const fetchDayRoster = useCallback(
    async (date: string): Promise<DayRosterEntry[]> => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await buildScheduleQuery()
          .eq("schedule_date", date)
          .neq("shift_type", "off")
          .order("shift_start", { ascending: true, nullsFirst: false });

        if (fetchError) {
          console.error("Error fetching day roster:", fetchError);
          setError(fetchError.message);
          return [];
        }

        const roster: DayRosterEntry[] = ((data as ScheduleWithProfile[]) || [])
          .filter((s) => s.profile)
          .map((s) => ({
            user_id: s.user_id,
            profile: s.profile!,
            shift_start: s.shift_start,
            shift_end: s.shift_end,
            shift_type: s.shift_type,
            crew_assignment: s.crew_assignment,
          }));

        return roster;
      } catch (err) {
        console.error("Unexpected error fetching day roster:", err);
        setError("An unexpected error occurred");
        return [];
      } finally {
        setLoading(false);
      }
    },
    [buildScheduleQuery]
  );

  // Create or update a single schedule entry (upsert)
  const setSchedule = useCallback(
    async (
      userId: string,
      date: string,
      shiftData: Partial<ScheduleEntry>
    ): Promise<Schedule | null> => {
      if (!profile) {
        setError("You must be logged in");
        return null;
      }

      try {
        // Check if entry exists
        const { data: existing } = await supabase
          .from("schedules")
          .select("id")
          .eq("user_id", userId)
          .eq("schedule_date", date)
          .single() as { data: { id: string } | null };

        if (existing) {
          // Update existing
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: updated, error: updateError } = await (supabase as any)
            .from("schedules")
            .update({
              shift_start: shiftData.shift_start ?? null,
              shift_end: shiftData.shift_end ?? null,
              shift_type: shiftData.shift_type ?? null,
              crew_assignment: shiftData.crew_assignment ?? null,
              notes: shiftData.notes ?? null,
            })
            .eq("id", existing.id)
            .select()
            .single() as { data: Schedule | null; error: Error | null };

          if (updateError) {
            console.error("Error updating schedule:", updateError);
            setError(updateError.message);
            return null;
          }

          return updated as Schedule;
        } else {
          // Insert new
          const insertData = {
            user_id: userId,
            schedule_date: date,
            shift_start: shiftData.shift_start ?? null,
            shift_end: shiftData.shift_end ?? null,
            shift_type: shiftData.shift_type ?? null,
            crew_assignment: shiftData.crew_assignment ?? null,
            notes: shiftData.notes ?? null,
            created_by: profile.id,
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: inserted, error: insertError } = await (supabase as any)
            .from("schedules")
            .insert(insertData)
            .select()
            .single() as { data: Schedule | null; error: Error | null };

          if (insertError) {
            console.error("Error inserting schedule:", insertError);
            setError(insertError.message);
            return null;
          }

          return inserted as Schedule;
        }
      } catch (err) {
        console.error("Unexpected error setting schedule:", err);
        setError("Failed to set schedule");
        return null;
      }
    },
    [profile, supabase]
  );

  // Bulk set multiple schedule entries
  const bulkSetSchedule = useCallback(
    async (entries: ScheduleEntry[]): Promise<boolean> => {
      if (!profile) {
        setError("You must be logged in");
        return false;
      }

      if (entries.length === 0) return true;

      try {
        // Process entries in batches to handle upserts
        for (const entry of entries) {
          // Check if exists
          const { data: existing } = await supabase
            .from("schedules")
            .select("id")
            .eq("user_id", entry.user_id)
            .eq("schedule_date", entry.schedule_date)
            .single() as { data: { id: string } | null };

          if (existing) {
            // Update
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: updateError } = await (supabase as any)
              .from("schedules")
              .update({
                shift_start: entry.shift_start ?? null,
                shift_end: entry.shift_end ?? null,
                shift_type: entry.shift_type ?? null,
                crew_assignment: entry.crew_assignment ?? null,
                notes: entry.notes ?? null,
              })
              .eq("id", existing.id) as { error: Error | null };

            if (updateError) {
              console.error("Error updating schedule in bulk:", updateError);
              setError(updateError.message);
              return false;
            }
          } else {
            // Insert
            const insertData = {
              user_id: entry.user_id,
              schedule_date: entry.schedule_date,
              shift_start: entry.shift_start ?? null,
              shift_end: entry.shift_end ?? null,
              shift_type: entry.shift_type ?? null,
              crew_assignment: entry.crew_assignment ?? null,
              notes: entry.notes ?? null,
              created_by: profile.id,
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: insertError } = await (supabase as any)
              .from("schedules")
              .insert(insertData) as { error: Error | null };

            if (insertError) {
              console.error("Error inserting schedule in bulk:", insertError);
              setError(insertError.message);
              return false;
            }
          }
        }

        return true;
      } catch (err) {
        console.error("Unexpected error in bulk set schedule:", err);
        setError("Failed to set schedules");
        return false;
      }
    },
    [profile, supabase]
  );

  // Delete a schedule entry
  const deleteSchedule = useCallback(
    async (userId: string, date: string): Promise<boolean> => {
      try {
        const { error: deleteError } = await supabase
          .from("schedules")
          .delete()
          .eq("user_id", userId)
          .eq("schedule_date", date);

        if (deleteError) {
          console.error("Error deleting schedule:", deleteError);
          setError(deleteError.message);
          return false;
        }

        // Remove from local state
        setSchedules((prev) =>
          prev.filter((s) => !(s.user_id === userId && s.schedule_date === date))
        );

        return true;
      } catch (err) {
        console.error("Unexpected error deleting schedule:", err);
        setError("Failed to delete schedule");
        return false;
      }
    },
    [supabase]
  );

  // Copy an entire week's schedule to another week
  const copyWeekSchedule = useCallback(
    async (sourceWeekStart: string, targetWeekStart: string): Promise<boolean> => {
      if (!profile) {
        setError("You must be logged in");
        return false;
      }

      try {
        // Fetch source week schedules
        const sourceDates = getWeekDates(sourceWeekStart);

        type SourceScheduleResult = {
          user_id: string;
          schedule_date: string;
          shift_start: string | null;
          shift_end: string | null;
          shift_type: ShiftType | null;
          crew_assignment: string | null;
          notes: string | null;
        };
        const { data: sourceSchedules, error: fetchError } = await supabase
          .from("schedules")
          .select("*")
          .gte("schedule_date", sourceDates[0])
          .lte("schedule_date", sourceDates[6]) as { data: SourceScheduleResult[] | null; error: Error | null };

        if (fetchError) {
          console.error("Error fetching source week:", fetchError);
          setError(fetchError.message);
          return false;
        }

        if (!sourceSchedules || sourceSchedules.length === 0) {
          setError("No schedules found in source week");
          return false;
        }

        // Calculate day offset between source and target
        const sourceStart = new Date(sourceWeekStart + "T00:00:00");
        const targetStart = new Date(targetWeekStart + "T00:00:00");
        const dayOffset = Math.round((targetStart.getTime() - sourceStart.getTime()) / (1000 * 60 * 60 * 24));

        // Create new schedule entries for target week
        const newEntries: ScheduleEntry[] = sourceSchedules.map((schedule) => {
          const newDate = addDays(schedule.schedule_date, dayOffset);
          return {
            user_id: schedule.user_id,
            schedule_date: newDate,
            shift_start: schedule.shift_start,
            shift_end: schedule.shift_end,
            shift_type: schedule.shift_type,
            crew_assignment: schedule.crew_assignment,
            notes: schedule.notes,
          };
        });

        // Use bulk set to upsert the entries
        const success = await bulkSetSchedule(newEntries);
        return success;
      } catch (err) {
        console.error("Unexpected error copying week schedule:", err);
        setError("Failed to copy week schedule");
        return false;
      }
    },
    [profile, supabase, bulkSetSchedule]
  );

  return {
    schedules,
    loading,
    error,
    fetchWeekSchedule,
    fetchMySchedule,
    fetchDayRoster,
    setSchedule,
    bulkSetSchedule,
    deleteSchedule,
    copyWeekSchedule,
  };
}

// Shift type display labels
export const shiftTypeLabels: Record<ShiftType, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  split: "Split",
  full: "Full Day",
  on_call: "On Call",
  off: "Off",
};

// Shift type colors for UI
export const shiftTypeColors: Record<ShiftType, { bg: string; text: string }> = {
  morning: { bg: "bg-blue-500/10", text: "text-blue-600" },
  afternoon: { bg: "bg-orange-500/10", text: "text-orange-600" },
  split: { bg: "bg-purple-500/10", text: "text-purple-600" },
  full: { bg: "bg-green-500/10", text: "text-green-600" },
  on_call: { bg: "bg-amber-500/10", text: "text-amber-600" },
  off: { bg: "bg-gray-500/10", text: "text-gray-500" },
};

// Format shift time for display
export function formatShiftTime(start: string | null, end: string | null): string {
  if (!start && !end) return "";

  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  };

  if (start && end) {
    return `${formatTime(start)} - ${formatTime(end)}`;
  }
  if (start) {
    return `${formatTime(start)} start`;
  }
  return "";
}

// Get week start date (Monday) for a given date
export function getWeekStart(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setDate(diff);
  return formatLocalDate(d);
}

// Format week range for display
export function formatWeekRange(weekStartDate: string): string {
  const start = new Date(weekStartDate + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const formatOptions: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startStr = start.toLocaleDateString("en-US", formatOptions);
  const endStr = end.toLocaleDateString("en-US", { ...formatOptions, year: "numeric" });

  return `${startStr} - ${endStr}`;
}
