"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import type {
  TimeOffRequest,
  TimeOffRequestType,
  TimeOffRequestStatus,
  Profile,
} from "@/types/database";
import { sendNotification, sendNotifications } from "./useNotifications";
import { formatLocalDate } from "@/lib/utils/date";

// Extended time-off request type with joined profile data
export interface TimeOffRequestWithProfile extends TimeOffRequest {
  profile?: Pick<Profile, "id" | "full_name" | "display_name" | "role" | "avatar_url"> | null;
  reviewer?: Pick<Profile, "id" | "full_name"> | null;
}

// Data for creating a new time-off request
export interface CreateTimeOffRequestData {
  start_date: string;
  end_date: string;
  request_type: TimeOffRequestType;
  reason?: string | null;
}

// Conflict check result
export interface DateRangeConflict {
  date: string;
  count: number;
  users: Array<{
    id: string;
    name: string;
  }>;
}

interface UseTimeOffReturn {
  requests: TimeOffRequestWithProfile[];
  loading: boolean;
  error: string | null;
  fetchMyRequests: () => Promise<TimeOffRequestWithProfile[]>;
  fetchAllRequests: (status?: TimeOffRequestStatus) => Promise<TimeOffRequestWithProfile[]>;
  fetchPendingRequests: () => Promise<TimeOffRequestWithProfile[]>;
  submitRequest: (data: CreateTimeOffRequestData) => Promise<TimeOffRequest | null>;
  approveRequest: (id: string) => Promise<boolean>;
  denyRequest: (id: string, reason?: string) => Promise<boolean>;
  cancelRequest: (id: string) => Promise<boolean>;
  getConflicts: (startDate: string, endDate: string) => Promise<DateRangeConflict[]>;
}

// Helper to get all dates in a range
function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  while (start <= end) {
    dates.push(formatLocalDate(start));
    start.setDate(start.getDate() + 1);
  }

  return dates;
}

export function useTimeOff(): UseTimeOffReturn {
  const [requests, setRequests] = useState<TimeOffRequestWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, profile, isManager } = useAuth();

  const supabase = createClient();

  // Build the base query with profile joins
  const buildRequestQuery = useCallback(() => {
    return supabase
      .from("time_off_requests")
      .select(`
        *,
        profile:profiles!time_off_requests_user_id_fkey(id, full_name, display_name, role, avatar_url),
        reviewer:profiles!time_off_requests_reviewed_by_fkey(id, full_name)
      `);
  }, [supabase]);

  // Fetch current user's requests
  const fetchMyRequests = useCallback(async (): Promise<TimeOffRequestWithProfile[]> => {
    if (!user) {
      setError("You must be logged in");
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await buildRequestQuery()
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Error fetching my time-off requests:", fetchError);
        setError(fetchError.message);
        return [];
      }

      const result = (data as TimeOffRequestWithProfile[]) || [];
      setRequests(result);
      return result;
    } catch (err) {
      console.error("Unexpected error fetching my time-off requests:", err);
      setError("An unexpected error occurred");
      return [];
    } finally {
      setLoading(false);
    }
  }, [user, buildRequestQuery]);

  // Fetch all requests, optionally filtered by status
  const fetchAllRequests = useCallback(
    async (status?: TimeOffRequestStatus): Promise<TimeOffRequestWithProfile[]> => {
      setLoading(true);
      setError(null);

      try {
        let query = buildRequestQuery()
          .order("created_at", { ascending: false });

        if (status) {
          query = query.eq("status", status);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          console.error("Error fetching all time-off requests:", fetchError);
          setError(fetchError.message);
          return [];
        }

        const result = (data as TimeOffRequestWithProfile[]) || [];
        setRequests(result);
        return result;
      } catch (err) {
        console.error("Unexpected error fetching all time-off requests:", err);
        setError("An unexpected error occurred");
        return [];
      } finally {
        setLoading(false);
      }
    },
    [buildRequestQuery]
  );

  // Fetch pending requests needing approval
  const fetchPendingRequests = useCallback(async (): Promise<TimeOffRequestWithProfile[]> => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await buildRequestQuery()
        .eq("status", "pending")
        .order("start_date", { ascending: true });

      if (fetchError) {
        console.error("Error fetching pending time-off requests:", fetchError);
        setError(fetchError.message);
        return [];
      }

      const result = (data as TimeOffRequestWithProfile[]) || [];
      setRequests(result);
      return result;
    } catch (err) {
      console.error("Unexpected error fetching pending time-off requests:", err);
      setError("An unexpected error occurred");
      return [];
    } finally {
      setLoading(false);
    }
  }, [buildRequestQuery]);

  // Submit a new time-off request
  const submitRequest = useCallback(
    async (data: CreateTimeOffRequestData): Promise<TimeOffRequest | null> => {
      if (!user || !profile) {
        setError("You must be logged in to submit time-off requests");
        return null;
      }

      try {
        const insertData = {
          user_id: user.id,
          start_date: data.start_date,
          end_date: data.end_date,
          request_type: data.request_type,
          reason: data.reason ?? null,
          status: "pending",
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newRequest, error: insertError } = await (supabase as any)
          .from("time_off_requests")
          .insert(insertData)
          .select()
          .single() as { data: TimeOffRequest | null; error: Error | null };

        if (insertError || !newRequest) {
          console.error("Error submitting time-off request:", insertError);
          setError(insertError?.message || "Failed to submit request");
          return null;
        }

        // Notify managers/supers about the new request
        const { data: managers } = await supabase
          .from("profiles")
          .select("id")
          .in("role", ["super", "superintendent", "asst_super", "foreman"])
          .neq("id", user.id) as { data: { id: string }[] | null };

        if (managers && managers.length > 0) {
          const requesterName = profile.full_name || "Someone";
          const dateRange =
            data.start_date === data.end_date
              ? data.start_date
              : `${data.start_date} - ${data.end_date}`;

          await sendNotifications(
            managers.map((m) => m.id),
            "approval_needed",
            "Time off request submitted",
            `${requesterName} requested ${data.request_type} for ${dateRange}`,
            "time_off_request",
            newRequest.id
          );
        }

        return newRequest;
      } catch (err) {
        console.error("Unexpected error submitting time-off request:", err);
        setError("Failed to submit time-off request");
        return null;
      }
    },
    [user, profile, supabase]
  );

  // Approve a time-off request (super/manager only)
  const approveRequest = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user || !profile || !isManager) {
        setError("You don't have permission to approve time-off requests");
        return false;
      }

      try {
        // Get request details for notification
        type RequestDataResult = { user_id: string; start_date: string; end_date: string; request_type: string };
        const { data: requestData } = await supabase
          .from("time_off_requests")
          .select("user_id, start_date, end_date, request_type")
          .eq("id", id)
          .single() as { data: RequestDataResult | null };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase as any)
          .from("time_off_requests")
          .update({
            status: "approved",
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("status", "pending") as { error: Error | null }; // Can only approve pending requests

        if (updateError) {
          console.error("Error approving time-off request:", updateError);
          setError(updateError.message);
          return false;
        }

        // Notify the requester
        if (requestData && requestData.user_id !== user.id) {
          const approverName = profile.full_name || "Manager";
          const dateRange =
            requestData.start_date === requestData.end_date
              ? requestData.start_date
              : `${requestData.start_date} - ${requestData.end_date}`;

          await sendNotification(
            requestData.user_id,
            "schedule_change",
            "Time off approved!",
            `${approverName} approved your ${requestData.request_type} for ${dateRange}`,
            "time_off_request",
            id
          );
        }

        // Update local state
        setRequests((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "approved" as TimeOffRequestStatus,
                  reviewed_by: user.id,
                  reviewed_at: new Date().toISOString(),
                }
              : r
          )
        );

        return true;
      } catch (err) {
        console.error("Unexpected error approving time-off request:", err);
        setError("Failed to approve time-off request");
        return false;
      }
    },
    [user, profile, isManager, supabase]
  );

  // Deny a time-off request (super/manager only)
  const denyRequest = useCallback(
    async (id: string, reason?: string): Promise<boolean> => {
      if (!user || !profile || !isManager) {
        setError("You don't have permission to deny time-off requests");
        return false;
      }

      try {
        // Get request details for notification
        type DenyRequestDataResult = { user_id: string; start_date: string; end_date: string; request_type: string };
        const { data: requestData } = await supabase
          .from("time_off_requests")
          .select("user_id, start_date, end_date, request_type")
          .eq("id", id)
          .single() as { data: DenyRequestDataResult | null };

        const updateData: Record<string, unknown> = {
          status: "denied",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        };

        if (reason) {
          updateData.notes = reason;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase as any)
          .from("time_off_requests")
          .update(updateData)
          .eq("id", id)
          .eq("status", "pending") as { error: Error | null }; // Can only deny pending requests

        if (updateError) {
          console.error("Error denying time-off request:", updateError);
          setError(updateError.message);
          return false;
        }

        // Notify the requester
        if (requestData && requestData.user_id !== user.id) {
          const denierName = profile.full_name || "Manager";
          const dateRange =
            requestData.start_date === requestData.end_date
              ? requestData.start_date
              : `${requestData.start_date} - ${requestData.end_date}`;

          await sendNotification(
            requestData.user_id,
            "alert",
            "Time off request denied",
            `${denierName} denied your ${requestData.request_type} for ${dateRange}${reason ? `: ${reason}` : ""}`,
            "time_off_request",
            id
          );
        }

        // Update local state
        setRequests((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "denied" as TimeOffRequestStatus,
                  reviewed_by: user.id,
                  reviewed_at: new Date().toISOString(),
                  notes: reason ?? r.notes,
                }
              : r
          )
        );

        return true;
      } catch (err) {
        console.error("Unexpected error denying time-off request:", err);
        setError("Failed to deny time-off request");
        return false;
      }
    },
    [user, profile, isManager, supabase]
  );

  // Cancel own pending request
  const cancelRequest = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) {
        setError("You must be logged in");
        return false;
      }

      try {
        // First verify the request belongs to the user and is pending
        type CancelRequestResult = { id: string; user_id: string; status: string };
        const { data: request, error: fetchError } = await supabase
          .from("time_off_requests")
          .select("id, user_id, status")
          .eq("id", id)
          .single() as { data: CancelRequestResult | null; error: Error | null };

        if (fetchError || !request) {
          setError("Request not found");
          return false;
        }

        if (request.user_id !== user.id) {
          setError("You can only cancel your own requests");
          return false;
        }

        if (request.status !== "pending") {
          setError("You can only cancel pending requests");
          return false;
        }

        // Delete the request
        const { error: deleteError } = await supabase
          .from("time_off_requests")
          .delete()
          .eq("id", id) as { error: Error | null };

        if (deleteError) {
          console.error("Error canceling time-off request:", deleteError);
          setError(deleteError.message);
          return false;
        }

        // Update local state
        setRequests((prev) => prev.filter((r) => r.id !== id));

        return true;
      } catch (err) {
        console.error("Unexpected error canceling time-off request:", err);
        setError("Failed to cancel time-off request");
        return false;
      }
    },
    [user, supabase]
  );

  // Check how many staff are already off during a date range
  const getConflicts = useCallback(
    async (startDate: string, endDate: string): Promise<DateRangeConflict[]> => {
      try {
        // Fetch all approved time-off requests that overlap with the date range
        type ConflictResult = {
          id: string;
          user_id: string;
          start_date: string;
          end_date: string;
          profile: Pick<Profile, "id" | "full_name" | "display_name"> | null;
        };
        const { data, error: fetchError } = await supabase
          .from("time_off_requests")
          .select(`
            id,
            user_id,
            start_date,
            end_date,
            profile:profiles!time_off_requests_user_id_fkey(id, full_name, display_name)
          `)
          .eq("status", "approved")
          .lte("start_date", endDate) // Starts before or on end date
          .gte("end_date", startDate) as { data: ConflictResult[] | null; error: Error | null }; // Ends on or after start date

        if (fetchError) {
          console.error("Error fetching conflicts:", fetchError);
          setError(fetchError.message);
          return [];
        }

        if (!data || data.length === 0) {
          return [];
        }

        // Build a map of date -> users off
        const dateMap = new Map<
          string,
          Array<{ id: string; name: string }>
        >();

        const allDates = getDateRange(startDate, endDate);

        // Initialize all dates
        for (const date of allDates) {
          dateMap.set(date, []);
        }

        // Add users to each date they're off
        for (const request of data) {
          const requestDates = getDateRange(request.start_date, request.end_date);
          const profile = request.profile as Pick<Profile, "id" | "full_name" | "display_name"> | null;
          const userName = profile?.display_name || profile?.full_name || "Unknown";

          for (const date of requestDates) {
            if (dateMap.has(date)) {
              const users = dateMap.get(date)!;
              // Avoid duplicates
              if (!users.some((u) => u.id === request.user_id)) {
                users.push({
                  id: request.user_id,
                  name: userName,
                });
              }
            }
          }
        }

        // Convert to array format, only include dates with conflicts
        const conflicts: DateRangeConflict[] = [];
        for (const [date, users] of dateMap) {
          if (users.length > 0) {
            conflicts.push({
              date,
              count: users.length,
              users,
            });
          }
        }

        // Sort by date
        conflicts.sort((a, b) => a.date.localeCompare(b.date));

        return conflicts;
      } catch (err) {
        console.error("Unexpected error getting conflicts:", err);
        setError("Failed to check conflicts");
        return [];
      }
    },
    [supabase]
  );

  return {
    requests,
    loading,
    error,
    fetchMyRequests,
    fetchAllRequests,
    fetchPendingRequests,
    submitRequest,
    approveRequest,
    denyRequest,
    cancelRequest,
    getConflicts,
  };
}

// Time-off request type display labels
export const timeOffTypeLabels: Record<TimeOffRequestType, string> = {
  vacation: "Vacation",
  sick: "Sick Leave",
  personal: "Personal",
  military: "Military",
  other: "Other",
};

// Time-off request type colors for UI
export const timeOffTypeColors: Record<TimeOffRequestType, { bg: string; text: string }> = {
  vacation: { bg: "bg-blue-500/10", text: "text-blue-600" },
  sick: { bg: "bg-red-500/10", text: "text-red-600" },
  personal: { bg: "bg-purple-500/10", text: "text-purple-600" },
  military: { bg: "bg-green-500/10", text: "text-green-600" },
  other: { bg: "bg-gray-500/10", text: "text-gray-600" },
};

// Time-off request status display labels
export const timeOffStatusLabels: Record<TimeOffRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
};

// Time-off request status colors for UI
export const timeOffStatusColors: Record<TimeOffRequestStatus, { bg: string; text: string }> = {
  pending: { bg: "bg-amber-500/10", text: "text-amber-600" },
  approved: { bg: "bg-green-500/10", text: "text-green-600" },
  denied: { bg: "bg-red-500/10", text: "text-red-600" },
};

// Format date range for display
export function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  const formatOptions: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

  if (startDate === endDate) {
    return start.toLocaleDateString("en-US", { ...formatOptions, year: "numeric" });
  }

  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();

  if (sameMonth) {
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.getDate()}, ${end.getFullYear()}`;
  }

  if (sameYear) {
    return `${start.toLocaleDateString("en-US", formatOptions)} - ${end.toLocaleDateString("en-US", { ...formatOptions, year: "numeric" })}`;
  }

  return `${start.toLocaleDateString("en-US", { ...formatOptions, year: "numeric" })} - ${end.toLocaleDateString("en-US", { ...formatOptions, year: "numeric" })}`;
}

// Calculate number of days in a request
export function calculateDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
}
