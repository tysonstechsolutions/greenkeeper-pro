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
  Loader2,
  Calendar,
  CheckSquare,
  MessageSquare,
  AlertTriangle,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudSun,
  CloudFog,
  CloudLightning,
  Wrench,
  Clock,
  Wind,
  Leaf,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import { useWeather } from "@/lib/hooks/useWeather";
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

function getWeatherIcon(condition: string, className: string = "w-4 h-4") {
  const c = condition.toLowerCase();
  if (c.includes("thunder") || c.includes("lightning")) return <CloudLightning className={className} />;
  if (c.includes("snow") || c.includes("sleet") || c.includes("ice")) return <CloudSnow className={className} />;
  if (c.includes("rain") || c.includes("drizzle") || c.includes("shower")) return <CloudRain className={className} />;
  if (c.includes("fog") || c.includes("mist") || c.includes("haze")) return <CloudFog className={className} />;
  if (c.includes("cloud") || c.includes("overcast")) {
    if (c.includes("partly") || c.includes("partial")) return <CloudSun className={className} />;
    return <Cloud className={className} />;
  }
  if (c.includes("sunny") || c.includes("clear")) return <Sun className={className} />;
  return <CloudSun className={className} />;
}

export function Header() {
  const router = useRouter();
  const { profile, signOut, canCreateInvites, loading } = useAuth();
  const { currentWeather, getAlerts } = useWeather();
  const weatherAlerts = getAlerts();
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

  const loadNotifications = useCallback(async () => {
    await Promise.all([fetchNotifications(20), fetchUnreadCount()]);
  }, [fetchNotifications, fetchUnreadCount]);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
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
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
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
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 bg-background/80 backdrop-blur-md border-b border-border/60">
      {/* Left: Mobile logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 md:hidden">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#B68D40] to-[#D4A853] flex items-center justify-center shadow-sm">
            <Leaf className="w-4 h-4 text-[#1B4332]" />
          </div>
          <span className="font-bold text-foreground text-sm tracking-tight">GreenKeeper</span>
        </div>
      </div>

      {/* Right: Weather + Notifications + Profile */}
      <div className="flex items-center gap-1.5">
        {/* Live Weather — uses real data from useWeather hook */}
        {currentWeather ? (
          <Link
            href="/weather"
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 hover:bg-muted transition-colors text-sm group"
          >
            <span className="text-[#B68D40]">
              {getWeatherIcon(currentWeather.conditions, "w-4 h-4")}
            </span>
            <span className="font-semibold text-foreground">
              {Math.round(currentWeather.temp_f)}°F
            </span>
            <span className="text-muted-foreground text-xs hidden lg:inline">
              {currentWeather.conditions}
            </span>
            {currentWeather.wind_mph > 0 && (
              <span className="text-muted-foreground text-xs hidden xl:flex items-center gap-0.5">
                <Wind className="w-3 h-3" />
                {Math.round(currentWeather.wind_mph)}
              </span>
            )}
            {weatherAlerts && weatherAlerts.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            )}
          </Link>
        ) : (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 text-sm">
            <Cloud className="w-4 h-4 text-muted-foreground animate-pulse" />
            <span className="text-muted-foreground text-xs">Loading...</span>
          </div>
        )}

        {/* Notifications */}
        <div className="relative" ref={notificationsRef}>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 rounded-full"
            onClick={() => {
              setNotificationsOpen(!notificationsOpen);
              setMenuOpen(false);
            }}
          >
            <Bell className="w-[18px] h-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-background">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
            <span className="sr-only">Notifications</span>
          </Button>

          {/* Notifications Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-card rounded-xl border border-border shadow-xl shadow-black/8 z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <h3 className="font-semibold text-sm">Notifications</h3>
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

              <div className="max-h-96 overflow-y-auto">
                {notificationsLoading && notifications.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <Bell className="w-10 h-10 mb-2 opacity-30" />
                    <p className="text-sm">No notifications</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {notifications.map((notification) => (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
                          !notification.is_read ? "bg-primary/[0.03]" : ""
                        }`}
                      >
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                            {notificationIcons[notification.notification_type]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-sm ${!notification.is_read ? "font-semibold" : "font-medium"}`}>
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

              {notifications.length > 0 && (
                <div className="border-t border-border px-4 py-2.5 bg-muted/20">
                  <Link
                    href="/notifications"
                    onClick={() => setNotificationsOpen(false)}
                    className="block text-center text-xs font-medium text-primary hover:underline"
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
            className="flex items-center gap-2 p-1 rounded-full hover:bg-muted/60 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] flex items-center justify-center ring-2 ring-[#B68D40]/20">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name || "User"}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <span className="text-white font-semibold text-xs">
                  {loading ? ".." : getInitials(profile?.full_name)}
                </span>
              )}
            </div>
            <div className="hidden sm:block text-left max-w-[120px]">
              <div className="text-sm font-medium leading-tight truncate">
                {loading ? "Loading..." : profile?.full_name || "User"}
              </div>
              <div className="text-[11px] text-muted-foreground leading-tight truncate">
                {profile?.role ? roleLabels[profile.role] || profile.role : ""}
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden sm:block" />
          </button>

          {/* Dropdown Menu */}
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-card rounded-xl border border-border shadow-xl shadow-black/8 py-1 z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border sm:hidden">
                <div className="font-medium">{profile?.full_name || "User"}</div>
                <div className="text-sm text-muted-foreground">
                  {profile?.role ? roleLabels[profile.role] || profile.role : ""}
                </div>
              </div>

              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
                Settings
              </Link>

              {canCreateInvites && (
                <Link
                  href="/settings/invite"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors"
                >
                  <UserPlus className="w-4 h-4 text-muted-foreground" />
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
