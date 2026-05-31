"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CalendarPlus,
  ChevronLeft,
  Check,
  X,
  Clock,
  Users,
  AlertTriangle,
  Loader2,
  Filter,
  Trash2,
  CheckCircle2,
  XCircle,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  useTimeOff,
  type TimeOffRequestWithProfile,
  type CreateTimeOffRequestData,
  type DateRangeConflict,
  timeOffTypeLabels,
  timeOffTypeColors,
  timeOffStatusLabels,
  timeOffStatusColors,
  formatDateRange,
  calculateDays,
} from "@/lib/hooks/useTimeOff";
import { useProfiles, getDisplayName, roleLabels } from "@/lib/hooks/useProfiles";
import { useNotifications } from "@/lib/hooks/useNotifications";
import type { TimeOffRequestType, TimeOffRequestStatus, Profile } from "@/types/database";
import { todayLocal } from "@/lib/utils/date";

// Request type options
const requestTypeOptions: { value: TimeOffRequestType; label: string }[] = [
  { value: "vacation", label: "Vacation" },
  { value: "sick", label: "Sick Leave" },
  { value: "personal", label: "Personal" },
  { value: "military", label: "Military" },
  { value: "other", label: "Other" },
];

// Status filter options
const statusFilterOptions: { value: TimeOffRequestStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
];

// Get today's date as YYYY-MM-DD (local timezone — see date.ts).
function getTodayString(): string {
  return todayLocal();
}

// Format date for display
function formatDisplayDate(dateString: string): string {
  const date = new Date(dateString + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Format relative time
function formatRelativeTime(dateString: string): string {
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

export default function TimeOffPage() {
  const router = useRouter();
  const { profile, isManager, loading: authLoading } = useAuth();
  const {
    fetchMyRequests,
    fetchAllRequests,
    fetchPendingRequests,
    submitRequest,
    approveRequest,
    denyRequest,
    cancelRequest,
    getConflicts,
    loading: timeOffLoading,
  } = useTimeOff();
  const { allStaff } = useProfiles();
  const { createNotification } = useNotifications();

  // My requests state
  const [myRequests, setMyRequests] = useState<TimeOffRequestWithProfile[]>([]);

  // Manager view state
  const [pendingRequests, setPendingRequests] = useState<TimeOffRequestWithProfile[]>([]);
  const [allRequests, setAllRequests] = useState<TimeOffRequestWithProfile[]>([]);

  // New request form state
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<CreateTimeOffRequestData>({
    start_date: getTodayString(),
    end_date: getTodayString(),
    request_type: "vacation",
    reason: "",
  });
  const [formConflicts, setFormConflicts] = useState<DateRangeConflict[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Filter state (for managers)
  const [statusFilter, setStatusFilter] = useState<TimeOffRequestStatus | "all">("all");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Deny modal state
  const [denyingRequest, setDenyingRequest] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");

  // Loading state
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Always load my requests
      const myData = await fetchMyRequests();
      setMyRequests(myData);

      // If manager, also load pending and all requests
      if (isManager) {
        const [pending, all] = await Promise.all([
          fetchPendingRequests(),
          fetchAllRequests(),
        ]);
        setPendingRequests(pending);
        setAllRequests(all);
      }
    } catch (err) {
      console.error("Error loading time-off data:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchMyRequests, fetchAllRequests, fetchPendingRequests, isManager]);

  useEffect(() => {
    if (!authLoading) {
      loadData();
    }
  }, [authLoading, loadData]);

  // Check conflicts when date range changes
  useEffect(() => {
    const checkConflicts = async () => {
      if (formData.start_date && formData.end_date) {
        const conflicts = await getConflicts(formData.start_date, formData.end_date);
        setFormConflicts(conflicts);
      }
    };
    checkConflicts();
  }, [formData.start_date, formData.end_date, getConflicts]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const result = await submitRequest(formData);
      if (result) {
        // Reset form
        setFormData({
          start_date: getTodayString(),
          end_date: getTodayString(),
          request_type: "vacation",
          reason: "",
        });
        setShowForm(false);
        // Reload data
        await loadData();
      }
    } catch (err) {
      console.error("Error submitting request:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle cancel request
  const handleCancel = async (id: string) => {
    setActionLoading(id);
    try {
      const success = await cancelRequest(id);
      if (success) {
        await loadData();
      }
    } catch (err) {
      console.error("Error canceling request:", err);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle approve request
  const handleApprove = async (request: TimeOffRequestWithProfile) => {
    setActionLoading(request.id);
    try {
      const success = await approveRequest(request.id);
      if (success) {
        // Create notification for the requester
        const requesterName = profile?.full_name || "Manager";
        await createNotification(
          request.user_id,
          "schedule_change",
          "Time Off Approved",
          `Your ${timeOffTypeLabels[request.request_type || "other"]} request for ${formatDateRange(request.start_date, request.end_date)} has been approved by ${requesterName}.`,
          "time_off_request",
          request.id
        );
        await loadData();
      }
    } catch (err) {
      console.error("Error approving request:", err);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle deny request
  const handleDeny = async () => {
    if (!denyingRequest) return;

    setActionLoading(denyingRequest);
    try {
      const request = pendingRequests.find((r) => r.id === denyingRequest);
      const success = await denyRequest(denyingRequest, denyReason || undefined);
      if (success && request) {
        // Create notification for the requester
        const requesterName = profile?.full_name || "Manager";
        const reason = denyReason ? ` Reason: ${denyReason}` : "";
        await createNotification(
          request.user_id,
          "schedule_change",
          "Time Off Denied",
          `Your ${timeOffTypeLabels[request.request_type || "other"]} request for ${formatDateRange(request.start_date, request.end_date)} has been denied by ${requesterName}.${reason}`,
          "time_off_request",
          request.id
        );
        setDenyingRequest(null);
        setDenyReason("");
        await loadData();
      }
    } catch (err) {
      console.error("Error denying request:", err);
    } finally {
      setActionLoading(null);
    }
  };

  // Filtered all requests for manager view
  const filteredRequests = useMemo(() => {
    return allRequests.filter((request) => {
      // Status filter
      if (statusFilter !== "all" && request.status !== statusFilter) {
        return false;
      }

      // Staff filter
      if (staffFilter !== "all" && request.user_id !== staffFilter) {
        return false;
      }

      // Search query
      if (searchQuery) {
        const name = request.profile?.full_name?.toLowerCase() || "";
        const displayName = request.profile?.display_name?.toLowerCase() || "";
        const query = searchQuery.toLowerCase();
        if (!name.includes(query) && !displayName.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [allRequests, statusFilter, staffFilter, searchQuery]);

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-20 md:pb-6">
      <div className="p-4 md:p-6">
        <PageHeader
          title="Time Off"
          description="Request and manage time off"
          icon={Calendar}
        >
          <Button variant="ghost" size="sm" onClick={() => router.push("/schedule")}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Schedule
          </Button>
        </PageHeader>

        {/* Manager View: Pending Approvals */}
        {isManager && pendingRequests.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              Pending Approvals ({pendingRequests.length})
            </h2>

            <div className="grid gap-4 md:grid-cols-2">
              {pendingRequests.map((request) => {
                const days = calculateDays(request.start_date, request.end_date);
                const isActioning = actionLoading === request.id;

                return (
                  <div
                    key={request.id}
                    className="bg-card rounded-lg border border-border p-4"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-medium text-primary">
                            {getDisplayName(request.profile as Profile)
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">
                            {getDisplayName(request.profile as Profile)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {roleLabels[(request.profile as Profile)?.role || "crew"]}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          timeOffTypeColors[request.request_type || "other"].bg
                        } ${timeOffTypeColors[request.request_type || "other"].text}`}
                      >
                        {timeOffTypeLabels[request.request_type || "other"]}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span>{formatDateRange(request.start_date, request.end_date)}</span>
                        <span className="text-muted-foreground">
                          ({days} day{days !== 1 ? "s" : ""})
                        </span>
                      </div>

                      {request.reason && (
                        <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
                          {request.reason}
                        </p>
                      )}

                      {/* Staff conflicts */}
                      <ConflictWarning
                        startDate={request.start_date}
                        endDate={request.end_date}
                        getConflicts={getConflicts}
                        excludeUserId={request.user_id}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(request)}
                        disabled={isActioning}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                      >
                        {isActioning ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Check className="w-4 h-4 mr-1" />
                            Approve
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDenyingRequest(request.id)}
                        disabled={isActioning}
                        className="flex-1"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Deny
                      </Button>
                    </div>

                    {/* Submitted time */}
                    <p className="text-xs text-muted-foreground mt-3 text-center">
                      Submitted {formatRelativeTime(request.created_at)}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* New Request Form */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              {showForm ? "New Request" : "Request Time Off"}
            </h2>
            {!showForm && (
              <Button size="sm" onClick={() => setShowForm(true)}>
                <CalendarPlus className="w-4 h-4 mr-2" />
                New Request
              </Button>
            )}
          </div>

          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="bg-card rounded-lg border border-border p-4 md:p-6"
            >
              <div className="grid gap-4 md:grid-cols-2">
                {/* Request Type */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Type</label>
                  <div className="flex flex-wrap gap-2">
                    {requestTypeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, request_type: option.value })
                        }
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          formData.request_type === option.value
                            ? `${timeOffTypeColors[option.value].bg} ${
                                timeOffTypeColors[option.value].text
                              } ring-2 ring-offset-2 ring-primary/50`
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-sm font-medium mb-2">Start Date</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    min={getTodayString()}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      setFormData({
                        ...formData,
                        start_date: newStart,
                        end_date:
                          formData.end_date < newStart ? newStart : formData.end_date,
                      });
                    }}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                    required
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-sm font-medium mb-2">End Date</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    min={formData.start_date}
                    onChange={(e) =>
                      setFormData({ ...formData, end_date: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                    required
                  />
                </div>

                {/* Duration display */}
                <div className="md:col-span-2 bg-muted/50 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Duration</span>
                  <span className="font-medium">
                    {calculateDays(formData.start_date, formData.end_date)} day
                    {calculateDays(formData.start_date, formData.end_date) !== 1
                      ? "s"
                      : ""}
                  </span>
                </div>

                {/* Conflict warning */}
                {formConflicts.length > 0 && (
                  <div className="md:col-span-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-amber-600 font-medium mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      Staff Already Off
                    </div>
                    <div className="space-y-1">
                      {formConflicts.slice(0, 3).map((conflict) => (
                        <div key={conflict.date} className="text-sm">
                          <span className="text-muted-foreground">
                            {formatDisplayDate(conflict.date)}:
                          </span>{" "}
                          <span>
                            {conflict.users.map((u) => u.name).join(", ")}
                          </span>
                        </div>
                      ))}
                      {formConflicts.length > 3 && (
                        <p className="text-xs text-muted-foreground">
                          +{formConflicts.length - 3} more days with staff off
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Reason */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">
                    Reason{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={formData.reason || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, reason: e.target.value })
                    }
                    placeholder="Any additional details..."
                    rows={3}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex gap-3 mt-6">
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <CalendarPlus className="w-4 h-4 mr-2" />
                  )}
                  Submit Request
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </section>

        {/* My Requests */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">My Requests</h2>

          {myRequests.length === 0 ? (
            <div className="bg-muted/50 rounded-lg p-8 text-center text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No time-off requests yet</p>
              <p className="text-sm mt-1">Submit a request above</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myRequests.map((request) => {
                const days = calculateDays(request.start_date, request.end_date);
                const isPending = request.status === "pending";
                const isActioning = actionLoading === request.id;

                return (
                  <div
                    key={request.id}
                    className="bg-card rounded-lg border border-border p-4 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {/* Status indicator */}
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          timeOffStatusColors[request.status].bg
                        }`}
                      >
                        {request.status === "pending" && (
                          <Clock
                            className={`w-5 h-5 ${timeOffStatusColors[request.status].text}`}
                          />
                        )}
                        {request.status === "approved" && (
                          <CheckCircle2
                            className={`w-5 h-5 ${timeOffStatusColors[request.status].text}`}
                          />
                        )}
                        {request.status === "denied" && (
                          <XCircle
                            className={`w-5 h-5 ${timeOffStatusColors[request.status].text}`}
                          />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              timeOffTypeColors[request.request_type || "other"].bg
                            } ${timeOffTypeColors[request.request_type || "other"].text}`}
                          >
                            {timeOffTypeLabels[request.request_type || "other"]}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              timeOffStatusColors[request.status].bg
                            } ${timeOffStatusColors[request.status].text}`}
                          >
                            {timeOffStatusLabels[request.status]}
                          </span>
                        </div>
                        <p className="text-sm font-medium mt-1">
                          {formatDateRange(request.start_date, request.end_date)}
                          <span className="text-muted-foreground ml-2">
                            ({days} day{days !== 1 ? "s" : ""})
                          </span>
                        </p>
                        {request.reviewer && request.reviewed_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {request.status === "approved" ? "Approved" : "Denied"} by{" "}
                            {request.reviewer.full_name} on{" "}
                            {formatDisplayDate(request.reviewed_at.split("T")[0])}
                          </p>
                        )}
                        {request.notes && request.status === "denied" && (
                          <p className="text-xs text-red-600 mt-1">
                            Reason: {request.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Cancel button for pending */}
                    {isPending && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCancel(request.id)}
                        disabled={isActioning}
                        className="text-destructive hover:text-destructive"
                      >
                        {isActioning ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Manager: All Requests */}
        {isManager && (
          <section>
            <h2 className="text-lg font-semibold mb-4">All Requests</h2>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name..."
                  className="w-full pl-9 pr-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as TimeOffRequestStatus | "all")
                }
                className="px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {statusFilterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Staff filter */}
              <select
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="all">All Staff</option>
                {allStaff
                  .filter((s) => s.role !== "super")
                  .map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {getDisplayName(staff)}
                    </option>
                  ))}
              </select>
            </div>

            {/* Requests table */}
            {filteredRequests.length === 0 ? (
              <div className="bg-muted/50 rounded-lg p-8 text-center text-muted-foreground">
                <Filter className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No requests match your filters</p>
              </div>
            ) : (
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                          Staff
                        </th>
                        <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                          Type
                        </th>
                        <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                          Dates
                        </th>
                        <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                          Days
                        </th>
                        <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                          Status
                        </th>
                        <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">
                          Submitted
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map((request) => {
                        const days = calculateDays(request.start_date, request.end_date);

                        return (
                          <tr
                            key={request.id}
                            className="border-b border-border last:border-b-0 hover:bg-muted/30"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                  <span className="text-xs font-medium text-primary">
                                    {getDisplayName(request.profile as Profile)
                                      .split(" ")
                                      .map((n) => n[0])
                                      .join("")}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-sm font-medium">
                                    {getDisplayName(request.profile as Profile)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {
                                      roleLabels[
                                        (request.profile as Profile)?.role || "crew"
                                      ]
                                    }
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  timeOffTypeColors[request.request_type || "other"].bg
                                } ${
                                  timeOffTypeColors[request.request_type || "other"].text
                                }`}
                              >
                                {timeOffTypeLabels[request.request_type || "other"]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {formatDateRange(request.start_date, request.end_date)}
                            </td>
                            <td className="px-4 py-3 text-sm">{days}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  timeOffStatusColors[request.status].bg
                                } ${timeOffStatusColors[request.status].text}`}
                              >
                                {timeOffStatusLabels[request.status]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {formatRelativeTime(request.created_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile list */}
                <div className="md:hidden divide-y divide-border">
                  {filteredRequests.map((request) => {
                    const days = calculateDays(request.start_date, request.end_date);

                    return (
                      <div key={request.id} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-xs font-medium text-primary">
                                {getDisplayName(request.profile as Profile)
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")}
                              </span>
                            </div>
                            <span className="font-medium text-sm">
                              {getDisplayName(request.profile as Profile)}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              timeOffStatusColors[request.status].bg
                            } ${timeOffStatusColors[request.status].text}`}
                          >
                            {timeOffStatusLabels[request.status]}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              timeOffTypeColors[request.request_type || "other"].bg
                            } ${timeOffTypeColors[request.request_type || "other"].text}`}
                          >
                            {timeOffTypeLabels[request.request_type || "other"]}
                          </span>
                          <span className="text-muted-foreground">
                            {formatDateRange(request.start_date, request.end_date)} ({days}{" "}
                            day{days !== 1 ? "s" : ""})
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Deny Modal */}
      {denyingRequest && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setDenyingRequest(null)}
          />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-card rounded-lg border border-border shadow-lg z-50 p-6">
            <h3 className="text-lg font-semibold mb-4">Deny Request</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Provide an optional reason for denying this request.
            </p>
            <textarea
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Reason for denial (optional)..."
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none mb-4"
            />
            <div className="flex gap-3">
              <Button
                onClick={handleDeny}
                disabled={actionLoading === denyingRequest}
                variant="destructive"
                className="flex-1"
              >
                {actionLoading === denyingRequest ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Deny Request"
                )}
              </Button>
              <Button variant="outline" onClick={() => setDenyingRequest(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Conflict warning component
function ConflictWarning({
  startDate,
  endDate,
  getConflicts,
  excludeUserId,
}: {
  startDate: string;
  endDate: string;
  getConflicts: (start: string, end: string) => Promise<DateRangeConflict[]>;
  excludeUserId?: string;
}) {
  const [conflicts, setConflicts] = useState<DateRangeConflict[]>([]);

  useEffect(() => {
    const load = async () => {
      const data = await getConflicts(startDate, endDate);
      // Filter out the requesting user if provided
      if (excludeUserId) {
        setConflicts(
          data
            .map((c) => ({
              ...c,
              users: c.users.filter((u) => u.id !== excludeUserId),
              count: c.users.filter((u) => u.id !== excludeUserId).length,
            }))
            .filter((c) => c.count > 0)
        );
      } else {
        setConflicts(data);
      }
    };
    load();
  }, [startDate, endDate, getConflicts, excludeUserId]);

  if (conflicts.length === 0) return null;

  // Get unique users
  const allUsers = new Map<string, string>();
  conflicts.forEach((c) => c.users.forEach((u) => allUsers.set(u.id, u.name)));
  const userList = Array.from(allUsers.values());

  return (
    <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-500/10 rounded px-2 py-1">
      <Users className="w-4 h-4 shrink-0" />
      <span>
        {userList.length} staff already off: {userList.slice(0, 3).join(", ")}
        {userList.length > 3 && ` +${userList.length - 3} more`}
      </span>
    </div>
  );
}
