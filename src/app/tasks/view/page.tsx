"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  ChevronDown,
  Edit2,
  MoreVertical,
  User,
  Calendar,
  Clock,
  MapPin,
  Wrench,
  Package,
  Cloud,
  CheckCircle2,
  Circle,
  Camera,
  Upload,
  Plus,
  MessageSquare,
  Play,
  CheckCheck,
  Shield,
  AlertOctagon,
  Trash2,
  Copy,
  Share2,
  Loader2,
  X,
  ImageIcon,
  SplitSquareHorizontal,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailPageHeader } from "@/components/ui/back-button";
import { useAuth } from "@/lib/hooks/useAuth";
import { getLocalized, type SupportedLocale } from "@/lib/utils/localized-text";
import { useTasks, type TaskWithRelations } from "@/lib/hooks/useTasks";
import { formatZoneName } from "@/lib/hooks/useCourseZones";
import { useChemicals, type ActiveREI } from "@/lib/hooks/useChemicals";
import { findREIConflicts } from "@/lib/utils/rei-conflicts";
import { REIWarningBanner } from "@/components/features/chemicals/rei-warning-banner";
import { getDisplayName, roleLabels } from "@/lib/hooks/useProfiles";
import { createClient } from "@/lib/supabase/client";
import { usePhotos, photoTypeLabels } from "@/lib/hooks/usePhotos";
import { CameraCaptureModal } from "@/components/features/photos/camera-capture";
import { BeforeAfterModal } from "@/components/features/photos/before-after-slider";
import type {
  TaskStatus,
  TaskPriority,
  TaskCategory,
  ChecklistItem,
  Photo,
  PhotoType,
} from "@/types/database";

// Priority styles
const priorityColors: Record<TaskPriority, string> = {
  critical: "bg-red-500 text-white",
  high: "bg-orange-500 text-white",
  normal: "bg-green-500 text-white",
  low: "bg-gray-400 text-white",
};

const priorityLabels: Record<TaskPriority, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

// Status styles
const statusColors: Record<TaskStatus, { bg: string; text: string }> = {
  pending: { bg: "bg-gray-100", text: "text-gray-700" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-700" },
  completed: { bg: "bg-green-100", text: "text-green-700" },
  verified: { bg: "bg-primary/10", text: "text-primary" },
  blocked: { bg: "bg-red-100", text: "text-red-700" },
  deferred: { bg: "bg-amber-100", text: "text-amber-700" },
  cancelled: { bg: "bg-gray-200", text: "text-gray-500" },
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

// Activity types
interface ActivityItem {
  id: string;
  type: "status_change" | "note" | "photo" | "checklist" | "assignment";
  message: string;
  user_name: string;
  timestamp: string;
}

// Helper functions
function formatDate(dateString: string): string {
  const date = new Date(dateString + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === tomorrow.getTime()) return "Tomorrow";

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function formatTime(timeString: string | null): string {
  if (!timeString) return "";
  const [hours, minutes] = timeString.split(":");
  const h = parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return "Not estimated";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function PageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get("id") ?? "";

  const { user, profile, isManager, isSuper } = useAuth();
  const locale: SupportedLocale = profile?.language_preference === "es" ? "es" : "en";
  const { getTask, updateTask, updateTaskStatus, completeTask, verifyTask, deleteTask } = useTasks();
  const { getActiveREIs } = useChemicals();

  const [task, setTask] = useState<TaskWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active Restricted Entry Intervals — so the assignee sees a warning before
  // heading out to a zone/hole that's still chemically restricted.
  const [activeREIs, setActiveREIs] = useState<ActiveREI[]>([]);
  useEffect(() => {
    let cancelled = false;
    getActiveREIs()
      .then((reis) => {
        if (!cancelled) setActiveREIs(reis);
      })
      .catch(() => {
        /* non-blocking */
      });
    return () => {
      cancelled = true;
    };
  }, [getActiveREIs]);

  const reiConflicts = useMemo(
    () =>
      task
        ? findREIConflicts(
            { zone_id: task.zone_id, hole_numbers: task.hole_numbers ?? [] },
            activeREIs,
          )
        : [],
    [task, activeREIs],
  );

  // UI state
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    details: true,
    checklist: true,
    photos: true,
    notes: true,
  });

  // Photos state - using the photos hook
  const { fetchTaskPhotos, getPhotoUrl, getThumbnailUrl } = usePhotos();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraPhotoType, setCameraPhotoType] = useState<PhotoType>("before");
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  // Notes state
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  const supabase = createClient();

  // Fetch task data
  const fetchTaskData = useCallback(async () => {
    if (!taskId) return;

    setLoading(true);
    setError(null);

    try {
      const taskData = await getTask(taskId);
      if (!taskData) {
        setError("Task not found");
        return;
      }
      setTask(taskData);

      // Fetch photos for this task using the photos hook
      const taskPhotos = await fetchTaskPhotos(taskId);
      setPhotos(taskPhotos);

      // Generate activity timeline from task data
      const activityItems: ActivityItem[] = [];

      if (taskData.created_at) {
        activityItems.push({
          id: "created",
          type: "status_change",
          message: "Task created",
          user_name: taskData.assigned_by_user?.full_name || "System",
          timestamp: taskData.created_at,
        });
      }

      if (taskData.completed_at && taskData.completed_by_user) {
        activityItems.push({
          id: "completed",
          type: "status_change",
          message: "Marked as completed",
          user_name: taskData.completed_by_user.full_name,
          timestamp: taskData.completed_at,
        });
      }

      if (taskData.verified_at && taskData.verified_by_user) {
        activityItems.push({
          id: "verified",
          type: "status_change",
          message: "Verified and approved",
          user_name: taskData.verified_by_user.full_name,
          timestamp: taskData.verified_at,
        });
      }

      setActivities(activityItems.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ));
    } catch (err) {
      console.error("Error fetching task:", err);
      setError("Failed to load task");
    } finally {
      setLoading(false);
    }
  }, [taskId, getTask, fetchTaskPhotos]);

  useEffect(() => {
    fetchTaskData();
  }, [fetchTaskData]);

  // Handle status change
  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (!task) return;

    setSaving(true);
    setShowStatusDropdown(false);

    try {
      const success = await updateTaskStatus(task.id, newStatus);
      if (success) {
        setTask((prev) => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (err) {
      console.error("Error updating status:", err);
    } finally {
      setSaving(false);
    }
  };

  // Handle checklist toggle
  const handleChecklistToggle = async (itemId: string) => {
    if (!task) return;

    const updatedChecklist = task.checklist.map((item) =>
      item.id === itemId ? { ...item, checked: !item.checked } : item
    );

    // Optimistic update
    setTask((prev) => prev ? { ...prev, checklist: updatedChecklist } : null);

    try {
      await updateTask(task.id, { checklist: updatedChecklist } as Record<string, unknown>);
    } catch (err) {
      console.error("Error updating checklist:", err);
      // Revert on error
      setTask((prev) => prev ? { ...prev, checklist: task.checklist } : null);
    }
  };

  // Calculate checklist progress
  const checklistProgress = task?.checklist?.length
    ? Math.round(
        (task.checklist.filter((item) => item.checked).length / task.checklist.length) * 100
      )
    : 0;

  // Handle photo saved from camera modal
  const handlePhotoSaved = useCallback((photo: Photo) => {
    setPhotos((prev) => [...prev, photo]);
    setShowCameraModal(false);
  }, []);

  // Open camera modal for specific photo type
  const openCameraForType = useCallback((type: PhotoType) => {
    setCameraPhotoType(type);
    setShowCameraModal(true);
  }, []);

  // Handle action buttons
  const handleStartTask = async () => {
    if (!task) return;
    await handleStatusChange("in_progress");
  };

  const handleCompleteTask = async () => {
    if (!task) return;

    setSaving(true);
    try {
      const success = await completeTask(task.id);
      if (success) {
        setTask((prev) => prev ? {
          ...prev,
          status: "completed",
          completed_at: new Date().toISOString(),
          completed_by: user?.id || null,
        } : null);
      }
    } catch (err) {
      console.error("Error completing task:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyTask = async () => {
    if (!task) return;

    setSaving(true);
    try {
      const success = await verifyTask(task.id);
      if (success) {
        setTask((prev) => prev ? {
          ...prev,
          status: "verified",
          verified_at: new Date().toISOString(),
          verified_by: user?.id || null,
        } : null);
      }
    } catch (err) {
      console.error("Error verifying task:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleBlockTask = async () => {
    if (!task) return;
    await handleStatusChange("blocked");
  };

  const handleDeleteTask = async () => {
    if (!task || !confirm("Are you sure you want to delete this task?")) return;

    setSaving(true);
    try {
      const success = await deleteTask(task.id);
      if (success) {
        router.push("/tasks");
      }
    } catch (err) {
      console.error("Error deleting task:", err);
    } finally {
      setSaving(false);
    }
  };

  // Handle add note
  const handleAddNote = async () => {
    if (!task || !newNote.trim() || !profile) return;

    setAddingNote(true);

    try {
      // Append note to existing notes
      const updatedNotes = task.notes
        ? `${task.notes}\n\n---\n${profile.full_name} (${new Date().toLocaleString()}):\n${newNote}`
        : `${profile.full_name} (${new Date().toLocaleString()}):\n${newNote}`;

      await updateTask(task.id, { notes: updatedNotes });
      setTask((prev) => prev ? { ...prev, notes: updatedNotes } : null);

      // Add to activity
      setActivities((prev) => [
        {
          id: `note-${Date.now()}`,
          type: "note",
          message: newNote,
          user_name: profile.full_name,
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ]);

      setNewNote("");
    } catch (err) {
      console.error("Error adding note:", err);
    } finally {
      setAddingNote(false);
    }
  };

  // Toggle section expansion
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Determine which action button to show
  const getActionButton = () => {
    if (!task) return null;

    switch (task.status) {
      case "pending":
        return (
          <Button
            onClick={handleStartTask}
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            <Play className="w-4 h-4 mr-2" />
            Start Task
          </Button>
        );
      case "in_progress":
        return (
          <Button
            onClick={handleCompleteTask}
            disabled={saving}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <CheckCheck className="w-4 h-4 mr-2" />
            Mark Complete
          </Button>
        );
      case "completed":
        if (isManager || isSuper) {
          return (
            <Button
              onClick={handleVerifyTask}
              disabled={saving}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              <Shield className="w-4 h-4 mr-2" />
              Verify & Approve
            </Button>
          );
        }
        return (
          <div className="flex-1 text-center py-2 text-green-600 font-medium">
            Awaiting Verification
          </div>
        );
      case "verified":
        return (
          <div className="flex-1 text-center py-2 text-primary font-medium">
            Task Verified
          </div>
        );
      case "blocked":
        return (
          <Button
            onClick={() => handleStatusChange("in_progress")}
            disabled={saving}
            className="flex-1"
          >
            Unblock & Resume
          </Button>
        );
      default:
        return null;
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (error || !task) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertOctagon className="w-12 h-12 text-red-500" />
        <p className="text-lg text-muted-foreground">{error || "Task not found"}</p>
        <Button onClick={() => router.push("/tasks")} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Tasks
        </Button>
      </div>
    );
  }

  // Filter photos by type
  const beforePhotos = photos.filter((p) => p.photo_type === "before");
  const afterPhotos = photos.filter((p) => p.photo_type === "after");
  const otherPhotos = photos.filter((p) => !["before", "after"].includes(p.photo_type));

  return (
    <div className="pb-40">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border p-4">
        <DetailPageHeader
          backHref="/tasks"
          backLabel="Tasks"
          title={getLocalized(task as unknown as Record<string, unknown>, "title", locale)}
          subtitle={`${categoryLabels[task.category]} • ${task.zone ? formatZoneName(task.zone as { name: string; zone_type: string; hole_number: number | null }) : "No location"}`}
          actions={
            <div className="flex items-center gap-1">
              {(isManager || task.assigned_to === user?.id) && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push(`/tasks/edit?id=${task.id}`)}
                >
                  <Edit2 className="w-5 h-5" />
                </Button>
              )}

              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                >
                  <MoreVertical className="w-5 h-5" />
                </Button>

                {showMoreMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setShowMoreMenu(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg z-40 overflow-hidden">
                      <button
                        className="w-full px-4 py-2.5 text-sm text-left hover:bg-muted flex items-center gap-2"
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.href);
                          setShowMoreMenu(false);
                        }}
                      >
                        <Copy className="w-4 h-4" />
                        Copy Link
                      </button>
                      <button
                        className="w-full px-4 py-2.5 text-sm text-left hover:bg-muted flex items-center gap-2"
                        onClick={() => {
                          // Duplicate functionality
                          setShowMoreMenu(false);
                        }}
                      >
                        <Share2 className="w-4 h-4" />
                        Duplicate Task
                      </button>
                      {isManager && (
                        <button
                          className="w-full px-4 py-2.5 text-sm text-left hover:bg-muted flex items-center gap-2 text-red-600"
                          onClick={() => {
                            handleDeleteTask();
                            setShowMoreMenu(false);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete Task
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          }
          className="mb-0"
        />

        {/* Status and Priority row */}
        <div className="flex items-center gap-3 mt-4">
          {/* Status dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${statusColors[task.status].bg} ${statusColors[task.status].text}`}
            >
              {statusLabels[task.status]}
              <ChevronDown className="w-4 h-4" />
            </button>

            {showStatusDropdown && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowStatusDropdown(false)}
                />
                <div className="absolute left-0 top-full mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg z-40 overflow-hidden">
                  {(Object.keys(statusLabels) as TaskStatus[]).map((status) => (
                    <button
                      key={status}
                      className={`w-full px-4 py-2.5 text-sm text-left hover:bg-muted flex items-center gap-2 ${
                        task.status === status ? "bg-muted" : ""
                      }`}
                      onClick={() => handleStatusChange(status)}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${statusColors[status].bg}`}
                      />
                      {statusLabels[status]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Priority badge */}
          <span
            className={`px-3 py-1.5 rounded-full text-sm font-medium ${priorityColors[task.priority]}`}
          >
            {priorityLabels[task.priority]}
          </span>

          {/* Category badge */}
          <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-muted text-muted-foreground">
            {categoryLabels[task.category]}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* REI conflict warning — surfaced at the top so the assignee sees it
            before doing the work. */}
        <REIWarningBanner conflicts={reiConflicts} />

        {/* Details Section */}
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection("details")}
            className="w-full flex items-center justify-between p-4 hover:bg-muted/50"
          >
            <span className="font-medium">Details</span>
            <ChevronDown
              className={`w-5 h-5 text-muted-foreground transition-transform ${
                expandedSections.details ? "rotate-180" : ""
              }`}
            />
          </button>

          {expandedSections.details && (
            <div className="px-4 pb-4 space-y-4">
              {/* Description */}
              {task.description && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Description</p>
                  <p className="text-sm whitespace-pre-wrap">{getLocalized(task as unknown as Record<string, unknown>, "description", locale)}</p>
                </div>
              )}

              {/* Assignee */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  {task.assigned_user?.avatar_url ? (
                    <Image
                      src={task.assigned_user.avatar_url}
                      alt=""
                      width={40}
                      height={40}
                      className="rounded-full"
                    />
                  ) : (
                    <User className="w-5 h-5 text-primary" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Assigned to</p>
                  <p className="font-medium">
                    {task.assigned_user
                      ? task.assigned_user.full_name || "Unknown"
                      : "Unassigned"}
                  </p>
                  {task.assigned_user?.role && (
                    <p className="text-xs text-muted-foreground">
                      {roleLabels[task.assigned_user.role]}
                    </p>
                  )}
                </div>
              </div>

              {/* Due Date & Time */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Due Date</p>
                  <p className="font-medium">{formatDate(task.due_date)}</p>
                  {task.due_time && (
                    <p className="text-xs text-muted-foreground">
                      {formatTime(task.due_time)}
                    </p>
                  )}
                </div>
              </div>

              {/* Location */}
              {task.zone && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Location</p>
                    <p className="font-medium">{formatZoneName(task.zone as { name: string; zone_type: string; hole_number: number | null })}</p>
                    {task.hole_numbers && task.hole_numbers.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Holes: {task.hole_numbers.join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Duration */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Estimated Duration</p>
                  <p className="font-medium">{formatDuration(task.estimated_minutes)}</p>
                  {task.actual_minutes && (
                    <p className="text-xs text-muted-foreground">
                      Actual: {formatDuration(task.actual_minutes)}
                    </p>
                  )}
                </div>
              </div>

              {/* Equipment */}
              {task.equipment_needed && task.equipment_needed.length > 0 && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                    <Wrench className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Equipment Needed</p>
                    <div className="flex flex-wrap gap-1.5">
                      {task.equipment_needed.map((item, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 bg-muted rounded text-sm"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Materials */}
              {task.materials_needed && task.materials_needed.length > 0 && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Materials Needed</p>
                    <div className="space-y-1">
                      {task.materials_needed.map((item, idx) => (
                        <div key={idx} className="text-sm">
                          {item.quantity} {item.unit} of {item.name}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Weather conditions */}
              {task.weather_dependent && task.weather_conditions && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center shrink-0">
                    <Cloud className="w-5 h-5 text-cyan-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Weather Requirements</p>
                    <div className="text-sm space-y-0.5">
                      {task.weather_conditions.min_temp && (
                        <p>Min temp: {task.weather_conditions.min_temp}°F</p>
                      )}
                      {task.weather_conditions.max_temp && (
                        <p>Max temp: {task.weather_conditions.max_temp}°F</p>
                      )}
                      {task.weather_conditions.max_wind && (
                        <p>Max wind: {task.weather_conditions.max_wind} mph</p>
                      )}
                      {task.weather_conditions.no_rain && (
                        <p>No rain required</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Checklist Section */}
        {task.checklist && task.checklist.length > 0 && (
          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => toggleSection("checklist")}
              className="w-full flex items-center justify-between p-4 hover:bg-muted/50"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium">Checklist</span>
                <span className="text-sm text-muted-foreground">
                  {task.checklist.filter((i) => i.checked).length}/{task.checklist.length}
                </span>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-muted-foreground transition-transform ${
                  expandedSections.checklist ? "rotate-180" : ""
                }`}
              />
            </button>

            {expandedSections.checklist && (
              <div className="px-4 pb-4">
                {/* Progress bar */}
                <div className="h-2 bg-muted rounded-full overflow-hidden mb-4">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${checklistProgress}%` }}
                  />
                </div>

                {/* Checklist items */}
                <div className="space-y-2">
                  {task.checklist.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleChecklistToggle(item.id)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                    >
                      {item.checked ? (
                        <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
                      )}
                      <span
                        className={`text-sm ${
                          item.checked ? "text-muted-foreground line-through" : ""
                        }`}
                      >
                        {item.text}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Photos Section */}
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection("photos")}
            className="w-full flex items-center justify-between p-4 hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">Photos</span>
              {photos.length > 0 && (
                <span className="text-sm text-muted-foreground">{photos.length}</span>
              )}
              {/* Photo requirement warning */}
              {((task.requires_photo_before && beforePhotos.length === 0) ||
                (task.requires_photo_after && afterPhotos.length === 0)) && (
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              )}
            </div>
            <ChevronDown
              className={`w-5 h-5 text-muted-foreground transition-transform ${
                expandedSections.photos ? "rotate-180" : ""
              }`}
            />
          </button>

          {expandedSections.photos && (
            <div className="px-4 pb-4 space-y-4">
              {/* Compare button - show when both before and after exist */}
              {beforePhotos.length > 0 && afterPhotos.length > 0 && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowCompareModal(true)}
                >
                  <SplitSquareHorizontal className="w-4 h-4 mr-2" />
                  Compare Before & After
                </Button>
              )}

              {/* Before photos */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-muted-foreground">Before</p>
                  {task.requires_photo_before && beforePhotos.length === 0 && (
                    <span className="text-xs text-red-500 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Required
                    </span>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {beforePhotos.map((photo) => (
                    <button
                      key={photo.id}
                      onClick={() => setSelectedPhotoIndex(photos.findIndex((p) => p.id === photo.id))}
                      className="w-20 h-20 rounded-lg overflow-hidden bg-muted relative hover:ring-2 hover:ring-primary transition-all"
                    >
                      <Image
                        src={getThumbnailUrl(photo) || getPhotoUrl(photo)}
                        alt=""
                        fill
                        className="object-cover"
                      />
                    </button>
                  ))}
                  <button
                    onClick={() => openCameraForType("before")}
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:bg-muted/50 hover:border-primary transition-colors"
                  >
                    <Camera className="w-5 h-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Add</span>
                  </button>
                </div>
              </div>

              {/* After photos */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-muted-foreground">After</p>
                  {task.requires_photo_after && afterPhotos.length === 0 && (
                    <span className="text-xs text-red-500 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Required
                    </span>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {afterPhotos.map((photo) => (
                    <button
                      key={photo.id}
                      onClick={() => setSelectedPhotoIndex(photos.findIndex((p) => p.id === photo.id))}
                      className="w-20 h-20 rounded-lg overflow-hidden bg-muted relative hover:ring-2 hover:ring-primary transition-all"
                    >
                      <Image
                        src={getThumbnailUrl(photo) || getPhotoUrl(photo)}
                        alt=""
                        fill
                        className="object-cover"
                      />
                    </button>
                  ))}
                  <button
                    onClick={() => openCameraForType("after")}
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:bg-muted/50 hover:border-primary transition-colors"
                  >
                    <Camera className="w-5 h-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Add</span>
                  </button>
                </div>
              </div>

              {/* Other photos */}
              {otherPhotos.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Other</p>
                  <div className="flex gap-2 flex-wrap">
                    {otherPhotos.map((photo) => (
                      <button
                        key={photo.id}
                        onClick={() => setSelectedPhotoIndex(photos.findIndex((p) => p.id === photo.id))}
                        className="w-20 h-20 rounded-lg overflow-hidden bg-muted relative hover:ring-2 hover:ring-primary transition-all"
                      >
                        <Image
                          src={getThumbnailUrl(photo) || getPhotoUrl(photo)}
                          alt=""
                          fill
                          className="object-cover"
                        />
                        {/* Photo type badge */}
                        <div className="absolute bottom-1 left-1 right-1 text-center">
                          <span className="text-[10px] font-medium bg-black/50 text-white px-1 py-0.5 rounded">
                            {photoTypeLabels[photo.photo_type]}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Photo requirement warning banner */}
              {((task.requires_photo_before && beforePhotos.length === 0) ||
                (task.requires_photo_after && afterPhotos.length === 0)) &&
                task.status === "in_progress" && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-sm text-amber-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      {task.requires_photo_before && beforePhotos.length === 0 && task.requires_photo_after && afterPhotos.length === 0
                        ? "Before and after photos are required to complete this task"
                        : task.requires_photo_before && beforePhotos.length === 0
                        ? "A before photo is required to complete this task"
                        : "An after photo is required to complete this task"}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Notes & Activity Section */}
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection("notes")}
            className="w-full flex items-center justify-between p-4 hover:bg-muted/50"
          >
            <span className="font-medium">Notes & Activity</span>
            <ChevronDown
              className={`w-5 h-5 text-muted-foreground transition-transform ${
                expandedSections.notes ? "rotate-180" : ""
              }`}
            />
          </button>

          {expandedSections.notes && (
            <div className="px-4 pb-4 space-y-4">
              {/* Add note input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note..."
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAddNote();
                    }
                  }}
                />
                <Button
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                  size="icon"
                >
                  {addingNote ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                </Button>
              </div>

              {/* Activity timeline */}
              <div className="space-y-3">
                {activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No activity yet
                  </p>
                ) : (
                  activities.map((activity, idx) => (
                    <div key={activity.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            activity.type === "note"
                              ? "bg-blue-500/10"
                              : activity.type === "photo"
                              ? "bg-purple-500/10"
                              : "bg-primary/10"
                          }`}
                        >
                          {activity.type === "note" ? (
                            <MessageSquare className="w-4 h-4 text-blue-600" />
                          ) : activity.type === "photo" ? (
                            <ImageIcon className="w-4 h-4 text-purple-600" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-primary" />
                          )}
                        </div>
                        {idx < activities.length - 1 && (
                          <div className="w-px flex-1 bg-border mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-3">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-sm">
                            {activity.user_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(activity.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {activity.message}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Fixed Action Bar */}
      <div className="fixed bottom-20 md:bottom-0 left-0 right-0 z-40 bg-background border-t border-border p-4 flex gap-3">
        {getActionButton()}

        {task.status !== "blocked" &&
          task.status !== "cancelled" &&
          task.status !== "verified" && (
            <Button
              variant="destructive"
              size="icon"
              onClick={handleBlockTask}
              disabled={saving}
              className="shrink-0"
            >
              <AlertOctagon className="w-5 h-5" />
            </Button>
          )}
      </div>

      {/* Camera Capture Modal */}
      {user && (
        <CameraCaptureModal
          isOpen={showCameraModal}
          onClose={() => setShowCameraModal(false)}
          onPhotoSaved={handlePhotoSaved}
          userId={user.id}
          taskId={task.id}
          zoneId={task.zone_id || undefined}
          defaultPhotoType={cameraPhotoType}
          addTimestamp={true}
        />
      )}

      {/* Before/After Comparison Modal */}
      {beforePhotos.length > 0 && afterPhotos.length > 0 && (
        <BeforeAfterModal
          isOpen={showCompareModal}
          onClose={() => setShowCompareModal(false)}
          beforePhotoUrl={getPhotoUrl(beforePhotos[0])}
          afterPhotoUrl={getPhotoUrl(afterPhotos[0])}
          beforeLabel="Before"
          afterLabel="After"
        />
      )}

      {/* Photo Lightbox (simple version for now) */}
      {selectedPhotoIndex !== null && photos[selectedPhotoIndex] && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
          <button
            onClick={() => setSelectedPhotoIndex(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Navigation */}
          {selectedPhotoIndex > 0 && (
            <button
              onClick={() => setSelectedPhotoIndex((prev) => (prev !== null ? prev - 1 : null))}
              className="absolute left-4 text-white/80 hover:text-white p-2"
              aria-label="Previous photo"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
          )}
          {selectedPhotoIndex < photos.length - 1 && (
            <button
              onClick={() => setSelectedPhotoIndex((prev) => (prev !== null ? prev + 1 : null))}
              className="absolute right-4 text-white/80 hover:text-white p-2"
              aria-label="Next photo"
            >
              <ArrowLeft className="w-6 h-6 rotate-180" />
            </button>
          )}

          {/* Photo */}
          <div className="relative max-w-4xl max-h-[80vh] w-full mx-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getPhotoUrl(photos[selectedPhotoIndex])}
              alt={photos[selectedPhotoIndex].caption || "Task photo"}
              className="w-full h-full object-contain"
            />

            {/* Photo info */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center gap-2 text-white text-sm">
                <span className="px-2 py-0.5 rounded bg-white/20">
                  {photoTypeLabels[photos[selectedPhotoIndex].photo_type]}
                </span>
                {photos[selectedPhotoIndex].caption && (
                  <span className="text-white/80">{photos[selectedPhotoIndex].caption}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="text-sm text-muted-foreground animate-pulse">Loading…</div></div>}>
      <PageContent />
    </Suspense>
  );
}
