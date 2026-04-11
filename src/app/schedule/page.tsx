"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  X,
  Check,
  Trash2,
  Users,
  AlertTriangle,
  Clock,
  Loader2,
  CalendarPlus,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  useSchedule,
  type WeekScheduleByUser,
  type ScheduleEntry,
  shiftTypeLabels,
  shiftTypeColors,
  formatShiftTime,
  getWeekStart,
  formatWeekRange,
} from "@/lib/hooks/useSchedule";
import { useTimeOff, type DateRangeConflict } from "@/lib/hooks/useTimeOff";
import { getDisplayName, roleLabels } from "@/lib/hooks/useProfiles";
import type { ShiftType, UserRole } from "@/types/database";

// Tab type
type TabType = "team" | "my";

// Days of the week
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Minimum staffing threshold
const MIN_STAFFING = 5;

// Shift type options for dropdown
const shiftTypeOptions: { value: ShiftType | "off"; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "split", label: "Split" },
  { value: "full", label: "Full Day" },
  { value: "on_call", label: "On Call" },
  { value: "off", label: "Off" },
];

// Quick fill templates
const quickFillTemplates = [
  { label: "Morning 5-1", shiftType: "morning" as ShiftType, start: "05:00", end: "13:00" },
  { label: "Afternoon 12-8", shiftType: "afternoon" as ShiftType, start: "12:00", end: "20:00" },
  { label: "Full Day 6-4", shiftType: "full" as ShiftType, start: "06:00", end: "16:00" },
  { label: "Split 5-9/2-6", shiftType: "split" as ShiftType, start: "05:00", end: "18:00" },
];

// Role sort order for grouping
const roleSortOrder: Record<UserRole, number> = {
  super: 0,
  director: 1,
  asst_super: 2,
  pro: 3,
  foreman: 4,
  mechanic: 5,
  crew: 6,
  seasonal: 7,
};

// Get week dates starting from Monday
function getWeekDates(weekStartDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(weekStartDate + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date.toISOString().split("T")[0]);
  }
  return dates;
}

// Add days to a date
function addDays(dateString: string, days: number): string {
  const date = new Date(dateString + "T00:00:00");
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

// Get today's date
function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

// Format date for mobile view
function formatDayDate(dateString: string): string {
  const date = new Date(dateString + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// Check if date is today
function isToday(dateString: string): boolean {
  return dateString === getTodayString();
}

export default function SchedulePage() {
  const router = useRouter();
  const { user, profile, isManager, isSuper, loading: authLoading } = useAuth();
  const {
    fetchWeekSchedule,
    setSchedule,
    deleteSchedule,
    copyWeekSchedule,
    loading: scheduleLoading,
  } = useSchedule();
  const { getConflicts } = useTimeOff();

  // Current week state
  const [currentWeekStart, setCurrentWeekStart] = useState(getWeekStart(new Date()));
  const [weekData, setWeekData] = useState<WeekScheduleByUser[]>([]);
  const [ptoData, setPtoData] = useState<Map<string, Set<string>>>(new Map()); // date -> set of user IDs
  const [loading, setLoading] = useState(true);

  // Tab state
  const defaultTab: TabType = isManager ? "team" : "my";
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);

  // Mobile state
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDay, setMobileDay] = useState(0); // 0-6 for Mon-Sun

  // Edit state
  const [editingCell, setEditingCell] = useState<{ userId: string; date: string } | null>(null);
  const [editForm, setEditForm] = useState({
    shiftType: "morning" as ShiftType | "off",
    startTime: "05:00",
    endTime: "13:00",
    crewAssignment: "",
  });

  // Quick fill state
  const [quickFillMode, setQuickFillMode] = useState(false);
  const [quickFillTemplate, setQuickFillTemplate] = useState(quickFillTemplates[0]);

  // Copy week state
  const [copying, setCopying] = useState(false);

  // Saving state
  const [saving, setSaving] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch week data
  const loadWeekData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchWeekSchedule(currentWeekStart);

      // Sort by role
      data.sort((a, b) => {
        const aOrder = roleSortOrder[a.profile.role] ?? 99;
        const bOrder = roleSortOrder[b.profile.role] ?? 99;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.profile.full_name.localeCompare(b.profile.full_name);
      });

      setWeekData(data);

      // Fetch PTO conflicts for this week
      const weekDates = getWeekDates(currentWeekStart);
      const conflicts = await getConflicts(weekDates[0], weekDates[6]);

      // Build PTO map
      const ptoMap = new Map<string, Set<string>>();
      for (const conflict of conflicts) {
        const userIds = new Set(conflict.users.map((u) => u.id));
        ptoMap.set(conflict.date, userIds);
      }
      setPtoData(ptoMap);
    } catch (err) {
      console.error("Error loading week data:", err);
    } finally {
      setLoading(false);
    }
  }, [currentWeekStart, fetchWeekSchedule, getConflicts]);

  useEffect(() => {
    loadWeekData();
  }, [loadWeekData]);

  // Week dates
  const weekDates = useMemo(() => getWeekDates(currentWeekStart), [currentWeekStart]);

  // Navigate weeks
  const goToPreviousWeek = () => {
    setCurrentWeekStart(addDays(currentWeekStart, -7));
  };

  const goToNextWeek = () => {
    setCurrentWeekStart(addDays(currentWeekStart, 7));
  };

  const goToToday = () => {
    setCurrentWeekStart(getWeekStart(new Date()));
  };

  // Copy week to next week
  const handleCopyWeek = async () => {
    if (!isSuper) return;

    setCopying(true);
    try {
      const nextWeekStart = addDays(currentWeekStart, 7);
      const success = await copyWeekSchedule(currentWeekStart, nextWeekStart);
      if (success) {
        // Navigate to next week
        setCurrentWeekStart(nextWeekStart);
      }
    } catch (err) {
      console.error("Error copying week:", err);
    } finally {
      setCopying(false);
    }
  };

  // Check if user has PTO on a date
  const hasPTO = (userId: string, date: string): boolean => {
    const userIds = ptoData.get(date);
    return userIds?.has(userId) ?? false;
  };

  // Get daily staff count
  const getDailyStaffCount = (date: string): number => {
    let count = 0;
    for (const userData of weekData) {
      const schedule = userData.schedules[date];
      if (schedule && schedule.shift_type && schedule.shift_type !== "off") {
        count++;
      }
    }
    return count;
  };

  // Update local state optimistically after a schedule change
  const updateLocalSchedule = useCallback((
    userId: string,
    date: string,
    scheduleData: { shift_type: ShiftType | null; shift_start: string | null; shift_end: string | null; crew_assignment: string | null } | null
  ) => {
    setWeekData(prev => prev.map(userData => {
      if (userData.user_id !== userId) return userData;
      const newSchedules = { ...userData.schedules };
      if (scheduleData === null) {
        delete newSchedules[date];
      } else {
        newSchedules[date] = {
          ...newSchedules[date],
          id: newSchedules[date]?.id || `temp-${Date.now()}`,
          user_id: userId,
          schedule_date: date,
          shift_type: scheduleData.shift_type,
          shift_start: scheduleData.shift_start,
          shift_end: scheduleData.shift_end,
          crew_assignment: scheduleData.crew_assignment,
          notes: newSchedules[date]?.notes || null,
          created_by: newSchedules[date]?.created_by || userId,
          created_at: newSchedules[date]?.created_at || new Date().toISOString(),
        };
      }
      return { ...userData, schedules: newSchedules };
    }));
  }, []);

  // Handle cell click
  const handleCellClick = (userId: string, date: string) => {
    // Check if user has PTO
    if (hasPTO(userId, date)) return;

    if (quickFillMode && isManager) {
      // Apply quick fill template
      handleQuickFill(userId, date);
      return;
    }

    if (!isManager) return;

    // Find current schedule
    const userData = weekData.find((w) => w.user_id === userId);
    const schedule = userData?.schedules[date];

    setEditForm({
      shiftType: schedule?.shift_type || "off",
      startTime: schedule?.shift_start || "05:00",
      endTime: schedule?.shift_end || "13:00",
      crewAssignment: schedule?.crew_assignment || "",
    });

    setEditingCell({ userId, date });
  };

  // Handle quick fill
  const handleQuickFill = async (userId: string, date: string) => {
    setSaving(true);
    try {
      await setSchedule(userId, date, {
        shift_type: quickFillTemplate.shiftType,
        shift_start: quickFillTemplate.start,
        shift_end: quickFillTemplate.end,
      });
      // Optimistic update - no need to refetch entire week
      updateLocalSchedule(userId, date, {
        shift_type: quickFillTemplate.shiftType,
        shift_start: quickFillTemplate.start,
        shift_end: quickFillTemplate.end,
        crew_assignment: null,
      });
    } catch (err) {
      console.error("Error applying quick fill:", err);
      // On error, refetch to ensure consistency
      await loadWeekData();
    } finally {
      setSaving(false);
    }
  };

  // Save edit
  const handleSaveEdit = async () => {
    if (!editingCell) return;

    setSaving(true);
    try {
      if (editForm.shiftType === "off") {
        await deleteSchedule(editingCell.userId, editingCell.date);
        // Optimistic update - remove schedule
        updateLocalSchedule(editingCell.userId, editingCell.date, null);
      } else {
        await setSchedule(editingCell.userId, editingCell.date, {
          shift_type: editForm.shiftType,
          shift_start: editForm.startTime,
          shift_end: editForm.endTime,
          crew_assignment: editForm.crewAssignment || null,
        });
        // Optimistic update - no need to refetch entire week
        updateLocalSchedule(editingCell.userId, editingCell.date, {
          shift_type: editForm.shiftType,
          shift_start: editForm.startTime,
          shift_end: editForm.endTime,
          crew_assignment: editForm.crewAssignment || null,
        });
      }
      setEditingCell(null);
    } catch (err) {
      console.error("Error saving schedule:", err);
      // On error, refetch to ensure consistency
      await loadWeekData();
    } finally {
      setSaving(false);
    }
  };

  // Clear shift
  const handleClearShift = async () => {
    if (!editingCell) return;

    setSaving(true);
    try {
      await deleteSchedule(editingCell.userId, editingCell.date);
      // Optimistic update - remove schedule
      updateLocalSchedule(editingCell.userId, editingCell.date, null);
      setEditingCell(null);
    } catch (err) {
      console.error("Error clearing shift:", err);
      // On error, refetch to ensure consistency
      await loadWeekData();
    } finally {
      setSaving(false);
    }
  };

  // Get my schedule data
  const myScheduleData = useMemo(() => {
    if (!user) return null;
    return weekData.find((w) => w.user_id === user.id);
  }, [weekData, user]);

  // Filter for team view (exclude super)
  const teamData = useMemo(() => {
    return weekData.filter((w) => w.profile.role !== "super");
  }, [weekData]);

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="pb-20 md:pb-6">
        <div className="p-4 md:p-6">
          <PageHeader
            title="Schedule"
            description="Staff scheduling and shifts"
            icon={Calendar}
          />
          {/* Skeleton loading */}
          <div className="space-y-4 mt-4">
            <div className="flex gap-2">
              <div className="h-9 w-28 bg-muted rounded-lg animate-pulse" />
              <div className="h-9 w-28 bg-muted rounded-lg animate-pulse" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 bg-muted rounded-lg animate-pulse" />
                <div className="h-6 w-40 bg-muted rounded animate-pulse" />
                <div className="h-9 w-9 bg-muted rounded-lg animate-pulse" />
              </div>
              <div className="h-9 w-20 bg-muted rounded-lg animate-pulse" />
            </div>
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="grid grid-cols-8 border-b border-border bg-muted/50">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="p-3">
                    <div className="h-4 w-8 bg-muted rounded animate-pulse mx-auto" />
                  </div>
                ))}
              </div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="grid grid-cols-8 border-b border-border last:border-b-0">
                  <div className="p-3 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                    <div className="space-y-1">
                      <div className="h-3.5 w-20 bg-muted rounded animate-pulse" />
                      <div className="h-2.5 w-12 bg-muted rounded animate-pulse" />
                    </div>
                  </div>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <div key={j} className="p-2 flex items-center justify-center">
                      <div className="h-6 w-14 bg-muted rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-20 md:pb-6">
      <div className="p-4 md:p-6">
        <PageHeader
          title="Schedule"
          description="Staff scheduling and shifts"
          icon={Calendar}
        >
          {isSuper && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyWeek}
              disabled={copying}
              className="hidden md:flex"
            >
              {copying ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Copy className="w-4 h-4 mr-2" />
              )}
              Copy to Next Week
            </Button>
          )}
        </PageHeader>

        {/* Tabs */}
        <div className="gk-animate-in gk-animate-in-1 flex gap-1 p-1 bg-muted rounded-lg mb-4 w-fit">
          {isManager && (
            <button
              onClick={() => setActiveTab("team")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "team"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Team Schedule
            </button>
          )}
          <button
            onClick={() => setActiveTab("my")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "my"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            My Schedule
          </button>
        </div>

        {/* Week Navigation */}
        <div className="gk-animate-in gk-animate-in-2 flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goToPreviousWeek}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2 className="font-semibold text-lg">{formatWeekRange(currentWeekStart)}</h2>
            <Button variant="ghost" size="icon" onClick={goToNextWeek}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
            {isManager && !isMobile && (
              <div className="flex items-center gap-2 ml-2">
                <Button
                  variant={quickFillMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setQuickFillMode(!quickFillMode)}
                >
                  {quickFillMode ? "Done" : "Quick Fill"}
                </Button>
                {quickFillMode && (
                  <select
                    value={quickFillTemplates.findIndex(
                      (t) => t.label === quickFillTemplate.label
                    )}
                    onChange={(e) =>
                      setQuickFillTemplate(quickFillTemplates[parseInt(e.target.value)])
                    }
                    className="px-2 py-1 text-sm border border-border rounded-lg bg-background"
                  >
                    {quickFillTemplates.map((template, idx) => (
                      <option key={idx} value={idx}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Team Schedule View */}
        {activeTab === "team" && isManager && (
          <>
            {/* Mobile View - Day by Day */}
            {isMobile ? (
              <div>
                {/* Day selector */}
                <div className="flex items-center justify-between mb-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMobileDay(Math.max(0, mobileDay - 1))}
                    disabled={mobileDay === 0}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                  <div className="text-center">
                    <p className="font-semibold">{formatDayDate(weekDates[mobileDay])}</p>
                    {isToday(weekDates[mobileDay]) && (
                      <span className="text-xs text-primary">Today</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMobileDay(Math.min(6, mobileDay + 1))}
                    disabled={mobileDay === 6}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </div>

                {/* Daily summary */}
                <div
                  className={`flex items-center justify-center gap-2 p-2 rounded-lg mb-4 ${
                    getDailyStaffCount(weekDates[mobileDay]) < MIN_STAFFING
                      ? "bg-red-500/10 text-red-600"
                      : "bg-muted"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {getDailyStaffCount(weekDates[mobileDay])} staff on duty
                  </span>
                  {getDailyStaffCount(weekDates[mobileDay]) < MIN_STAFFING && (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                </div>

                {/* Staff list for the day */}
                <div className="space-y-2">
                  {teamData.map((userData) => {
                    const schedule = userData.schedules[weekDates[mobileDay]];
                    const isPTO = hasPTO(userData.user_id, weekDates[mobileDay]);

                    return (
                      <button
                        key={userData.user_id}
                        onClick={() =>
                          handleCellClick(userData.user_id, weekDates[mobileDay])
                        }
                        disabled={isPTO}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border ${
                          isPTO
                            ? "bg-amber-500/10 border-amber-500/30"
                            : "bg-card border-border hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary">
                              {getDisplayName(userData.profile)
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </span>
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-sm">
                              {getDisplayName(userData.profile)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {roleLabels[userData.profile.role]}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {isPTO ? (
                            <span className="px-2 py-1 rounded text-xs font-medium bg-amber-500/20 text-amber-700">
                              PTO
                            </span>
                          ) : schedule?.shift_type ? (
                            <div>
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  shiftTypeColors[schedule.shift_type].bg
                                } ${shiftTypeColors[schedule.shift_type].text}`}
                              >
                                {shiftTypeLabels[schedule.shift_type]}
                              </span>
                              {schedule.shift_start && schedule.shift_end && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {formatShiftTime(schedule.shift_start, schedule.shift_end)}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Off</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Desktop Grid View */
              <div className="gk-animate-in gk-animate-in-3 bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                {/* Header */}
                <div className="grid grid-cols-8 border-b border-border bg-muted/50">
                  <div className="p-3 text-sm font-medium text-muted-foreground">Staff</div>
                  {weekDates.map((date, idx) => (
                    <div
                      key={date}
                      className={`p-2 text-center ${isToday(date) ? "bg-primary/5" : ""}`}
                    >
                      <p className="text-sm font-medium text-muted-foreground">
                        {DAYS[idx]}
                      </p>
                      <p
                        className={`text-xs ${
                          isToday(date) ? "text-primary font-semibold" : "text-muted-foreground"
                        }`}
                      >
                        {new Date(date + "T00:00:00").getDate()}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Daily Summary Row */}
                <div className="grid grid-cols-8 border-b border-border bg-muted/30">
                  <div className="p-2 text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    On Duty
                  </div>
                  {weekDates.map((date) => {
                    const count = getDailyStaffCount(date);
                    const isLow = count < MIN_STAFFING;
                    return (
                      <div
                        key={date}
                        className={`p-2 flex items-center justify-center ${
                          isLow ? "bg-red-500/10" : ""
                        }`}
                      >
                        <span
                          className={`text-xs font-medium ${
                            isLow ? "text-red-600" : "text-muted-foreground"
                          }`}
                        >
                          {count}
                        </span>
                        {isLow && <AlertTriangle className="w-3 h-3 ml-1 text-red-500" />}
                      </div>
                    );
                  })}
                </div>

                {/* Staff Rows */}
                {teamData.map((userData) => (
                  <div
                    key={userData.user_id}
                    className="grid grid-cols-8 border-b border-border last:border-b-0 hover:bg-muted/30"
                  >
                    <div className="p-3 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-medium text-primary">
                          {getDisplayName(userData.profile)
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {getDisplayName(userData.profile)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {roleLabels[userData.profile.role]}
                        </p>
                      </div>
                    </div>
                    {weekDates.map((date) => {
                      const schedule = userData.schedules[date];
                      const isPTO = hasPTO(userData.user_id, date);
                      const isEditing =
                        editingCell?.userId === userData.user_id &&
                        editingCell?.date === date;

                      return (
                        <div
                          key={date}
                          className={`p-2 flex items-center justify-center relative ${
                            isToday(date) ? "bg-primary/5" : ""
                          } ${
                            isPTO
                              ? "bg-amber-500/10 bg-stripes cursor-not-allowed"
                              : isManager
                              ? "cursor-pointer hover:bg-muted/50"
                              : ""
                          } ${quickFillMode && !isPTO ? "hover:ring-2 hover:ring-primary/50" : ""}`}
                          onClick={() => handleCellClick(userData.user_id, date)}
                        >
                          {isPTO ? (
                            <span className="px-2 py-1 rounded text-xs font-medium bg-amber-500/20 text-amber-700">
                              PTO
                            </span>
                          ) : schedule?.shift_type && schedule.shift_type !== "off" ? (
                            <div className="text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  shiftTypeColors[schedule.shift_type].bg
                                } ${shiftTypeColors[schedule.shift_type].text}`}
                              >
                                {shiftTypeLabels[schedule.shift_type]}
                              </span>
                              {schedule.shift_start && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {schedule.shift_start.slice(0, 5)}
                                </p>
                              )}
                              {schedule.crew_assignment && (
                                <p className="text-[10px] text-muted-foreground truncate max-w-[60px]">
                                  {schedule.crew_assignment}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}

                          {/* Edit Popover */}
                          {isEditing && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCell(null);
                                }}
                              />
                              <div
                                className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-56 bg-popover border border-border rounded-lg shadow-lg z-50 p-3"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="space-y-3">
                                  {/* Shift Type */}
                                  <div>
                                    <label className="block text-xs font-medium mb-1">
                                      Shift Type
                                    </label>
                                    <select
                                      value={editForm.shiftType}
                                      onChange={(e) =>
                                        setEditForm({
                                          ...editForm,
                                          shiftType: e.target.value as ShiftType | "off",
                                        })
                                      }
                                      className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background"
                                    >
                                      {shiftTypeOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  {editForm.shiftType !== "off" && (
                                    <>
                                      {/* Times */}
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="block text-xs font-medium mb-1">
                                            Start
                                          </label>
                                          <input
                                            type="time"
                                            value={editForm.startTime}
                                            onChange={(e) =>
                                              setEditForm({
                                                ...editForm,
                                                startTime: e.target.value,
                                              })
                                            }
                                            className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium mb-1">
                                            End
                                          </label>
                                          <input
                                            type="time"
                                            value={editForm.endTime}
                                            onChange={(e) =>
                                              setEditForm({
                                                ...editForm,
                                                endTime: e.target.value,
                                              })
                                            }
                                            className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background"
                                          />
                                        </div>
                                      </div>

                                      {/* Crew Assignment */}
                                      <div>
                                        <label className="block text-xs font-medium mb-1">
                                          Crew
                                        </label>
                                        <input
                                          type="text"
                                          value={editForm.crewAssignment}
                                          onChange={(e) =>
                                            setEditForm({
                                              ...editForm,
                                              crewAssignment: e.target.value,
                                            })
                                          }
                                          placeholder="e.g., Green Team"
                                          className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background"
                                        />
                                      </div>
                                    </>
                                  )}

                                  {/* Actions */}
                                  <div className="flex gap-2 pt-1">
                                    <Button
                                      size="sm"
                                      onClick={handleSaveEdit}
                                      disabled={saving}
                                      className="flex-1"
                                    >
                                      {saving ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <>
                                          <Check className="w-3 h-3 mr-1" />
                                          Save
                                        </>
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={handleClearShift}
                                      disabled={saving}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setEditingCell(null)}
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {teamData.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    No staff members found
                  </div>
                )}
              </div>
            )}

            {/* Legend */}
            <div className="gk-animate-in gk-animate-in-4 flex flex-wrap items-center gap-3 mt-4 text-xs">
              {Object.entries(shiftTypeLabels).map(([type, label]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <span
                    className={`px-2 py-0.5 rounded ${
                      shiftTypeColors[type as ShiftType].bg
                    } ${shiftTypeColors[type as ShiftType].text}`}
                  >
                    {label}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-700">PTO</span>
                <span className="text-muted-foreground">Approved Time Off</span>
              </div>
            </div>
          </>
        )}

        {/* My Schedule View */}
        {activeTab === "my" && (
          <div className="space-y-4">
            {/* Request Time Off Button */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/schedule/time-off")}
              >
                <CalendarPlus className="w-4 h-4 mr-2" />
                Request Time Off
              </Button>
            </div>

            {/* My Week Grid */}
            <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
              {/* Header */}
              <div className="grid grid-cols-7 border-b border-border bg-muted/50">
                {weekDates.map((date, idx) => (
                  <div
                    key={date}
                    className={`p-3 text-center ${isToday(date) ? "bg-primary/10" : ""}`}
                  >
                    <p
                      className={`text-sm font-medium ${
                        isToday(date) ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {DAYS[idx]}
                    </p>
                    <p
                      className={`text-lg font-semibold ${
                        isToday(date) ? "text-primary" : ""
                      }`}
                    >
                      {new Date(date + "T00:00:00").getDate()}
                    </p>
                  </div>
                ))}
              </div>

              {/* My Schedule Row */}
              <div className="grid grid-cols-7">
                {weekDates.map((date) => {
                  const schedule = myScheduleData?.schedules[date];
                  const isPTO = user ? hasPTO(user.id, date) : false;

                  return (
                    <div
                      key={date}
                      className={`p-4 min-h-[120px] border-r border-border last:border-r-0 ${
                        isToday(date) ? "bg-primary/5" : ""
                      } ${isPTO ? "bg-amber-500/10" : ""}`}
                    >
                      {isPTO ? (
                        <div className="flex flex-col items-center justify-center h-full">
                          <span className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-700 font-medium">
                            PTO
                          </span>
                          <p className="text-xs text-muted-foreground mt-2">Time Off</p>
                        </div>
                      ) : schedule?.shift_type && schedule.shift_type !== "off" ? (
                        <div className="flex flex-col items-center justify-center h-full">
                          <span
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                              shiftTypeColors[schedule.shift_type].bg
                            } ${shiftTypeColors[schedule.shift_type].text}`}
                          >
                            {shiftTypeLabels[schedule.shift_type]}
                          </span>
                          {schedule.shift_start && schedule.shift_end && (
                            <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatShiftTime(schedule.shift_start, schedule.shift_end)}
                            </p>
                          )}
                          {schedule.crew_assignment && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {schedule.crew_assignment}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                          <span className="text-sm">Off</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary */}
            {myScheduleData && (
              <div className="gk-card p-4">
                <h3 className="font-medium mb-3">This Week Summary</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-primary/5 rounded-xl text-center">
                    <p className="text-xs text-muted-foreground mb-1">Scheduled Days</p>
                    <p className="text-2xl font-bold text-primary">
                      {
                        Object.values(myScheduleData.schedules).filter(
                          (s) => s.shift_type && s.shift_type !== "off"
                        ).length
                      }
                    </p>
                  </div>
                  <div className="p-3 bg-muted/60 rounded-xl text-center">
                    <p className="text-xs text-muted-foreground mb-1">Days Off</p>
                    <p className="text-2xl font-bold">
                      {7 -
                        Object.values(myScheduleData.schedules).filter(
                          (s) => s.shift_type && s.shift_type !== "off"
                        ).length}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile Copy Week Button */}
      {isSuper && isMobile && activeTab === "team" && (
        <div className="fixed bottom-[calc(80px+env(safe-area-inset-bottom,0px))] right-4 z-30">
          <Button
            size="lg"
            className="rounded-full shadow-lg"
            onClick={handleCopyWeek}
            disabled={copying}
          >
            {copying ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Copy className="w-5 h-5" />
            )}
          </Button>
        </div>
      )}

      {/* CSS for striped PTO background */}
      <style jsx global>{`
        .bg-stripes {
          background-image: repeating-linear-gradient(
            45deg,
            transparent,
            transparent 4px,
            rgba(217, 119, 6, 0.1) 4px,
            rgba(217, 119, 6, 0.1) 8px
          );
        }
      `}</style>
    </div>
  );
}
