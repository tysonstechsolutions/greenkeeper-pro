"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Loader2,
  ArrowLeft,
  Filter,
  CheckSquare,
  MessageSquare,
  AlertTriangle,
  Calendar,
  Clock,
  Cloud,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton-card";
import {
  useNotifications,
  formatTimeAgo,
  type NotificationWithDetails,
} from "@/lib/hooks/useNotifications";
import { notificationToUrl } from "@/lib/utils/notification-url";
import type { NotificationType } from "@/types/database";
import { cn } from "@/lib/utils";

// Filter options
type FilterType = "all" | "unread" | NotificationType;

const filterOptions: { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "task_assigned", label: "Tasks Assigned" },
  { value: "task_completed", label: "Tasks Completed" },
  { value: "message", label: "Messages" },
  { value: "alert", label: "Alerts" },
  { value: "schedule_change", label: "Schedule" },
  { value: "approval_needed", label: "Approvals" },
  { value: "weather", label: "Weather" },
  { value: "equipment", label: "Equipment" },
  { value: "reminder", label: "Reminders" },
];

// Notification type icons
const notificationIcons: Record<NotificationType, React.ReactNode> = {
  task_assigned: <CheckSquare className="w-5 h-5 text-blue-500" />,
  task_completed: <Check className="w-5 h-5 text-green-500" />,
  message: <MessageSquare className="w-5 h-5 text-purple-500" />,
  alert: <AlertTriangle className="w-5 h-5 text-red-500" />,
  schedule_change: <Calendar className="w-5 h-5 text-amber-500" />,
  approval_needed: <Clock className="w-5 h-5 text-orange-500" />,
  weather: <Cloud className="w-5 h-5 text-sky-500" />,
  equipment: <Wrench className="w-5 h-5 text-gray-500" />,
  reminder: <Bell className="w-5 h-5 text-indigo-500" />,
};

// Notification type backgrounds
const notificationBgs: Record<NotificationType, string> = {
  task_assigned: "bg-blue-500/10",
  task_completed: "bg-green-500/10",
  message: "bg-purple-500/10",
  alert: "bg-red-500/10",
  schedule_change: "bg-amber-500/10",
  approval_needed: "bg-orange-500/10",
  weather: "bg-sky-500/10",
  equipment: "bg-gray-500/10",
  reminder: "bg-indigo-500/10",
};

export default function NotificationsPage() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  const [filter, setFilter] = useState<FilterType>("all");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    await Promise.all([fetchNotifications(100), fetchUnreadCount()]);
  }, [fetchNotifications, fetchUnreadCount]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Filter notifications
  const filteredNotifications = notifications.filter((n) => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.is_read;
    return n.notification_type === filter;
  });

  // Group notifications by date
  const groupedNotifications = filteredNotifications.reduce(
    (groups, notification) => {
      const date = new Date(notification.created_at);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let key: string;
      if (date.toDateString() === today.toDateString()) {
        key = "Today";
      } else if (date.toDateString() === yesterday.toDateString()) {
        key = "Yesterday";
      } else if (date > new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)) {
        key = "This Week";
      } else {
        key = "Earlier";
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(notification);
      return groups;
    },
    {} as Record<string, NotificationWithDetails[]>
  );

  const handleMarkAllAsRead = async () => {
    setMarkingAll(true);
    await markAllAsRead();
    setMarkingAll(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await deleteNotification(id);
    setDeletingId(null);
  };

  const handleNotificationClick = async (notification: NotificationWithDetails) => {
    // Mark as read
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }

    // Navigate based on reference — shared helper keeps this in sync with
    // the header dropdown and the web push click target.
    router.push(notificationToUrl(notification));
  };

  const groupOrder = ["Today", "Yesterday", "This Week", "Earlier"];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => router.back()}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Notifications</h1>
              <p className="text-sm text-muted-foreground">
                {unreadCount > 0
                  ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
                  : "All caught up!"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter button */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setShowFilterMenu(!showFilterMenu)}
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {filterOptions.find((f) => f.value === filter)?.label}
                </span>
              </Button>

              {showFilterMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-card rounded-lg border border-border shadow-lg z-50 py-1">
                  {filterOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setFilter(option.value);
                        setShowFilterMenu(false);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors",
                        filter === option.value && "bg-muted font-medium"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mark all as read */}
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleMarkAllAsRead}
                disabled={markingAll}
              >
                {markingAll ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCheck className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Mark all read</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Notifications list */}
      <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
        {loading && notifications.length === 0 ? (
          <div className="p-4">
            <SkeletonList count={5} variant="message" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Bell className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-1">No notifications</h3>
            <p className="text-muted-foreground text-center text-sm">
              {filter === "all"
                ? "You don't have any notifications yet."
                : filter === "unread"
                ? "You've read all your notifications!"
                : `No ${filterOptions.find((f) => f.value === filter)?.label.toLowerCase()} notifications.`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {groupOrder.map((group) => {
              const groupNotifications = groupedNotifications[group];
              if (!groupNotifications || groupNotifications.length === 0) return null;

              return (
                <div key={group}>
                  {/* Group header */}
                  <div className="sticky top-0 bg-muted/50 px-4 py-2 backdrop-blur-sm">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      {group}
                    </h2>
                  </div>

                  {/* Group notifications */}
                  <div className="divide-y divide-border">
                    {groupNotifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={cn(
                          "relative group",
                          !notification.is_read && "bg-primary/5"
                        )}
                      >
                        <button
                          onClick={() => handleNotificationClick(notification)}
                          className="w-full text-left px-4 py-4 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex gap-4">
                            {/* Icon */}
                            <div
                              className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                                notificationBgs[notification.notification_type]
                              )}
                            >
                              {notificationIcons[notification.notification_type]}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 pr-8">
                              <div className="flex items-start justify-between gap-2">
                                <p
                                  className={cn(
                                    "text-sm",
                                    !notification.is_read
                                      ? "font-semibold"
                                      : "font-medium"
                                  )}
                                >
                                  {notification.title}
                                </p>
                                {!notification.is_read && (
                                  <span className="w-2 h-2 bg-primary rounded-full shrink-0 mt-1.5" />
                                )}
                              </div>
                              {notification.body && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {notification.body}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-2">
                                {formatTimeAgo(notification.created_at)}
                              </p>
                            </div>
                          </div>
                        </button>

                        {/* Actions */}
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!notification.is_read && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsRead(notification.id);
                              }}
                              title="Mark as read"
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(notification.id);
                            }}
                            disabled={deletingId === notification.id}
                            title="Delete notification"
                          >
                            {deletingId === notification.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
