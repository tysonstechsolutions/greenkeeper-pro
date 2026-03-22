"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ClipboardList,
  Plus,
  Filter,
  ChevronDown,
  ChevronUp,
  Search,
  Calendar,
  X,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Camera,
  MapPin,
  User,
  Loader2,
  Inbox,
} from "lucide-react";
import { SkeletonList } from "@/components/ui/skeleton-card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import { useTasks, type TaskWithRelations, type TaskFilters } from "@/lib/hooks/useTasks";
import { useProfiles, getInitials } from "@/lib/hooks/useProfiles";
import { formatZoneName } from "@/lib/hooks/useCourseZones";
import type { TaskCategory, TaskPriority, TaskStatus } from "@/types/database";

// Tab type
type TabType = "my" | "all" | "overdue";

// Priority styles
const priorityBorders: Record<TaskPriority, string> = {
  critical: "border-l-red-500",
  high: "border-l-orange-500",
  normal: "border-l-green-500",
  low: "border-l-gray-400",
};

const priorityLabels: Record<TaskPriority, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

const priorityBadgeColors: Record<TaskPriority, string> = {
  critical: "bg-red-500/10 text-red-600",
  high: "bg-orange-500/10 text-orange-600",
  normal: "bg-green-500/10 text-green-600",
  low: "bg-gray-500/10 text-gray-600",
};

// Status styles
const statusColors: Record<TaskStatus, string> = {
  pending: "bg-gray-500/10 text-gray-600",
  in_progress: "bg-blue-500/10 text-blue-600",
  completed: "bg-green-500/10 text-green-600",
  verified: "bg-primary/10 text-primary",
  blocked: "bg-red-500/10 text-red-600",
  deferred: "bg-amber-500/10 text-amber-600",
  cancelled: "bg-gray-400/10 text-gray-500",
};

const statusLabels: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  verified: "Verified",
  blocked: "Blocked",
  deferred: "Deferred",
  cancelled: "Cancelled",
};

// Category labels
const categoryLabels: Record<TaskCategory, string> = {
  mowing: "Mowing",
  irrigation: "Irrigation",
  chemical: "Chemical",
  mechanical: "Mechanical",
  landscaping: "Landscaping",
  construction: "Construction",
  bunker: "Bunker",
  greens: "Greens",
  admin: "Admin",
  safety: "Safety",
  other: "Other",
  pro_shop: "Pro Shop",
  events: "Events",
  customer_service: "Customer Service",
};

const categoryColors: Record<TaskCategory, string> = {
  mowing: "bg-green-500/10 text-green-700",
  irrigation: "bg-blue-500/10 text-blue-700",
  chemical: "bg-purple-500/10 text-purple-700",
  mechanical: "bg-orange-500/10 text-orange-700",
  landscaping: "bg-lime-500/10 text-lime-700",
  construction: "bg-amber-500/10 text-amber-700",
  bunker: "bg-yellow-500/10 text-yellow-700",
  greens: "bg-emerald-500/10 text-emerald-700",
  admin: "bg-slate-500/10 text-slate-700",
  safety: "bg-red-500/10 text-red-700",
  other: "bg-gray-500/10 text-gray-700",
  pro_shop: "bg-teal-500/10 text-teal-700",
  events: "bg-pink-500/10 text-pink-700",
  customer_service: "bg-cyan-500/10 text-cyan-700",
};

// Helper to format date for display
function formatDate(dateString: string): string {
  const date = new Date(dateString + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === tomorrow.getTime()) return "Tomorrow";
  if (date.getTime() === yesterday.getTime()) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Helper to format time
function formatTime(timeString: string | null): string {
  if (!timeString) return "";
  const [hours, minutes] = timeString.split(":");
  const h = parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

// Get today's date in YYYY-MM-DD format
function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

// Check if a date is overdue
function isOverdue(dateString: string, status: TaskStatus): boolean {
  if (["completed", "verified", "cancelled"].includes(status)) return false;
  const today = getTodayString();
  return dateString < today;
}

// Group tasks by date
function groupTasksByDate(tasks: TaskWithRelations[]): Map<string, TaskWithRelations[]> {
  const groups = new Map<string, TaskWithRelations[]>();

  tasks.forEach((task) => {
    const date = task.due_date;
    if (!groups.has(date)) {
      groups.set(date, []);
    }
    groups.get(date)!.push(task);
  });

  // Sort dates (today first, then future, then past)
  const today = getTodayString();
  const sortedGroups = new Map<string, TaskWithRelations[]>();
  const dates = Array.from(groups.keys()).sort((a, b) => {
    if (a === today) return -1;
    if (b === today) return 1;
    if (a > today && b > today) return a.localeCompare(b);
    if (a < today && b < today) return b.localeCompare(a);
    if (a > today) return -1;
    return 1;
  });

  dates.forEach((date) => {
    sortedGroups.set(date, groups.get(date)!);
  });

  return sortedGroups;
}

export default function TasksPage() {
  const router = useRouter();
  const { user, profile, isManager, isForeman, loading: authLoading } = useAuth();
  // Only load profiles for managers/foremen who need the assignee filter
  const { profiles } = useProfiles();

  // Determine default tab based on role
  const defaultTab: TabType = isManager || isForeman ? "all" : "my";

  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filter state
  const [selectedStatuses, setSelectedStatuses] = useState<TaskStatus[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<TaskCategory | "">("");
  const [selectedPriorities, setSelectedPriorities] = useState<TaskPriority[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search query - only trigger fetch after 300ms of no typing
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Build filters based on current state
  const buildFilters = useCallback((): TaskFilters => {
    const filters: TaskFilters = {
      includeCompleted: true,
    };

    if (selectedStatuses.length > 0) {
      filters.status = selectedStatuses;
    }

    if (selectedCategory) {
      filters.category = selectedCategory;
    }

    if (selectedPriorities.length > 0) {
      filters.priority = selectedPriorities;
    }

    if (selectedAssignee) {
      filters.assignedTo = selectedAssignee;
    }

    if (debouncedSearch) {
      filters.search = debouncedSearch;
    }

    return filters;
  }, [selectedStatuses, selectedCategory, selectedPriorities, selectedAssignee, debouncedSearch]);

  const { tasks, loading: tasksLoading, fetchTasks, fetchMyTasks, fetchTeamTasks } = useTasks();

  // Fetch tasks based on active tab
  const loadTasks = useCallback(async () => {
    if (!user) return;

    if (activeTab === "my") {
      // For "My Tasks" - fetch tasks for current user, grouped by date
      const filters = buildFilters();
      filters.assignedTo = user.id;
      await fetchTasks(filters);
    } else if (activeTab === "all") {
      // For "All Tasks" - fetch with filters
      const filters = buildFilters();
      if (selectedDate) {
        filters.dateRange = { start: selectedDate, end: selectedDate };
      }
      await fetchTasks(filters);
    } else if (activeTab === "overdue") {
      // For "Overdue" - fetch all past-due incomplete tasks
      const today = getTodayString();
      const filters = buildFilters();
      filters.dateRange = { start: "2020-01-01", end: today };
      filters.status = ["pending", "in_progress", "blocked", "deferred"];
      await fetchTasks(filters);
    }
  }, [user, activeTab, buildFilters, fetchTasks, selectedDate]);

  // Update default tab when auth loads
  useEffect(() => {
    if (!authLoading && profile) {
      const newDefault: TabType = isManager || isForeman ? "all" : "my";
      setActiveTab(newDefault);
    }
  }, [authLoading, profile, isManager, isForeman]);

  // Load tasks when tab or filters change
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Pull to refresh handler
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTasks();
    setRefreshing(false);
  };

  // Filter out tasks based on overdue tab
  const filteredTasks = useMemo(() => {
    if (activeTab === "overdue") {
      const today = getTodayString();
      return tasks.filter(
        (task) =>
          task.due_date < today &&
          !["completed", "verified", "cancelled"].includes(task.status)
      );
    }
    return tasks;
  }, [tasks, activeTab]);

  // Group tasks by date for display
  const groupedTasks = useMemo(() => {
    return groupTasksByDate(filteredTasks);
  }, [filteredTasks]);

  // Toggle status filter
  const toggleStatus = (status: TaskStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  };

  // Toggle priority filter
  const togglePriority = (priority: TaskPriority) => {
    setSelectedPriorities((prev) =>
      prev.includes(priority)
        ? prev.filter((p) => p !== priority)
        : [...prev, priority]
    );
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedStatuses([]);
    setSelectedCategory("");
    setSelectedPriorities([]);
    setSelectedAssignee("");
    setSelectedDate(getTodayString());
    setSearchQuery("");
  };

  // Check if any filters are active
  const hasActiveFilters =
    selectedStatuses.length > 0 ||
    selectedCategory !== "" ||
    selectedPriorities.length > 0 ||
    selectedAssignee !== "" ||
    searchQuery !== "";

  // Can create tasks check
  const canCreateTasks = isManager || isForeman;

  // Loading state
  if (authLoading) {
    return (
      <div className="p-4 md:p-6">
        <SkeletonList count={5} variant="task" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 md:p-6 pb-0">
        <PageHeader
          title="Tasks"
          description={activeTab === "my" ? "Your assigned tasks" : "All team tasks"}
          icon={ClipboardList}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            variant={showFilters ? "default" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Filters</span>
            {hasActiveFilters && (
              <span className="ml-1 w-2 h-2 rounded-full bg-accent" />
            )}
          </Button>
          {canCreateTasks && (
            <Link href="/tasks/new">
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">New Task</span>
              </Button>
            </Link>
          )}
        </PageHeader>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b border-border">
          <button
            onClick={() => setActiveTab("my")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "my"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            My Tasks
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "all"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            All Tasks
          </button>
          <button
            onClick={() => setActiveTab("overdue")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "overdue"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Overdue
          </button>
        </div>

        {/* Filter Bar */}
        {showFilters && (
          <div className="mt-4 p-4 bg-card rounded-lg border border-border space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Date Picker (only for All Tasks tab) */}
              {activeTab === "all" && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Date
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              {/* Category Dropdown */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value as TaskCategory | "")}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="">All Categories</option>
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assignee Dropdown (for managers/foremen) */}
              {(isManager || isForeman) && activeTab !== "my" && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Assigned To
                  </label>
                  <select
                    value={selectedAssignee}
                    onChange={(e) => setSelectedAssignee(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="">All Staff</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Status Chips */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Status
              </label>
              <div className="flex flex-wrap gap-2">
                {(["pending", "in_progress", "completed", "blocked", "deferred"] as TaskStatus[]).map(
                  (status) => (
                    <button
                      key={status}
                      onClick={() => toggleStatus(status)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        selectedStatuses.includes(status)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {statusLabels[status]}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Priority Chips */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Priority
              </label>
              <div className="flex flex-wrap gap-2">
                {(["critical", "high", "normal", "low"] as TaskPriority[]).map((priority) => (
                  <button
                    key={priority}
                    onClick={() => togglePriority(priority)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selectedPriorities.includes(priority)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {priorityLabels[priority]}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-1" />
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pt-4">
        {tasksLoading ? (
          <SkeletonList count={5} variant="task" />
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            tab={activeTab}
            hasFilters={hasActiveFilters}
            onClearFilters={clearFilters}
          />
        ) : (
          <div className="space-y-6">
            {Array.from(groupedTasks.entries()).map(([date, dateTasks]) => (
              <div key={date}>
                {/* Date Header */}
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    {formatDate(date)}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    ({dateTasks.length} task{dateTasks.length !== 1 ? "s" : ""})
                  </span>
                  {isOverdue(date, "pending") && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600">
                      Overdue
                    </span>
                  )}
                </div>

                {/* Tasks for this date */}
                <div className="space-y-3">
                  {dateTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onClick={() => router.push(`/tasks/${task.id}`)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Button (mobile only) */}
      {canCreateTasks && (
        <Link
          href="/tasks/new"
          className="fixed bottom-24 right-4 md:hidden w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-6 h-6" />
        </Link>
      )}
    </div>
  );
}

// Task Card Component
function TaskCard({
  task,
  onClick,
}: {
  task: TaskWithRelations;
  onClick: () => void;
}) {
  const checklistProgress = useMemo(() => {
    if (!task.checklist || task.checklist.length === 0) return null;
    const completed = task.checklist.filter((item) => item.checked).length;
    return { completed, total: task.checklist.length };
  }, [task.checklist]);

  const needsPhotos = task.requires_photo_before || task.requires_photo_after;
  const overdue = isOverdue(task.due_date, task.status);

  return (
    <div
      onClick={onClick}
      className={`bg-card rounded-lg border border-border border-l-4 ${
        priorityBorders[task.priority]
      } p-4 hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer`}
    >
      <div className="flex items-start gap-3">
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Title Row */}
          <div className="flex items-start gap-2 mb-2">
            <h4 className="font-medium text-foreground leading-tight flex-1">
              {task.title}
            </h4>
            {overdue && (
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            )}
          </div>

          {/* Badges Row */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {/* Category Badge */}
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                categoryColors[task.category]
              }`}
            >
              {categoryLabels[task.category]}
            </span>

            {/* Status Badge */}
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                statusColors[task.status]
              }`}
            >
              {statusLabels[task.status]}
            </span>

            {/* Priority Badge (on mobile, show for critical/high) */}
            {(task.priority === "critical" || task.priority === "high") && (
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  priorityBadgeColors[task.priority]
                }`}
              >
                {priorityLabels[task.priority]}
              </span>
            )}
          </div>

          {/* Meta Row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {/* Assigned To */}
            {task.assigned_user && (
              <div className="flex items-center gap-1.5">
                {task.assigned_user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={task.assigned_user.avatar_url}
                    alt={task.assigned_user.full_name}
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-[10px] font-medium text-primary">
                      {getInitials(task.assigned_user.full_name)}
                    </span>
                  </div>
                )}
                <span className="truncate max-w-[100px]">
                  {task.assigned_user.full_name}
                </span>
              </div>
            )}

            {/* Time */}
            {task.due_time && (
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatTime(task.due_time)}</span>
              </div>
            )}

            {/* Zone/Location */}
            {task.zone && (
              <div className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                <span className="truncate max-w-[120px]">
                  {formatZoneName(task.zone as any)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side Indicators */}
        <div className="flex flex-col items-end gap-2">
          {/* Checklist Progress */}
          {checklistProgress && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {checklistProgress.completed}/{checklistProgress.total}
              </span>
            </div>
          )}

          {/* Photo Indicator */}
          {needsPhotos && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Camera className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Empty State Component
function EmptyState({
  tab,
  hasFilters,
  onClearFilters,
}: {
  tab: TabType;
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Search className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-1">No tasks match your filters</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Try adjusting your filters to see more results.
        </p>
        <Button variant="outline" onClick={onClearFilters}>
          <X className="w-4 h-4 mr-2" />
          Clear Filters
        </Button>
      </div>
    );
  }

  if (tab === "overdue") {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-lg font-medium mb-1">All caught up!</h3>
        <p className="text-sm text-muted-foreground">
          No overdue tasks. Great job keeping up with the work!
        </p>
      </div>
    );
  }

  if (tab === "my") {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Inbox className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-medium mb-1">No tasks assigned to you</h3>
        <p className="text-sm text-muted-foreground">
          Enjoy the quiet! Check back later for new assignments.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <ClipboardList className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">No tasks scheduled</h3>
      <p className="text-sm text-muted-foreground">
        No tasks for the selected date. Try a different date or create a new task.
      </p>
    </div>
  );
}
