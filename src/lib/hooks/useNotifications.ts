"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./useAuth";
import { notificationToUrl } from "@/lib/utils/notification-url";
import type { Notification, NotificationType, Database } from "@/types/database";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

// TODO(#4): Batch push-mirror send — currently createNotification fires one
// /api/push/send per notification. A server action should accept a batch and
// call sendPushToUsers once to reduce HTTP overhead on multi-recipient flows.
// TODO(#5): Wire standalone sendNotification/sendNotifications (below) to
// trigger the push mirror too; right now only the hook's createNotification
// does so, creating a silent gap for callers that use the standalone utils.
// TODO(#8): Redact user/push payloads in error log lines — console.warn
// currently includes raw error objects that may contain endpoint URLs.

type RealtimePayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

export type NotificationWithDetails = Notification;

interface UseNotificationsReturn {
  notifications: NotificationWithDetails[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  fetchNotifications: (limit?: number) => Promise<NotificationWithDetails[]>;
  fetchUnreadCount: () => Promise<number>;
  markAsRead: (id: string) => Promise<boolean>;
  markAllAsRead: () => Promise<boolean>;
  createNotification: (
    userId: string,
    type: NotificationType,
    title: string,
    body?: string,
    referenceType?: string,
    referenceId?: string
  ) => Promise<Notification | null>;
  deleteNotification: (id: string) => Promise<boolean>;
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<NotificationWithDetails[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const supabase = createClient();
  const subscription = useRef<RealtimeChannel | null>(null);

  // Fetch notifications for the current user
  const fetchNotifications = useCallback(
    async (limit = 20): Promise<NotificationWithDetails[]> => {
      if (!user) {
        setError("You must be logged in");
        return [];
      }

      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (fetchError) {
          console.error("Error fetching notifications:", fetchError);
          setError(fetchError.message);
          return [];
        }

        const result = (data as NotificationWithDetails[]) || [];
        setNotifications(result);
        return result;
      } catch (err) {
        console.error("Unexpected error fetching notifications:", err);
        setError("An unexpected error occurred");
        return [];
      } finally {
        setLoading(false);
      }
    },
    [user, supabase]
  );

  // Fetch unread count
  const fetchUnreadCount = useCallback(async (): Promise<number> => {
    if (!user) return 0;

    try {
      const { count, error: countError } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (countError) {
        console.error("Error fetching unread count:", countError);
        return 0;
      }

      const unread = count ?? 0;
      setUnreadCount(unread);
      return unread;
    } catch (err) {
      console.error("Unexpected error fetching unread count:", err);
      return 0;
    }
  }, [user, supabase]);

  // Mark a notification as read
  const markAsRead = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) {
        setError("You must be logged in");
        return false;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase as any)
          .from("notifications")
          .update({ is_read: true })
          .eq("id", id)
          .eq("user_id", user.id) as { error: Error | null };

        if (updateError) {
          console.error("Error marking notification as read:", updateError);
          setError(updateError.message);
          return false;
        }

        // Update local state
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));

        return true;
      } catch (err) {
        console.error("Unexpected error marking notification as read:", err);
        setError("Failed to mark notification as read");
        return false;
      }
    },
    [user, supabase]
  );

  // Mark all notifications as read
  const markAllAsRead = useCallback(async (): Promise<boolean> => {
    if (!user) {
      setError("You must be logged in");
      return false;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false) as { error: Error | null };

      if (updateError) {
        console.error("Error marking all notifications as read:", updateError);
        setError(updateError.message);
        return false;
      }

      // Update local state
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);

      return true;
    } catch (err) {
      console.error("Unexpected error marking all as read:", err);
      setError("Failed to mark all notifications as read");
      return false;
    }
  }, [user, supabase]);

  // Create a notification for another user
  const createNotification = useCallback(
    async (
      userId: string,
      type: NotificationType,
      title: string,
      body?: string,
      referenceType?: string,
      referenceId?: string
    ): Promise<Notification | null> => {
      try {
        const insertData = {
          user_id: userId,
          notification_type: type,
          title,
          body: body ?? null,
          reference_type: referenceType ?? null,
          reference_id: referenceId ?? null,
          is_read: false,
          push_sent: false,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: insertError } = await (supabase as any)
          .from("notifications")
          .insert(insertData)
          .select()
          .single() as { data: Notification | null; error: Error | null };

        if (insertError) {
          console.error("Error creating notification:", insertError);
          setError(insertError.message);
          return null;
        }

        // Mirror: fire-and-forget web push so the recipient's phone lights up.
        // Wrapped in try/catch so a push failure never blocks the DB insert.
        try {
          // Use the shared helper so the push-click target matches the in-app
          // route (e.g. /tasks/:id, not /task/:id which would 404).
          const pushUrl = notificationToUrl({
            reference_type: referenceType ?? null,
            reference_id: referenceId ?? null,
          });
          void fetch("/api/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_ids: [userId],
              title,
              body: body ?? "",
              url: pushUrl,
            }),
          }).catch((err) => {
            console.warn("Push mirror failed (non-fatal):", err);
          });
        } catch (pushErr) {
          console.warn("Push mirror threw (non-fatal):", pushErr);
        }

        return data;
      } catch (err) {
        console.error("Unexpected error creating notification:", err);
        setError("Failed to create notification");
        return null;
      }
    },
    [supabase]
  );

  // Delete a notification
  const deleteNotification = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) {
        setError("You must be logged in");
        return false;
      }

      try {
        const notification = notifications.find((n) => n.id === id);
        const wasUnread = notification && !notification.is_read;

        const { error: deleteError } = await supabase
          .from("notifications")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);

        if (deleteError) {
          console.error("Error deleting notification:", deleteError);
          setError(deleteError.message);
          return false;
        }

        // Update local state
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        if (wasUnread) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }

        return true;
      } catch (err) {
        console.error("Unexpected error deleting notification:", err);
        setError("Failed to delete notification");
        return false;
      }
    },
    [user, supabase, notifications]
  );

  // Set up realtime subscription for notifications
  useEffect(() => {
    if (!user) return;

    // Subscribe to notifications for this user
    subscription.current = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: RealtimePayload) => {
          const newNotification = payload.new as Notification;

          // Add to the beginning of the list
          setNotifications((prev) => {
            // Check if we already have this notification
            if (prev.some((n) => n.id === newNotification.id)) {
              return prev;
            }
            return [newNotification, ...prev];
          });

          // Increment unread count if not read
          if (!newNotification.is_read) {
            setUnreadCount((prev) => prev + 1);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: RealtimePayload) => {
          const updatedNotification = payload.new as Notification;

          setNotifications((prev) =>
            prev.map((n) =>
              n.id === updatedNotification.id ? updatedNotification : n
            )
          );

          // Recalculate unread count
          fetchUnreadCount();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: RealtimePayload) => {
          const deletedNotification = payload.old as { id: string; is_read: boolean };

          setNotifications((prev) =>
            prev.filter((n) => n.id !== deletedNotification.id)
          );

          // Decrement unread if it was unread
          if (!deletedNotification.is_read) {
            setUnreadCount((prev) => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe();

    // Cleanup on unmount
    return () => {
      if (subscription.current) {
        supabase.removeChannel(subscription.current);
      }
    };
  }, [user, supabase, fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    createNotification,
    deleteNotification,
  };
}

// Notification type icons and colors
export const notificationTypeConfig: Record<
  NotificationType,
  { icon: string; bg: string; text: string }
> = {
  task_assigned: { icon: "📋", bg: "bg-blue-500/10", text: "text-blue-600" },
  task_completed: { icon: "✅", bg: "bg-green-500/10", text: "text-green-600" },
  message: { icon: "💬", bg: "bg-purple-500/10", text: "text-purple-600" },
  alert: { icon: "🚨", bg: "bg-red-500/10", text: "text-red-600" },
  schedule_change: { icon: "📅", bg: "bg-amber-500/10", text: "text-amber-600" },
  approval_needed: { icon: "⏳", bg: "bg-orange-500/10", text: "text-orange-600" },
  weather: { icon: "🌦️", bg: "bg-sky-500/10", text: "text-sky-600" },
  equipment: { icon: "🔧", bg: "bg-gray-500/10", text: "text-gray-600" },
  reminder: { icon: "⏰", bg: "bg-indigo-500/10", text: "text-indigo-600" },
};

// Format notification time ago
export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Standalone utility to send a notification (can be used outside the hook)
export async function sendNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body?: string,
  referenceType?: string,
  referenceId?: string
): Promise<Notification | null> {
  const supabase = createClient();

  try {
    const insertData = {
      user_id: userId,
      notification_type: type,
      title,
      body: body ?? null,
      reference_type: referenceType ?? null,
      reference_id: referenceId ?? null,
      is_read: false,
      push_sent: false,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: insertError } = await (supabase as any)
      .from("notifications")
      .insert(insertData)
      .select()
      .single() as { data: Notification | null; error: Error | null };

    if (insertError) {
      console.error("Error sending notification:", insertError);
      return null;
    }

    return data;
  } catch (err) {
    console.error("Unexpected error sending notification:", err);
    return null;
  }
}

// Batch send notifications to multiple users
export async function sendNotifications(
  userIds: string[],
  type: NotificationType,
  title: string,
  body?: string,
  referenceType?: string,
  referenceId?: string
): Promise<boolean> {
  if (userIds.length === 0) return true;

  const supabase = createClient();

  try {
    const notifications = userIds.map((userId) => ({
      user_id: userId,
      notification_type: type,
      title,
      body: body ?? null,
      reference_type: referenceType ?? null,
      reference_id: referenceId ?? null,
      is_read: false,
      push_sent: false,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any)
      .from("notifications")
      .insert(notifications) as { error: Error | null };

    if (insertError) {
      console.error("Error sending notifications:", insertError);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Unexpected error sending notifications:", err);
    return false;
  }
}
