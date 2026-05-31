"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  X,
  Plus,
  Trash2,
  GripVertical,
  Calendar,
  Clock,
  User,
  Users,
  MapPin,
  Wrench,
  Package,
  Cloud,
  Camera,
  Repeat,
  Loader2,
  Search,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailPageHeader } from "@/components/ui/back-button";
import { useAuth } from "@/lib/hooks/useAuth";
import { useTasks, type UpdateTaskData, type TaskWithRelations } from "@/lib/hooks/useTasks";
import { useProfiles, getDisplayName, roleLabels } from "@/lib/hooks/useProfiles";
import { useCourseZones, formatZoneName, zoneTypeLabels } from "@/lib/hooks/useCourseZones";
import type {
  TaskCategory,
  TaskPriority,
  ChecklistItem,
  MaterialNeeded,
  WeatherConditions,
  RecurringRule,
} from "@/types/database";

// Category options
const categoryOptions: { value: TaskCategory; label: string }[] = [
  { value: "mowing", label: "Mowing" },
  { value: "irrigation", label: "Irrigation" },
  { value: "chemical", label: "Chemical" },
  { value: "mechanical", label: "Mechanical" },
  { value: "landscaping", label: "Landscaping" },
  { value: "construction", label: "Construction" },
  { value: "bunker", label: "Bunker" },
  { value: "greens", label: "Greens" },
  { value: "admin", label: "Admin" },
  { value: "safety", label: "Safety" },
  { value: "other", label: "Other" },
];

// Priority options
const priorityOptions: { value: TaskPriority; label: string; color: string }[] = [
  { value: "critical", label: "Critical", color: "bg-red-500" },
  { value: "high", label: "High", color: "bg-orange-500" },
  { value: "normal", label: "Normal", color: "bg-green-500" },
  { value: "low", label: "Low", color: "bg-gray-400" },
];

// Frequency options
const frequencyOptions: { value: RecurringRule["frequency"]; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "seasonal", label: "Seasonal" },
];

// Days of week
const daysOfWeek = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

// Common equipment items
const commonEquipment = [
  "Reel Mower",
  "Rotary Mower",
  "Walk Mower",
  "Utility Vehicle",
  "Sprayer",
  "Aerator",
  "Topdresser",
  "Roller",
  "Blower",
  "Trimmer",
  "Rake",
  "Shovel",
  "Edger",
];

// Generate unique ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

interface FormData {
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  assigned_to: string;
  assigned_crew: string;
  due_date: string;
  due_time: string;
  estimated_minutes: string;
  zone_id: string;
  hole_numbers: number[];
  equipment_needed: string[];
  materials_needed: MaterialNeeded[];
  checklist: ChecklistItem[];
  requires_photo_before: boolean;
  requires_photo_after: boolean;
  weather_dependent: boolean;
  weather_conditions: WeatherConditions;
  notes: string;
  is_recurring: boolean;
  recurring_rule: RecurringRule;
}

function PageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get("id") ?? "";

  const { user, isManager, isForeman, loading: authLoading } = useAuth();
  const { getTask, updateTask } = useTasks();
  const { profiles, allStaff } = useProfiles();
  const { zones } = useCourseZones();

  const [task, setTask] = useState<TaskWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Dropdown states
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [showZoneDropdown, setShowZoneDropdown] = useState(false);
  const [zoneSearch, setZoneSearch] = useState("");
  const [showEquipmentDropdown, setShowEquipmentDropdown] = useState(false);
  const [equipmentInput, setEquipmentInput] = useState("");

  // New material/checklist input
  const [newMaterialName, setNewMaterialName] = useState("");
  const [newMaterialQty, setNewMaterialQty] = useState("");
  const [newMaterialUnit, setNewMaterialUnit] = useState("");
  const [newChecklistItem, setNewChecklistItem] = useState("");

  // Fetch task data
  useEffect(() => {
    async function fetchTask() {
      if (!taskId) return;

      setLoading(true);
      try {
        const taskData = await getTask(taskId);
        if (taskData) {
          setTask(taskData);
          // Initialize form data from task
          setFormData({
            title: taskData.title,
            description: taskData.description || "",
            category: taskData.category,
            priority: taskData.priority,
            assigned_to: taskData.assigned_to || "",
            assigned_crew: taskData.assigned_crew || "",
            due_date: taskData.due_date,
            due_time: taskData.due_time || "",
            estimated_minutes: taskData.estimated_minutes?.toString() || "",
            zone_id: taskData.zone_id || "",
            hole_numbers: taskData.hole_numbers || [],
            equipment_needed: taskData.equipment_needed || [],
            materials_needed: taskData.materials_needed || [],
            checklist: taskData.checklist || [],
            requires_photo_before: taskData.requires_photo_before,
            requires_photo_after: taskData.requires_photo_after,
            weather_dependent: taskData.weather_dependent,
            weather_conditions: taskData.weather_conditions || {},
            notes: taskData.notes || "",
            is_recurring: !!taskData.recurring_rule,
            recurring_rule: taskData.recurring_rule || {
              frequency: "weekly",
              interval: 1,
              days_of_week: [],
            },
          });
        }
      } catch (err) {
        console.error("Error fetching task:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchTask();
  }, [taskId, getTask]);

  // Check authorization
  useEffect(() => {
    if (!authLoading && !loading && task) {
      const canEdit = isManager || isForeman || task.assigned_to === user?.id;
      if (!canEdit) {
        router.push(`/tasks/view?id=${taskId}`);
      }
    }
  }, [authLoading, loading, task, isManager, isForeman, user, taskId, router]);

  // Update form field
  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    if (!formData) return;
    setFormData((prev) => prev ? { ...prev, [field]: value } : null);
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Add equipment item
  const addEquipment = (item: string) => {
    if (!formData) return;
    if (item && !formData.equipment_needed.includes(item)) {
      updateField("equipment_needed", [...formData.equipment_needed, item]);
    }
    setEquipmentInput("");
    setShowEquipmentDropdown(false);
  };

  // Remove equipment item
  const removeEquipment = (item: string) => {
    if (!formData) return;
    updateField(
      "equipment_needed",
      formData.equipment_needed.filter((e) => e !== item)
    );
  };

  // Add material
  const addMaterial = () => {
    if (!formData) return;
    if (newMaterialName && newMaterialQty) {
      const material: MaterialNeeded = {
        name: newMaterialName,
        quantity: parseFloat(newMaterialQty) || 0,
        unit: newMaterialUnit || "units",
      };
      updateField("materials_needed", [...formData.materials_needed, material]);
      setNewMaterialName("");
      setNewMaterialQty("");
      setNewMaterialUnit("");
    }
  };

  // Remove material
  const removeMaterial = (index: number) => {
    if (!formData) return;
    updateField(
      "materials_needed",
      formData.materials_needed.filter((_, i) => i !== index)
    );
  };

  // Add checklist item
  const addChecklistItem = () => {
    if (!formData) return;
    if (newChecklistItem.trim()) {
      const item: ChecklistItem = {
        id: generateId(),
        text: newChecklistItem.trim(),
        checked: false,
      };
      updateField("checklist", [...formData.checklist, item]);
      setNewChecklistItem("");
    }
  };

  // Remove checklist item
  const removeChecklistItem = (id: string) => {
    if (!formData) return;
    updateField(
      "checklist",
      formData.checklist.filter((item) => item.id !== id)
    );
  };

  // Toggle hole number
  const toggleHole = (hole: number) => {
    if (!formData) return;
    if (formData.hole_numbers.includes(hole)) {
      updateField(
        "hole_numbers",
        formData.hole_numbers.filter((h) => h !== hole)
      );
    } else {
      updateField("hole_numbers", [...formData.hole_numbers, hole].sort((a, b) => a - b));
    }
  };

  // Toggle day of week for recurring
  const toggleDayOfWeek = (day: number) => {
    if (!formData) return;
    const currentDays = formData.recurring_rule.days_of_week || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day].sort((a, b) => a - b);
    updateField("recurring_rule", { ...formData.recurring_rule, days_of_week: newDays });
  };

  // Validate form
  const validateForm = (): boolean => {
    if (!formData) return false;
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = "Title is required";
    }
    if (!formData.category) {
      newErrors.category = "Category is required";
    }
    if (!formData.priority) {
      newErrors.priority = "Priority is required";
    }
    if (!formData.due_date) {
      newErrors.due_date = "Due date is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData || !task) return;

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const updateData: UpdateTaskData = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        category: formData.category,
        priority: formData.priority,
        assigned_to: formData.assigned_to || null,
        assigned_crew: formData.assigned_crew || null,
        due_date: formData.due_date,
        due_time: formData.due_time || null,
        estimated_minutes: formData.estimated_minutes
          ? parseInt(formData.estimated_minutes)
          : null,
        zone_id: formData.zone_id || null,
        hole_numbers: formData.hole_numbers,
        equipment_needed: formData.equipment_needed,
        materials_needed: formData.materials_needed,
        checklist: formData.checklist,
        requires_photo_before: formData.requires_photo_before,
        requires_photo_after: formData.requires_photo_after,
        weather_dependent: formData.weather_dependent,
        weather_conditions: formData.weather_dependent ? formData.weather_conditions : null,
        recurring_rule: formData.is_recurring ? formData.recurring_rule : null,
        notes: formData.notes.trim() || null,
      };

      const updatedTask = await updateTask(task.id, updateData);

      if (updatedTask) {
        router.push(`/tasks/view?id=${task.id}`);
      } else {
        setSubmitError("Failed to update task. Please try again.");
      }
    } catch (err) {
      console.error("Error updating task:", err);
      setSubmitError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter staff by search
  const filteredStaff = allStaff.filter(
    (p) =>
      p.full_name.toLowerCase().includes(assigneeSearch.toLowerCase()) ||
      (p.display_name && p.display_name.toLowerCase().includes(assigneeSearch.toLowerCase()))
  );

  // Filter zones by search
  const filteredZones = zones.filter(
    (z) =>
      z.name.toLowerCase().includes(zoneSearch.toLowerCase()) ||
      z.zone_type.toLowerCase().includes(zoneSearch.toLowerCase())
  );

  // Filter equipment by input
  const filteredEquipment = formData
    ? commonEquipment.filter(
        (e) =>
          e.toLowerCase().includes(equipmentInput.toLowerCase()) &&
          !formData.equipment_needed.includes(e)
      )
    : [];

  // Get selected assignee and zone names
  const selectedAssignee = formData ? allStaff.find((p) => p.id === formData.assigned_to) : null;
  const selectedZone = formData ? zones.find((z) => z.id === formData.zone_id) : null;

  // Loading state
  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Task not found
  if (!task || !formData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-lg text-muted-foreground">Task not found</p>
        <Button onClick={() => router.push("/tasks")} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Tasks
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-40">
      {/* Header */}
      <DetailPageHeader
        backHref={`/tasks/view?id=${taskId}`}
        backLabel="Task"
        title="Edit Task"
        className="sticky top-0 z-20 bg-background border-b border-border"
      />

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4 space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => updateField("title", e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 ${
              errors.title ? "border-red-500" : "border-border"
            }`}
            placeholder="Enter task title"
          />
          {errors.title && (
            <p className="text-red-500 text-sm mt-1">{errors.title}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => updateField("description", e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            placeholder="Enter task description (optional)"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.category}
            onChange={(e) => updateField("category", e.target.value as TaskCategory)}
            className={`w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 ${
              errors.category ? "border-red-500" : "border-border"
            }`}
          >
            {categoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.category && (
            <p className="text-red-500 text-sm mt-1">{errors.category}</p>
          )}
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Priority <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            {priorityOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateField("priority", opt.value)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                  formData.priority === opt.value
                    ? `${opt.color} text-white border-transparent`
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {errors.priority && (
            <p className="text-red-500 text-sm mt-1">{errors.priority}</p>
          )}
        </div>

        {/* Assigned To */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            <User className="w-4 h-4 inline mr-1" />
            Assign to Staff Member
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowAssigneeDropdown(!showAssigneeDropdown);
                updateField("assigned_crew", "");
              }}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-left flex items-center justify-between"
            >
              <span className={selectedAssignee ? "" : "text-muted-foreground"}>
                {selectedAssignee
                  ? getDisplayName(selectedAssignee)
                  : "Select staff member..."}
              </span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>

            {showAssigneeDropdown && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowAssigneeDropdown(false)}
                />
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-40 max-h-64 overflow-hidden">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={assigneeSearch}
                        onChange={(e) => setAssigneeSearch(e.target.value)}
                        placeholder="Search staff..."
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        updateField("assigned_to", "");
                        setShowAssigneeDropdown(false);
                        setAssigneeSearch("");
                      }}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-muted text-muted-foreground"
                    >
                      Unassigned
                    </button>
                    {filteredStaff.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => {
                          updateField("assigned_to", person.id);
                          setShowAssigneeDropdown(false);
                          setAssigneeSearch("");
                        }}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center justify-between"
                      >
                        <span>{getDisplayName(person)}</span>
                        <span className="text-xs text-muted-foreground">
                          {roleLabels[person.role]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* OR Assigned Crew */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            <Users className="w-4 h-4 inline mr-1" />
            Or Assign to Crew
          </label>
          <input
            type="text"
            value={formData.assigned_crew}
            onChange={(e) => {
              updateField("assigned_crew", e.target.value);
              if (e.target.value) {
                updateField("assigned_to", "");
              }
            }}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="e.g., Morning Crew, Green Team"
          />
          <p className="text-xs text-muted-foreground mt-1">
            If assigned to a crew, individual assignment will be cleared
          </p>
        </div>

        {/* Due Date & Time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              <Calendar className="w-4 h-4 inline mr-1" />
              Due Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.due_date}
              onChange={(e) => updateField("due_date", e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                errors.due_date ? "border-red-500" : "border-border"
              }`}
            />
            {errors.due_date && (
              <p className="text-red-500 text-sm mt-1">{errors.due_date}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">
              <Clock className="w-4 h-4 inline mr-1" />
              Due Time
            </label>
            <input
              type="time"
              value={formData.due_time}
              onChange={(e) => updateField("due_time", e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        {/* Estimated Duration */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            <Clock className="w-4 h-4 inline mr-1" />
            Estimated Duration (minutes)
          </label>
          <input
            type="number"
            value={formData.estimated_minutes}
            onChange={(e) => updateField("estimated_minutes", e.target.value)}
            min="0"
            step="5"
            className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="e.g., 60"
          />
        </div>

        {/* Course Zone */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            <MapPin className="w-4 h-4 inline mr-1" />
            Course Zone
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowZoneDropdown(!showZoneDropdown)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-left flex items-center justify-between"
            >
              <span className={selectedZone ? "" : "text-muted-foreground"}>
                {selectedZone ? formatZoneName(selectedZone) : "Select zone..."}
              </span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>

            {showZoneDropdown && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowZoneDropdown(false)}
                />
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-40 max-h-64 overflow-hidden">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={zoneSearch}
                        onChange={(e) => setZoneSearch(e.target.value)}
                        placeholder="Search zones..."
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        updateField("zone_id", "");
                        setShowZoneDropdown(false);
                        setZoneSearch("");
                      }}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-muted text-muted-foreground"
                    >
                      No zone
                    </button>
                    {filteredZones.map((zone) => (
                      <button
                        key={zone.id}
                        type="button"
                        onClick={() => {
                          updateField("zone_id", zone.id);
                          setShowZoneDropdown(false);
                          setZoneSearch("");
                        }}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center justify-between"
                      >
                        <span>{formatZoneName(zone)}</span>
                        <span className="text-xs text-muted-foreground">
                          {zoneTypeLabels[zone.zone_type]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Hole Numbers */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Hole Numbers</label>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => (
              <button
                key={hole}
                type="button"
                onClick={() => toggleHole(hole)}
                className={`w-8 h-8 rounded-lg text-sm font-medium border transition-all ${
                  formData.hole_numbers.includes(hole)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                {hole}
              </button>
            ))}
          </div>
          {formData.hole_numbers.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1.5">
              Selected: {formData.hole_numbers.join(", ")}
            </p>
          )}
        </div>

        {/* Equipment Needed */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            <Wrench className="w-4 h-4 inline mr-1" />
            Equipment Needed
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {formData.equipment_needed.map((item) => (
              <span
                key={item}
                className="flex items-center gap-1 px-2 py-1 bg-muted rounded-lg text-sm"
              >
                {item}
                <button
                  type="button"
                  onClick={() => removeEquipment(item)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="relative">
            <input
              type="text"
              value={equipmentInput}
              onChange={(e) => {
                setEquipmentInput(e.target.value);
                setShowEquipmentDropdown(true);
              }}
              onFocus={() => setShowEquipmentDropdown(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEquipment(equipmentInput);
                }
              }}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Add equipment..."
            />
            {showEquipmentDropdown && (equipmentInput || filteredEquipment.length > 0) && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowEquipmentDropdown(false)}
                />
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-40 max-h-48 overflow-y-auto">
                  {equipmentInput && !commonEquipment.includes(equipmentInput) && (
                    <button
                      type="button"
                      onClick={() => addEquipment(equipmentInput)}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add &quot;{equipmentInput}&quot;
                    </button>
                  )}
                  {filteredEquipment.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => addEquipment(item)}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-muted"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Materials Needed */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            <Package className="w-4 h-4 inline mr-1" />
            Materials Needed
          </label>
          {formData.materials_needed.length > 0 && (
            <div className="space-y-2 mb-3">
              {formData.materials_needed.map((material, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2 bg-muted rounded-lg"
                >
                  <span className="flex-1 text-sm">
                    {material.quantity} {material.unit} of {material.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeMaterial(idx)}
                    className="text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newMaterialName}
              onChange={(e) => setNewMaterialName(e.target.value)}
              className="flex-1 px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              placeholder="Material name"
            />
            <input
              type="number"
              value={newMaterialQty}
              onChange={(e) => setNewMaterialQty(e.target.value)}
              className="w-20 px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              placeholder="Qty"
              min="0"
            />
            <input
              type="text"
              value={newMaterialUnit}
              onChange={(e) => setNewMaterialUnit(e.target.value)}
              className="w-20 px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              placeholder="Unit"
            />
            <Button
              type="button"
              size="icon"
              onClick={addMaterial}
              disabled={!newMaterialName || !newMaterialQty}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Checklist */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Checklist Items</label>
          {formData.checklist.length > 0 && (
            <div className="space-y-2 mb-3">
              {formData.checklist.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 p-2 bg-muted rounded-lg"
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                  <span className="flex-1 text-sm">{item.text}</span>
                  <button
                    type="button"
                    onClick={() => removeChecklistItem(item.id)}
                    className="text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newChecklistItem}
              onChange={(e) => setNewChecklistItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addChecklistItem();
                }
              }}
              className="flex-1 px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              placeholder="Add checklist item..."
            />
            <Button
              type="button"
              size="icon"
              onClick={addChecklistItem}
              disabled={!newChecklistItem.trim()}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Photo Requirements */}
        <div className="space-y-3">
          <label className="block text-sm font-medium">
            <Camera className="w-4 h-4 inline mr-1" />
            Photo Requirements
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.requires_photo_before}
              onChange={(e) => updateField("requires_photo_before", e.target.checked)}
              className="w-4 h-4 rounded border-border"
            />
            <span className="text-sm">Require photo before starting</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.requires_photo_after}
              onChange={(e) => updateField("requires_photo_after", e.target.checked)}
              className="w-4 h-4 rounded border-border"
            />
            <span className="text-sm">Require photo after completion</span>
          </label>
        </div>

        {/* Weather Dependent */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.weather_dependent}
              onChange={(e) => updateField("weather_dependent", e.target.checked)}
              className="w-4 h-4 rounded border-border"
            />
            <span className="text-sm font-medium">
              <Cloud className="w-4 h-4 inline mr-1" />
              Weather Dependent
            </span>
          </label>

          {formData.weather_dependent && (
            <div className="pl-7 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Min Temp (°F)
                  </label>
                  <input
                    type="number"
                    value={formData.weather_conditions.min_temp || ""}
                    onChange={(e) =>
                      updateField("weather_conditions", {
                        ...formData.weather_conditions,
                        min_temp: e.target.value ? parseInt(e.target.value) : undefined,
                      })
                    }
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    placeholder="e.g., 40"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Max Temp (°F)
                  </label>
                  <input
                    type="number"
                    value={formData.weather_conditions.max_temp || ""}
                    onChange={(e) =>
                      updateField("weather_conditions", {
                        ...formData.weather_conditions,
                        max_temp: e.target.value ? parseInt(e.target.value) : undefined,
                      })
                    }
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    placeholder="e.g., 85"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Max Wind (mph)
                </label>
                <input
                  type="number"
                  value={formData.weather_conditions.max_wind || ""}
                  onChange={(e) =>
                    updateField("weather_conditions", {
                      ...formData.weather_conditions,
                      max_wind: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  placeholder="e.g., 15"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.weather_conditions.no_rain || false}
                  onChange={(e) =>
                    updateField("weather_conditions", {
                      ...formData.weather_conditions,
                      no_rain: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-sm">No rain required</span>
              </label>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Notes</label>
          <textarea
            value={formData.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            placeholder="Additional notes (optional)"
          />
        </div>

        {/* Recurring */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_recurring}
              onChange={(e) => updateField("is_recurring", e.target.checked)}
              className="w-4 h-4 rounded border-border"
            />
            <span className="text-sm font-medium">
              <Repeat className="w-4 h-4 inline mr-1" />
              Recurring Task
            </span>
          </label>

          {formData.is_recurring && (
            <div className="pl-7 space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Frequency
                </label>
                <select
                  value={formData.recurring_rule.frequency}
                  onChange={(e) =>
                    updateField("recurring_rule", {
                      ...formData.recurring_rule,
                      frequency: e.target.value as RecurringRule["frequency"],
                    })
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                >
                  {frequencyOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {(formData.recurring_rule.frequency === "weekly" ||
                formData.recurring_rule.frequency === "biweekly") && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">
                    Days of Week
                  </label>
                  <div className="flex gap-1.5">
                    {daysOfWeek.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleDayOfWeek(day.value)}
                        className={`flex-1 py-1.5 rounded text-xs font-medium border transition-all ${
                          (formData.recurring_rule.days_of_week || []).includes(day.value)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  End Date (optional)
                </label>
                <input
                  type="date"
                  value={formData.recurring_rule.end_date || ""}
                  onChange={(e) =>
                    updateField("recurring_rule", {
                      ...formData.recurring_rule,
                      end_date: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Submit Error */}
        {submitError && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm">{submitError}</p>
          </div>
        )}
      </form>

      {/* Fixed Submit Button */}
      <div className="fixed bottom-20 md:bottom-0 left-0 right-0 z-40 bg-background border-t border-border p-4">
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-[#1B4332] hover:bg-[#2D6A4F]"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving Changes...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>
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
