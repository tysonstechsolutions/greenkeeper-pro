"use client";

import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  Settings,
  ChevronDown,
  ChevronLeft,
  Check,
  Loader2,
  Calendar,
  CheckSquare,
  MessageSquare,
  AlertTriangle,
  Cloud,
  Wrench,
  Clock,
  Wind,
  Search,
} from "lucide-react";
import { getPageTitle, stripTrailingSlash } from "@/lib/utils/page-title";
import { Button } from "@/components/ui/button";
import { WeatherIcon } from "@/components/ui/weather-icon";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/hooks/useAuth";
import { roleLabels, getInitials } from "@/lib/hooks/useProfiles";
import { useWeather } from "@/lib/hooks/useWeather";
import {
  useNotifications,
  formatTimeAgo,
  type NotificationWithDetails,
} from "@/lib/hooks/useNotifications";
import { notificationToUrl } from "@/lib/utils/notification-url";
import { useScrollDirection } from "@/lib/hooks/useScrollDirection";
import { APP_CONFIG } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { NotificationType } from "@/types/database";

const notificationIcons: Record<NotificationType, React.ReactNode> = {
  task_assigned: <CheckSquare className="w-4 h-4 text-blue-500" />,
  task_completed: <Check className="w-4 h-4 text-green-500" />,
  message: <MessageSquare className="w-4 h-4 text-purple-500" />,
  alert: <AlertTriangle className="w-4 h-4 text-red-500" />,
  schedule_change: <Calendar className="w-4 h-4 text-amber-500" />,
  approval_needed: <Clock className="w-4 h-4 text-orange-500" />,
  weather: <Cloud className="w-4 h-4 text-sky-500" />,
  equipment: <Wrench className="w-4 h-4 text-muted-foreground" />,
  reminder: <Bell className="w-4 h-4 text-indigo-500" />,
};

// Notification polling interval — sourced from shared config
const NOTIFICATION_POLL_INTERVAL = APP_CONFIG.notificationPollInterval;

interface HeaderProps {
  /** Opens the global search palette (⌘K). Wired from AppShell. */
  onOpenSearch?: () => void;
}

export function Header({ onOpenSearch }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, loading, refreshProfile } = useAuth();
  const { currentWeather, getAlerts, error: weatherError } = useWeather();
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
  const scrollDirection = useScrollDirection();

  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [langPending, startLangTransition] = useTransition();

  const menuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Load notifications with error swallowing — never let this crash the header
  const loadNotifications = useCallback(async () => {
    try {
      await Promise.all([fetchNotifications(20), fetchUnreadCount()]);
    } catch {
      // Silently fail — notifications are non-critical
      console.warn("[Header] Failed to fetch notifications, will retry next interval");
    }
  }, [fetchNotifications, fetchUnreadCount]);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, NOTIFICATION_POLL_INTERVAL);
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

  const handleMarkAllAsRead = async () => {
    setMarkingAll(true);
    try {
      await markAllAsRead();
    } catch {
      // Fail silently
    }
    setMarkingAll(false);
  };

  const handleToggleLanguage = () => {
    if (!profile) return;
    const newLang = profile.language_preference === "es" ? "en" : "es";
    startLangTransition(async () => {
      const supabase = createClient();
      await supabase
        .from("profiles")
        .update({ language_preference: newLang })
        .eq("id", profile.id);
      await refreshProfile();
    });
  };

  const currentLang = profile?.language_preference ?? "en";

  const handleNotificationClick = async (notification: NotificationWithDetails) => {
    if (!notification.is_read) {
      // Fire and forget — don't block navigation on this
      markAsRead(notification.id).catch(() => {});
    }
    router.push(notificationToUrl(notification));
    setNotificationsOpen(false);
  };

  // Determine weather widget state
  const weatherAvailable = currentWeather !== null;
  const weatherFailed = !weatherAvailable && weatherError !== null;

  // Keep dropdowns open override: don't hide header when dropdown is open.
  // Only auto-hide on the home page — everywhere else the back button must
  // stay reachable (every page has one now, home is the only exception).
  const isDropdownOpen = menuOpen || notificationsOpen;
  const normalizedPath = stripTrailingSlash(pathname) || "/";
  const isHome = normalizedPath === "/" || normalizedPath === "/today";
  const shouldHide = isHome && scrollDirection === "down" && !isDropdownOpen;
  const pageTitle = getPageTitle(pathname);

  // History back with a home fallback so a deep link / fresh PWA launch
  // (history length 1) still has somewhere to go.
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/today");
  };

  return (
    <header
      data-app-header
      className={cn(
        // Body already applies `env(safe-area-inset-top)` so the header sits
        // below the Android status bar / notch. Header height = 56px which
        // gives the back button a comfortable 44x44 tap target.
        "sticky top-0 z-40 flex items-center justify-between h-14 px-3 md:px-4 bg-background/95 backdrop-blur-md border-b border-border/60",
        "transition-transform duration-300 ease-in-out",
        shouldHide ? "-translate-y-full md:translate-y-0" : "translate-y-0"
      )}
    >
      {/* Left: back button (every page except home) + page title */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {!isHome && (
          <button
            onClick={goBack}
            aria-label="Go back"
            className="w-11 h-11 -ml-2 flex items-center justify-center rounded-full hover:bg-muted/50 active:bg-muted/70 transition-colors shrink-0"
          >
            <ChevronLeft className="w-6 h-6 text-foreground" />
          </button>
        )}
        <span className="font-semibold text-foreground text-base tracking-tight truncate">
          {pageTitle}
        </span>
      </div>

      {/* Right: Search + Weather + Notifications + Profile */}
      <div className="flex items-center gap-1">
        {/* Global search — icon on mobile, a hint pill on desktop. Opens the
            ⌘K command palette mounted in AppShell. */}
        {onOpenSearch && (
          <>
            <button
              onClick={onOpenSearch}
              aria-label="Search"
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted/60 active:bg-muted/80 transition-colors"
            >
              <Search className="w-[18px] h-[18px] text-muted-foreground" />
            </button>
            <button
              onClick={onOpenSearch}
              className="hidden md:flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full bg-muted/60 hover:bg-muted transition-colors text-sm text-muted-foreground"
            >
              <Search className="w-4 h-4" />
              <span>Search</span>
              <kbd className="ml-1 rounded border border-border/70 bg-background/60 px-1.5 py-0.5 text-[10px] font-medium">
                ⌘K
              </kbd>
            </button>
          </>
        )}

        {/* Mobile weather — compact inline chip */}
        {weatherAvailable && (
          <Link
            href="/weather"
            className="flex md:hidden items-center gap-1 px-2 py-1 rounded-full bg-muted/60 text-xs"
          >
            <span className="text-secondary">
              <WeatherIcon condition={currentWeather.conditions} className="w-3.5 h-3.5" />
            </span>
            <span className="font-semibold text-foreground">
              {Math.round(currentWeather.temp_f)}°
            </span>
          </Link>
        )}

        {/* Desktop weather — full widget */}
        {weatherAvailable ? (
          <Link
            href="/weather"
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 hover:bg-muted transition-colors text-sm group"
          >
            <span className="text-secondary">
              <WeatherIcon condition={currentWeather.conditions} className="w-4 h-4" />
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
        ) : weatherFailed ? (
          /* Weather API failed — show a subtle link instead of "Loading..." forever */
          <Link
            href="/weather"
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 hover:bg-muted transition-colors text-sm"
          >
            <Cloud className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground text-xs">Weather</span>
          </Link>
        ) : (
          /* Still loading — show briefly, will resolve or fail */
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 text-sm">
            <Cloud className="w-4 h-4 text-muted-foreground animate-pulse" />
            <span className="text-muted-foreground text-xs">Loading...</span>
          </div>
        )}

        {/* Notifications */}
        <div className="relative" ref={notificationsRef}>
          <Button
            variant="ghost"
            size="icon"
            className="relative rounded-full"
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
            <div className="fixed right-3 left-3 sm:absolute sm:left-auto sm:right-0 mt-2 sm:w-96 bg-card rounded-xl border border-border shadow-xl shadow-black/8 z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <h3 className="font-semibold text-sm">Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    disabled={markingAll}
                    className="text-sm text-primary hover:underline flex items-center gap-1.5 py-1 px-2 -mr-2 rounded-lg active:bg-primary/10 transition-colors"
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

              <div className="max-h-[60vh] overflow-y-auto">
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
                        className={cn(
                          "w-full text-left px-4 py-3.5 hover:bg-muted/50 transition-colors",
                          "active:bg-muted/70", // Touch press feedback
                          !notification.is_read ? "bg-primary/[0.03]" : ""
                        )}
                      >
                        <div className="flex gap-3">
                          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
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
                <div className="border-t border-border px-4 py-3 bg-muted/20">
                  <Link
                    href="/notifications"
                    onClick={() => setNotificationsOpen(false)}
                    className="block text-center text-sm font-medium text-primary py-1 active:opacity-70"
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
            className="flex items-center gap-2 p-1.5 rounded-full hover:bg-muted/60 active:bg-muted/80 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-green to-brand-green-light flex items-center justify-center ring-2 ring-secondary/25">
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
                className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 active:bg-muted/70 transition-colors"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
                Settings
              </Link>

              {/* Email-based invites have been removed — managers add staff
                  manually from the /staff page using the "Add Staff" button.
                  See AddStaffSheet for the new flow. */}

              <button
                onClick={handleToggleLanguage}
                disabled={langPending}
                className="flex items-center justify-between w-full px-4 py-3 text-sm hover:bg-muted/50 active:bg-muted/70 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <span className="text-base leading-none">{currentLang === "es" ? "\uD83C\uDDF2\uD83C\uDDFD" : "\uD83C\uDDFA\uD83C\uDDF8"}</span>
                  Language
                </span>
                <span className="text-xs font-medium text-muted-foreground uppercase">{currentLang}</span>
              </button>

            </div>
          )}
        </div>
      </div>
    </header>
  );
}

