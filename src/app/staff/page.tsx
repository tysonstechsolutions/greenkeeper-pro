"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Users,
  Search,
  Filter,
  UserPlus,
  Phone,
  Mail,
  Calendar,
  ChevronRight,
  X,
  Loader2,
  CheckSquare,
  Clock,
  Award,
  CalendarOff,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/hooks/useAuth";
import { RoleGuard, MANAGEMENT_ROLES } from "@/components/auth/role-guard";
import { createClient } from "@/lib/supabase/client";
import { useCrews } from "@/lib/hooks/useCrews";
import { roleLabels, roleColors, getDisplayName, getInitials } from "@/lib/hooks/useProfiles";
import type { Profile, UserRole, Task, TimeOffRequest, Schedule } from "@/types/database";

// Extended profile with additional details for staff page
interface StaffProfile extends Profile {
  task_count?: number;
  pending_time_off?: number;
  current_crew?: string | null;
}

export default function StaffPage() {
  const router = useRouter();
  const { profile: currentUser, loading: authLoading, isSuper, isAsstSuper } = useAuth();
  const { crews, loading: crewsLoading } = useCrews();

  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [showFilters, setShowFilters] = useState(false);

  // Selected staff member for detail view
  const [selectedStaff, setSelectedStaff] = useState<StaffProfile | null>(null);
  const [selectedStaffTasks, setSelectedStaffTasks] = useState<Task[]>([]);
  const [selectedStaffTimeOff, setSelectedStaffTimeOff] = useState<TimeOffRequest[]>([]);
  const [selectedStaffSchedule, setSelectedStaffSchedule] = useState<Schedule[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const supabase = createClient();

  // Fetch all staff profiles
  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Get all profiles (both active and inactive for full roster)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profilesData, error: profilesError } = await (supabase.from("profiles") as any)
        .select("*")
        .order("role", { ascending: true })
        .order("full_name", { ascending: true });

      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
        setError(profilesError.message);
        return;
      }

      // Get task counts per user
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: tasksData } = await (supabase.from("tasks") as any)
        .select("assigned_to")
        .in("status", ["pending", "in_progress"]);

      // Get pending time-off counts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: timeOffData } = await (supabase.from("time_off_requests") as any)
        .select("user_id")
        .eq("status", "pending");

      // Get today's crew assignments
      const today = new Date().toISOString().split("T")[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: scheduleData } = await (supabase.from("schedules") as any)
        .select("user_id, crew_assignment")
        .eq("schedule_date", today)
        .not("crew_assignment", "is", null);

      // Build enhanced profiles
      const taskCounts = new Map<string, number>();
      if (tasksData) {
        for (const task of tasksData) {
          if (task.assigned_to) {
            taskCounts.set(task.assigned_to, (taskCounts.get(task.assigned_to) || 0) + 1);
          }
        }
      }

      const timeOffCounts = new Map<string, number>();
      if (timeOffData) {
        for (const request of timeOffData) {
          timeOffCounts.set(request.user_id, (timeOffCounts.get(request.user_id) || 0) + 1);
        }
      }

      const crewAssignments = new Map<string, string>();
      if (scheduleData) {
        for (const schedule of scheduleData) {
          crewAssignments.set(schedule.user_id, schedule.crew_assignment);
        }
      }

      const enhanced: StaffProfile[] = (profilesData || []).map((p: Profile) => ({
        ...p,
        task_count: taskCounts.get(p.id) || 0,
        pending_time_off: timeOffCounts.get(p.id) || 0,
        current_crew: crewAssignments.get(p.id) || null,
      }));

      setProfiles(enhanced);
    } catch (err) {
      console.error("Unexpected error fetching staff:", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (currentUser) {
      fetchStaff();
    }
  }, [currentUser, fetchStaff]);

  // Filtered profiles
  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName =
          p.full_name?.toLowerCase().includes(query) ||
          p.display_name?.toLowerCase().includes(query);
        const matchesEmail = p.email?.toLowerCase().includes(query);
        const matchesPhone = p.phone?.includes(query);
        if (!matchesName && !matchesEmail && !matchesPhone) return false;
      }

      // Role filter
      if (roleFilter !== "all" && p.role !== roleFilter) return false;

      // Status filter
      if (statusFilter === "active" && !p.is_active) return false;
      if (statusFilter === "inactive" && p.is_active) return false;

      return true;
    });
  }, [profiles, searchQuery, roleFilter, statusFilter]);

  // Load staff details when selected
  const loadStaffDetails = useCallback(
    async (staff: StaffProfile) => {
      setSelectedStaff(staff);
      setLoadingDetails(true);

      try {
        // Fetch tasks assigned to this user
        const { data: tasks } = await supabase
          .from("tasks")
          .select("*")
          .eq("assigned_to", staff.id)
          .in("status", ["pending", "in_progress"])
          .order("due_date", { ascending: true })
          .limit(10);

        setSelectedStaffTasks(tasks || []);

        // Fetch time-off requests
        const { data: timeOff } = await supabase
          .from("time_off_requests")
          .select("*")
          .eq("user_id", staff.id)
          .order("start_date", { ascending: false })
          .limit(5);

        setSelectedStaffTimeOff(timeOff || []);

        // Fetch recent schedule entries
        const today = new Date().toISOString().split("T")[0];
        const { data: schedules } = await supabase
          .from("schedules")
          .select("*")
          .eq("user_id", staff.id)
          .gte("schedule_date", today)
          .order("schedule_date", { ascending: true })
          .limit(7);

        setSelectedStaffSchedule(schedules || []);
      } catch (err) {
        console.error("Error loading staff details:", err);
      } finally {
        setLoadingDetails(false);
      }
    },
    [supabase]
  );

  // Role options for filter
  const roleOptions: Array<{ value: UserRole | "all"; label: string }> = [
    { value: "all", label: "All Roles" },
    { value: "super", label: "Superintendent" },
    { value: "asst_super", label: "Asst. Superintendent" },
    { value: "foreman", label: "Foreman" },
    { value: "mechanic", label: "Mechanic" },
    { value: "crew", label: "Crew Member" },
    { value: "seasonal", label: "Seasonal" },
  ];

  // Format date helper
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <RoleGuard allowedRoles={MANAGEMENT_ROLES}>
      {/* Show loading spinner while data is loading */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Staff Roster
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {filteredProfiles.length} staff member{filteredProfiles.length !== 1 ? "s" : ""}
            {profiles.length !== filteredProfiles.length && ` (${profiles.length} total)`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/staff/crews">
            <Button variant="outline" className="gap-2">
              <Users className="w-4 h-4" />
              Manage Crews
            </Button>
          </Link>
          <Link href="/settings/invite">
            <Button className="gap-2">
              <UserPlus className="w-4 h-4" />
              Invite Staff
            </Button>
          </Link>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter toggle (mobile) */}
        <Button
          variant="outline"
          className="sm:hidden gap-2"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-4 h-4" />
          Filters
          {(roleFilter !== "all" || statusFilter !== "all") && (
            <span className="w-2 h-2 rounded-full bg-primary" />
          )}
        </Button>

        {/* Filters (desktop always visible, mobile toggleable) */}
        <div className={`flex gap-2 ${showFilters ? "flex" : "hidden sm:flex"}`}>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | "all")}
            className="px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {roleOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
            className="px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {(roleFilter !== "all" || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRoleFilter("all");
                setStatusFilter("all");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
          {error}
        </div>
      )}

      {/* Main content - list and detail panel */}
      <div className="flex gap-6">
        {/* Staff list */}
        <div className={`flex-1 ${selectedStaff ? "hidden lg:block" : ""}`}>
          {filteredProfiles.length === 0 ? (
            searchQuery || roleFilter !== "all" || statusFilter !== "all" ? (
              <EmptyState
                icon={Users}
                title="No matching staff"
                description="Try adjusting your search or filter criteria."
                variant="compact"
              />
            ) : (
              <EmptyState
                icon={Users}
                title="No staff members"
                description="Invite team members to start managing your crew."
                action={{ label: "Invite Staff", href: "/settings/invite" }}
              />
            )
          ) : (
            <div className="space-y-2">
              {filteredProfiles.map((staff) => (
                <button
                  key={staff.id}
                  onClick={() => loadStaffDetails(staff)}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    selectedStaff?.id === staff.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shrink-0">
                      {staff.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={staff.avatar_url}
                          alt={staff.full_name || ""}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-primary-foreground font-medium">
                          {getInitials(staff.full_name)}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {getDisplayName(staff)}
                        </span>
                        {!staff.is_active && (
                          <span className="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            roleColors[staff.role].bg
                          } ${roleColors[staff.role].text}`}
                        >
                          {roleLabels[staff.role]}
                        </span>
                        {staff.current_crew && (
                          <span className="text-xs text-muted-foreground">
                            • {staff.current_crew}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick stats */}
                    <div className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground">
                      {(staff.task_count ?? 0) > 0 && (
                        <span className="flex items-center gap-1">
                          <CheckSquare className="w-4 h-4" />
                          {staff.task_count}
                        </span>
                      )}
                      {(staff.pending_time_off ?? 0) > 0 && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <CalendarOff className="w-4 h-4" />
                          {staff.pending_time_off}
                        </span>
                      )}
                    </div>

                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedStaff && (
          <div className="lg:w-96 lg:shrink-0">
            <div className="bg-card rounded-lg border border-border sticky top-20">
              {/* Back button (mobile) */}
              <div className="lg:hidden p-4 border-b border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedStaff(null)}
                  className="gap-2"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  Back to list
                </Button>
              </div>

              {/* Profile header */}
              <div className="p-6 text-center border-b border-border">
                <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center mx-auto mb-4">
                  {selectedStaff.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedStaff.avatar_url}
                      alt={selectedStaff.full_name || ""}
                      className="w-20 h-20 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-primary-foreground font-bold text-2xl">
                      {getInitials(selectedStaff.full_name)}
                    </span>
                  )}
                </div>

                <h2 className="text-xl font-bold">{getDisplayName(selectedStaff)}</h2>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span
                    className={`px-2 py-0.5 rounded text-sm font-medium ${
                      roleColors[selectedStaff.role].bg
                    } ${roleColors[selectedStaff.role].text}`}
                  >
                    {roleLabels[selectedStaff.role]}
                  </span>
                  {!selectedStaff.is_active && (
                    <span className="px-2 py-0.5 rounded text-sm bg-muted text-muted-foreground">
                      Inactive
                    </span>
                  )}
                </div>
              </div>

              {loadingDetails ? (
                <div className="p-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="p-4 space-y-4 max-h-[calc(100vh-400px)] overflow-y-auto">
                  {/* Contact info */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                      Contact Information
                    </h3>
                    <div className="space-y-2 text-sm">
                      {selectedStaff.phone && (
                        <a
                          href={`tel:${selectedStaff.phone}`}
                          className="flex items-center gap-2 hover:text-primary"
                        >
                          <Phone className="w-4 h-4" />
                          {selectedStaff.phone}
                        </a>
                      )}
                      {selectedStaff.email && (
                        <a
                          href={`mailto:${selectedStaff.email}`}
                          className="flex items-center gap-2 hover:text-primary"
                        >
                          <Mail className="w-4 h-4" />
                          {selectedStaff.email}
                        </a>
                      )}
                      {selectedStaff.hire_date && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          Hired {formatDate(selectedStaff.hire_date)}
                        </div>
                      )}
                      {selectedStaff.current_crew && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Users className="w-4 h-4" />
                          {selectedStaff.current_crew}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Certifications */}
                  {selectedStaff.certifications && selectedStaff.certifications.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                        <Award className="w-4 h-4" />
                        Certifications
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedStaff.certifications.map((cert, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 rounded bg-primary/10 text-primary text-xs"
                          >
                            {cert.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Active tasks */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <CheckSquare className="w-4 h-4" />
                      Active Tasks ({selectedStaffTasks.length})
                    </h3>
                    {selectedStaffTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No active tasks</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedStaffTasks.slice(0, 5).map((task) => (
                          <Link
                            key={task.id}
                            href={`/tasks/${task.id}`}
                            className="block p-2 rounded bg-muted/50 hover:bg-muted text-sm"
                          >
                            <div className="font-medium truncate">{task.title}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <span
                                className={`px-1.5 py-0.5 rounded ${
                                  task.priority === "critical"
                                    ? "bg-purple-500/10 text-purple-600"
                                    : task.priority === "high"
                                    ? "bg-red-500/10 text-red-600"
                                    : task.priority === "normal"
                                    ? "bg-amber-500/10 text-amber-600"
                                    : "bg-gray-500/10 text-gray-600"
                                }`}
                              >
                                {task.priority}
                              </span>
                              {task.due_date && (
                                <span>Due {formatDate(task.due_date)}</span>
                              )}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Upcoming schedule */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Upcoming Schedule
                    </h3>
                    {selectedStaffSchedule.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No upcoming schedule</p>
                    ) : (
                      <div className="space-y-1">
                        {selectedStaffSchedule.map((sched) => (
                          <div
                            key={sched.id}
                            className="flex items-center justify-between text-sm p-2 rounded bg-muted/50"
                          >
                            <span>{formatDate(sched.schedule_date)}</span>
                            <span className="text-muted-foreground">
                              {sched.shift_start && sched.shift_end
                                ? `${sched.shift_start.slice(0, 5)} - ${sched.shift_end.slice(0, 5)}`
                                : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Time off */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                      <CalendarOff className="w-4 h-4" />
                      Time Off Requests
                    </h3>
                    {selectedStaffTimeOff.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No time-off requests</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedStaffTimeOff.map((req) => (
                          <div
                            key={req.id}
                            className="p-2 rounded bg-muted/50 text-sm"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium capitalize">
                                {(req.request_type || "time off").replace("_", " ")}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-xs ${
                                  req.status === "approved"
                                    ? "bg-green-500/10 text-green-600"
                                    : req.status === "pending"
                                    ? "bg-amber-500/10 text-amber-600"
                                    : "bg-red-500/10 text-red-600"
                                }`}
                              >
                                {req.status}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {formatDate(req.start_date)} - {formatDate(req.end_date)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Admin actions */}
                  {isSuper && (
                    <div className="pt-4 border-t border-border">
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Admin Actions
                      </h3>
                      <div className="space-y-2">
                        <Link href={`/settings/staff/${selectedStaff.id}`}>
                          <Button variant="outline" size="sm" className="w-full">
                            Edit Profile
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
      )}
    </RoleGuard>
  );
}
