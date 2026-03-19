"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  Sun,
  LogOut,
  Settings,
  UserPlus,
  ChevronDown,
  Check,
  X,
  Loader2,
  Calendar,
  CheckSquare,
  MessageSquare,
  AlertTriangle,
  Cloud,
  Wrench,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  useNotifications,
  formatTimeAgo,
  type NotificationWithDetails,
} from "@/lib/hooks/useNotifications";
import type { NotificationType } from "@/types/database";

const roleLabels: Record<string, string> = {
  super: "Superintendent",
  asst_super: "Asst. Superintendent",
  foreman: "Foreman",
  mechanic: "Mechanic",
  crew: "Crew Member",
  seasonal: "Seasonal",
};

// Notification type icons
const notificationIcons: Record<NotificationType, React.ReactNode> = {
  task_assigned: <CheckSquare className="w-4 h-4 text-blue-500" />,
  task_completed: <Check className="w-4 h-4 text-green-500" />,
  message: <MessageSquare className="w-4 h-4 text-purple-500" />,
  alert: <AlertTriangle className="w-4 h-4 text-red-500" />,
  schedule_change: <Calendar className="w-4 h-4 text-amber-500" />,
  approval_needed: <Clock className="w-4 h-4 text-orange-500" />,
  weather: <Cloud className="w-4 h-4 text-sky-500" />,
  equipment: <Wrench className="w-4 h-4 text-gray-500" />,
  reminder: <Bell className="w-4 h-4 text-indigo-500" />,
};

export function Header() {
  const router = useRouter();
  const { profile, signOut, canCreateInvites, loading } = useAuth();
  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    await Promise.all([fetchNotifications(20), fetchUnreadCount()]);
  }, [fetchNotifications, fetchUnreadCount]);

  // Load on mount and periodically
  useEffect(() => {
    loadNotifications();

    // Refresh every 60 seconds
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  const handleMarkAllAsRead = async () => {
    setMarkingAll(true);
    await markAllAsRead();
    setMarkingAll(false);
  };

  const handleNotificationClick = async (notification: NotificationWithDetails) => {
    // Mark as read
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }

    // Navigate based on reference
    if (notification.reference_type === "time_off_request") {
      router.push("/schedule/time-off");
      setNotificationsOpen(false);
    } else if (notification.reference_type === "task" && notification.reference_id) {
      router.push(`/tasks/${notification.reference_id}`);
      setNotificationsOpen(false);
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-16 px-4 bg-background border-b border-border">
      {/* Left: Page title / breadcrumb area */}
      <div className="flex items-center gap-4">
        {/* Mobile logo - shown only on mobile where sidebar is hidden */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">GK</span>
          </div>
          <span className="font-semibold text-foreground">GreenKeeper</span>
        </div>
      </div>

      {/* Right: Weather, notifications, profile */}
      <div className="flex items-center gap-2">
        {/* Weather widget placeholder */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-sm">
          <Sun className="w-4 h-4 text-accent" />
          <span className="font-medium">72°F</span>
          <span className="text-muted-foreground">Sunny</span>
        </div>

        {/* Notifications */}
        <div className="relative" ref={notificationsRef}>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => {
              setNotificationsOpen(!notificationsOpen);
              setMenuOpen(false);
            }}
          >
            <Bell className="w-5 h-5" />
            {/* Notification badge */}
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-xs font-medium rounded-full flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
            <span className="sr-only">Notifications</span>
          </Button>

          {/* Notifications Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-card rounded-lg border border-border shadow-lg z-50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="font-semibold">Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    disabled={markingAll}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    {markingAll ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    Mark all read
                  </button>
                )}
              </div>

              {/* Notifications list */}
              <div className="max-h-96 overflow-y-auto">
                {notificationsLoading && notifications.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Bell className="w-10 h-10 mb-2 opacity-50" />
                    <p className="text-sm">No notifications</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {notifications.map((notification) => (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
                          !notification.is_read ? "bg-primary/5" : ""
                        }`}
                      >
                        <div className="flex gap-3">
                          {/* Icon */}
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                            {notificationIcons[notification.notification_type]}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p
                                className={`text-sm ${
                                  !notification.is_read
                                    ? "font-semibold"
                                    : "font-medium"
                                }`}
                              >
                                {notification.title}
                              </p>
                              {!notification.is_read && (
                                <span className="w-2 h-2 bg-primary rounded-full shrink-0 mt-1.5" />
                              )}
                            </div>
                            {notification.body && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {notification.body}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatTimeAgo(notification.created_at)}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="border-t border-border px-4 py-2">
                  <Link
                    href="/notifications"
                    onClick={() => setNotificationsOpen(false)}
                    className="block text-center text-sm text-primary hover:underline"
                  >
                    View all notifications
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => {
              setMenuOpen(!menuOpen);
              setNotificationsOpen(false);
            }}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name || "User"}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <span className="text-primary-foreground font-medium text-sm">
                  {loading ? "..." : getInitials(profile?.full_name)}
                </span>
              )}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-sm font-medium leading-tight">
                {loading ? "Loading..." : profile?.full_name || "User"}
              </div>
              <div className="text-xs text-muted-foreground leading-tight">
                {profile?.role ? roleLabels[profile.role] || profile.role : ""}
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground hidden sm:block" />
          </button>

          {/* Dropdown Menu */}
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-card rounded-lg border border-border shadow-lg py-1 z-50">
              {/* User info in dropdown */}
              <div className="px-4 py-3 border-b border-border sm:hidden">
                <div className="font-medium">{profile?.full_name || "User"}</div>
                <div className="text-sm text-muted-foreground">
                  {profile?.role ? roleLabels[profile.role] || profile.role : ""}
                </div>
              </div>

              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
              >
                <Settings className="w-4 h-4" />
                Settings
              </Link>

              {canCreateInvites && (
                <Link
                  href="/settings/invite"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  Invite Team Members
                </Link>
              )}

              <div className="border-t border-border my-1" />

              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors w-full text-left"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
