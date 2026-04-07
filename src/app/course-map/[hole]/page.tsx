"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  MapPin,
  Plus,
  Flag,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  ChevronLeft,
  ChevronRight,
  Camera,
  X,
  Loader2,
  ClipboardList,
  ArrowUpRight,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DetailPageHeader } from "@/components/ui/back-button";
import {
  useHoleObservations,
  issueTypeLabels,
  issueTypeIcons,
  statusLabels,
  statusColors,
  priorityLabels,
  priorityColors,
  HOLE_PARS,
  HOLE_YARDS,
} from "@/lib/hooks/useHoleObservations";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type {
  HoleIssueType,
  HoleObservation,
  HoleObservationStatus,
  TaskPriority,
} from "@/types/database";

export default function HoleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isSuper, isForeman } = useAuth();
  const holeNumber = parseInt(params.hole as string, 10);

  const {
    observations,
    loading,
    getObservationsForHole,
    createObservation,
    updateObservation,
    uploadPhoto,
  } = useHoleObservations();

  // Pin placement mode
  const [isPlacingPin, setIsPlacingPin] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Observation form
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    fix_instructions: "",
    issue_type: "other" as HoleIssueType,
    priority: "normal" as TaskPriority,
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generatingFix, setGeneratingFix] = useState(false);

  // View observation detail
  const [selectedObs, setSelectedObs] = useState<HoleObservation | null>(null);
  const [editingFix, setEditingFix] = useState(false);
  const [editFixText, setEditFixText] = useState("");
  const [savingFix, setSavingFix] = useState(false);
  const [generatingFixForObs, setGeneratingFixForObs] = useState(false);

  // Create task dialog
  const [taskDialogObs, setTaskDialogObs] = useState<HoleObservation | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  // Filter
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const holeObs = getObservationsForHole(holeNumber);
  const filteredObs = holeObs.filter((o) => {
    if (statusFilter === "active") return o.status !== "resolved";
    if (statusFilter === "resolved") return o.status === "resolved";
    return true;
  });

  const [imgError, setImgError] = useState(false);

  // Validate hole number
  if (isNaN(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    return (
      <div className="p-4 text-center py-12">
        <p className="text-muted-foreground">Invalid hole number</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/course-map")}>
          Back to Course Map
        </Button>
      </div>
    );
  }

  // ── Handle Image Tap ──
  const handleImageTap = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!isPlacingPin) return;
    e.preventDefault();

    const container = imageContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    setPendingPin({ x, y });
    setIsPlacingPin(false);
    setShowForm(true);
  };

  // ── Handle Photo Selection ──
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  // ── AI Generate Fix Instructions ──
  const handleGenerateFix = async () => {
    if (!formData.title.trim()) return;
    setGeneratingFix(true);
    try {
      const res = await fetch("/api/fix-instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          issue_type: formData.issue_type,
          priority: formData.priority,
          description: formData.description || undefined,
          hole_number: holeNumber,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.fix_instructions) {
          setFormData((p) => ({ ...p, fix_instructions: data.fix_instructions }));
        }
      }
    } catch (err) {
      console.error("Failed to generate fix instructions:", err);
    } finally {
      setGeneratingFix(false);
    }
  };

  // ── Submit Observation ──
  const handleSubmit = async () => {
    if (!pendingPin || !formData.title.trim()) return;
    setSubmitting(true);

    let photoUrl: string | null = null;
    if (photoFile) {
      photoUrl = await uploadPhoto(photoFile);
    }

    const result = await createObservation({
      hole_number: holeNumber,
      pin_x: pendingPin.x,
      pin_y: pendingPin.y,
      issue_type: formData.issue_type,
      priority: formData.priority,
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      fix_instructions: formData.fix_instructions.trim() || null,
      photo_url: photoUrl,
    });

    if (result) {
      // Reset form
      setShowForm(false);
      setPendingPin(null);
      setFormData({ title: "", description: "", fix_instructions: "", issue_type: "other", priority: "normal" });
      setPhotoFile(null);
      setPhotoPreview(null);
    }
    setSubmitting(false);
  };

  // ── Create Task from Observation ──
  const handleCreateTask = async (obs: HoleObservation) => {
    setCreatingTask(true);
    const supabase = createClient();

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: task, error } = await (supabase.from("tasks") as any)
        .insert({
          title: `Hole ${obs.hole_number}: ${obs.title}`,
          description: `${issueTypeLabels[obs.issue_type]} reported on Hole ${obs.hole_number}.\n\n${obs.description || "No additional details."}${obs.fix_instructions ? `\n\n--- How to Fix ---\n${obs.fix_instructions}` : ""}${obs.photo_url ? `\n\nPhoto: ${obs.photo_url}` : ""}`,
          category: obs.issue_type === "bunker_issue" ? "bunker" : obs.issue_type === "irrigation_issue" ? "irrigation" : obs.issue_type === "mechanical_damage" ? "mechanical" : "greens",
          priority: obs.priority,
          status: "pending",
          due_date: new Date().toISOString().split("T")[0],
          hole_numbers: [obs.hole_number],
          assigned_by: user?.id,
          equipment_needed: [],
          materials_needed: [],
          checklist: [],
        })
        .select("id, title, status")
        .single();

      if (error) {
        console.error("Failed to create task:", error);
      } else if (task) {
        // Link observation to task
        await updateObservation(obs.id, {
          task_id: task.id,
          status: "in_progress",
        });
        setTaskDialogObs(null);
        setSelectedObs(null);
      }
    } catch (err) {
      console.error("Task creation error:", err);
    } finally {
      setCreatingTask(false);
    }
  };

  // ── Update Observation Status ──
  const handleStatusChange = async (obs: HoleObservation, newStatus: HoleObservationStatus) => {
    const updates: Partial<HoleObservation> = { status: newStatus };
    if (newStatus === "resolved") {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = user?.id || null;
    }
    await updateObservation(obs.id, updates);
    if (selectedObs?.id === obs.id) {
      setSelectedObs({ ...obs, ...updates });
    }
  };

  // ── Save Fix Instructions on Existing Observation ──
  const handleSaveFix = async () => {
    if (!selectedObs) return;
    setSavingFix(true);
    await updateObservation(selectedObs.id, { fix_instructions: editFixText.trim() || null });
    setSelectedObs({ ...selectedObs, fix_instructions: editFixText.trim() || null });
    setEditingFix(false);
    setSavingFix(false);
  };

  const handleGenerateFixForObs = async (obs: HoleObservation) => {
    setGeneratingFixForObs(true);
    try {
      const res = await fetch("/api/fix-instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: obs.title,
          issue_type: obs.issue_type,
          priority: obs.priority,
          description: obs.description || undefined,
          hole_number: obs.hole_number,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.fix_instructions) {
          setEditFixText(data.fix_instructions);
        }
      }
    } catch (err) {
      console.error("Failed to generate fix:", err);
    } finally {
      setGeneratingFixForObs(false);
    }
  };

  const par = HOLE_PARS[holeNumber] || 4;
  const yards = HOLE_YARDS[holeNumber] || 0;
  const activeCount = holeObs.filter((o) => o.status !== "resolved").length;

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="p-4 md:p-6 pb-0">
        <DetailPageHeader
          title={`Hole ${holeNumber}`}
          subtitle={`Par ${par} · ${yards} yards`}
          backHref="/course-map"
        />

        {/* Navigation between holes */}
        <div className="flex items-center justify-between mt-2 mb-4">
          {holeNumber > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/course-map/${holeNumber - 1}`)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Hole {holeNumber - 1}
            </Button>
          ) : (
            <div className="w-20" />
          )}
          <span className="text-sm text-muted-foreground">
            {activeCount} active issue{activeCount !== 1 ? "s" : ""}
          </span>
          {holeNumber < 18 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/course-map/${holeNumber + 1}`)}
            >
              Hole {holeNumber + 1}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <div className="w-20" />
          )}
        </div>
      </div>

      {/* Hole Image with Pins */}
      <div className="px-4 md:px-6 mb-6">
        <div
          ref={imageContainerRef}
          className={`relative rounded-2xl overflow-hidden border-2 transition-colors ${
            isPlacingPin
              ? "border-[#B68D40] ring-2 ring-[#B68D40]/30 cursor-crosshair"
              : "border-border"
          }`}
          onClick={handleImageTap}
          onTouchStart={isPlacingPin ? handleImageTap : undefined}
        >
          {/* The hole image */}
          <div className="relative aspect-[4/5] sm:aspect-[3/4] md:aspect-[4/3] lg:aspect-[16/9] bg-gradient-to-b from-green-50 to-green-100/50">
            {imgError ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <Flag className="w-16 h-16 text-[#2D6A4F]/30 mx-auto mb-2" />
                  <span className="text-5xl font-bold text-[#1B4332]/20">{holeNumber}</span>
                </div>
              </div>
            ) : (
              <img
                src={`/holes/hole-${holeNumber}.png`}
                alt={`Hole ${holeNumber} layout`}
                className="w-full h-full object-contain"
                onError={() => setImgError(true)}
                draggable={false}
              />
            )}

            {/* Existing pins */}
            {holeObs
              .filter((o) => o.status !== "resolved")
              .map((obs) => (
                <button
                  key={obs.id}
                  className="absolute z-10 -translate-x-1/2 -translate-y-full group"
                  style={{
                    left: `${obs.pin_x * 100}%`,
                    top: `${obs.pin_y * 100}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isPlacingPin) setSelectedObs(obs);
                  }}
                >
                  {/* Pin marker */}
                  <div className="relative">
                    <svg
                      width="28"
                      height="36"
                      viewBox="0 0 28 36"
                      fill="none"
                      className="drop-shadow-lg"
                    >
                      <path
                        d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z"
                        fill={priorityColors[obs.priority].pin}
                      />
                      <circle cx="14" cy="13" r="6" fill="white" fillOpacity="0.9" />
                    </svg>
                    <span className="absolute top-[6px] left-1/2 -translate-x-1/2 text-[10px] font-bold"
                      style={{ color: priorityColors[obs.priority].pin }}
                    >
                      {issueTypeIcons[obs.issue_type]}
                    </span>
                  </div>
                  {/* Tooltip on hover/tap */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-card border border-border rounded-lg shadow-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                    {obs.title}
                  </div>
                </button>
              ))}

            {/* Pending pin (being placed) */}
            {pendingPin && (
              <div
                className="absolute z-20 -translate-x-1/2 -translate-y-full animate-bounce"
                style={{
                  left: `${pendingPin.x * 100}%`,
                  top: `${pendingPin.y * 100}%`,
                }}
              >
                <svg width="32" height="40" viewBox="0 0 28 36" fill="none">
                  <path
                    d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z"
                    fill="#B68D40"
                  />
                  <circle cx="14" cy="13" r="6" fill="white" fillOpacity="0.9" />
                  <circle cx="14" cy="13" r="3" fill="#B68D40" />
                </svg>
              </div>
            )}
          </div>

          {/* Pin placement mode overlay */}
          {isPlacingPin && (
            <div className="absolute inset-0 bg-black/5 flex items-end justify-center pb-4 pointer-events-none">
              <div className="bg-[#1B4332] text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Tap to place pin
              </div>
            </div>
          )}
        </div>

        {/* Action buttons below image */}
        <div className="flex gap-2 mt-3">
          {isPlacingPin ? (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setIsPlacingPin(false);
                setPendingPin(null);
              }}
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          ) : (
            <Button
              className="flex-1 bg-[#1B4332] hover:bg-[#2D6A4F]"
              onClick={() => setIsPlacingPin(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Report Issue
            </Button>
          )}
        </div>
      </div>

      {/* Observations List */}
      <div className="px-4 md:px-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Observations</h2>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : filteredObs.length === 0 ? (
          <Card className="py-8">
            <CardContent className="text-center">
              <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-muted-foreground">
                {statusFilter === "active"
                  ? "No active issues on this hole"
                  : statusFilter === "resolved"
                  ? "No resolved issues yet"
                  : "No observations recorded"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Tap &quot;Report Issue&quot; to drop a pin and log a problem
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredObs.map((obs) => (
              <button
                key={obs.id}
                onClick={() => setSelectedObs(obs)}
                className="w-full text-left bg-card rounded-xl border border-border p-3 hover:bg-muted/50 active:scale-[0.99] transition-all"
              >
                <div className="flex items-start gap-3">
                  {/* Issue type icon */}
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-lg shrink-0">
                    {issueTypeIcons[obs.issue_type]}
                  </div>
                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{obs.title}</p>
                      {obs.fix_instructions && (
                        <Badge variant="outline" className="text-[10px] h-5 shrink-0 border-amber-300 text-amber-700 bg-amber-50">
                          <Wrench className="w-3 h-3 mr-0.5" />
                          Fix
                        </Badge>
                      )}
                      {obs.task_id && (
                        <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                          <ClipboardList className="w-3 h-3 mr-0.5" />
                          Task
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {issueTypeLabels[obs.issue_type]}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge
                        className={`text-[10px] ${priorityColors[obs.priority].bg} ${priorityColors[obs.priority].text} border-0`}
                      >
                        {priorityLabels[obs.priority]}
                      </Badge>
                      <Badge
                        className={`text-[10px] ${statusColors[obs.status].bg} ${statusColors[obs.status].text} border-0`}
                      >
                        {statusLabels[obs.status]}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(obs.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {/* Photo thumbnail */}
                  {obs.photo_url && (
                    <img
                      src={obs.photo_url}
                      alt=""
                      className="w-14 h-14 rounded-lg object-cover shrink-0 border border-border"
                    />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Observation Form Sheet ── */}
      <Sheet open={showForm} onOpenChange={(open) => {
        if (!open) {
          setShowForm(false);
          setPendingPin(null);
          setPhotoFile(null);
          setPhotoPreview(null);
        }
      }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#B68D40]" />
              Report Issue — Hole {holeNumber}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4 mt-4 pb-6">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="obs-title">What&apos;s the issue? *</Label>
              <Input
                id="obs-title"
                placeholder="e.g., Brown patch near bunker"
                value={formData.title}
                onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
              />
            </div>

            {/* Issue Type & Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Issue Type</Label>
                <Select
                  value={formData.issue_type}
                  onValueChange={(v) => setFormData((p) => ({ ...p, issue_type: v as HoleIssueType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(issueTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        <span className="flex items-center gap-2">
                          <span>{issueTypeIcons[value as HoleIssueType]}</span>
                          {label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(v) => setFormData((p) => ({ ...p, priority: v as TaskPriority }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorityLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        <span className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: priorityColors[value as TaskPriority].pin }}
                          />
                          {label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="obs-desc">Details (optional)</Label>
              <Textarea
                id="obs-desc"
                placeholder="Describe the issue in more detail..."
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              />
            </div>

            {/* Fix Instructions */}
            {(isSuper || isForeman) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="obs-fix" className="flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    How to Fix
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    disabled={!formData.title.trim() || generatingFix}
                    onClick={handleGenerateFix}
                  >
                    {generatingFix ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    {generatingFix ? "Generating..." : "AI Generate"}
                  </Button>
                </div>
                <Textarea
                  id="obs-fix"
                  placeholder="Step-by-step instructions for the crew..."
                  rows={5}
                  value={formData.fix_instructions}
                  onChange={(e) => setFormData((p) => ({ ...p, fix_instructions: e.target.value }))}
                />
                {formData.fix_instructions && (
                  <p className="text-[10px] text-muted-foreground">
                    This will be visible to the crew assigned to fix this issue.
                  </p>
                )}
              </div>
            )}

            {/* Photo */}
            <div className="space-y-2">
              <Label>Photo (optional)</Label>
              {photoPreview ? (
                <div className="relative w-full h-48 rounded-lg overflow-hidden border border-border">
                  <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    className="absolute top-2 right-2 bg-black/50 rounded-full p-1"
                    onClick={() => {
                      setPhotoFile(null);
                      setPhotoPreview(null);
                    }}
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 h-20 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <Camera className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Add a photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                </label>
              )}
            </div>

            {/* Submit */}
            <Button
              className="w-full bg-[#1B4332] hover:bg-[#2D6A4F]"
              disabled={!formData.title.trim() || submitting}
              onClick={handleSubmit}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <MapPin className="w-4 h-4 mr-2" />
              )}
              Submit Observation
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Observation Detail Sheet ── */}
      <Sheet open={!!selectedObs} onOpenChange={(open) => { if (!open) { setSelectedObs(null); setEditingFix(false); } }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          {selectedObs && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className="text-lg">{issueTypeIcons[selectedObs.issue_type]}</span>
                  {selectedObs.title}
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-4 mt-4 pb-6">
                {/* Status & Priority badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    className={`${priorityColors[selectedObs.priority].bg} ${priorityColors[selectedObs.priority].text} border-0`}
                  >
                    {priorityLabels[selectedObs.priority]}
                  </Badge>
                  <Badge
                    className={`${statusColors[selectedObs.status].bg} ${statusColors[selectedObs.status].text} border-0`}
                  >
                    {statusLabels[selectedObs.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {issueTypeLabels[selectedObs.issue_type]}
                  </span>
                </div>

                {/* Photo */}
                {selectedObs.photo_url && (
                  <img
                    src={selectedObs.photo_url}
                    alt="Issue photo"
                    className="w-full h-48 object-cover rounded-xl border border-border"
                  />
                )}

                {/* Description */}
                {selectedObs.description && (
                  <p className="text-sm text-foreground">{selectedObs.description}</p>
                )}

                {/* Fix Instructions */}
                {editingFix ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5" />
                        How to Fix
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        disabled={generatingFixForObs}
                        onClick={() => handleGenerateFixForObs(selectedObs)}
                      >
                        {generatingFixForObs ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        {generatingFixForObs ? "Generating..." : "AI Generate"}
                      </Button>
                    </div>
                    <Textarea
                      rows={6}
                      value={editFixText}
                      onChange={(e) => setEditFixText(e.target.value)}
                      placeholder="Step-by-step instructions for the crew..."
                      className="bg-white"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-[#1B4332] hover:bg-[#2D6A4F]"
                        disabled={savingFix}
                        onClick={handleSaveFix}
                      >
                        {savingFix ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setEditingFix(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : selectedObs.fix_instructions ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5" />
                        How to Fix
                      </p>
                      {(isSuper || isForeman) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-amber-700"
                          onClick={() => {
                            setEditFixText(selectedObs.fix_instructions || "");
                            setEditingFix(true);
                          }}
                        >
                          Edit
                        </Button>
                      )}
                    </div>
                    <p className="text-sm text-amber-900 whitespace-pre-line">{selectedObs.fix_instructions}</p>
                  </div>
                ) : (isSuper || isForeman) && selectedObs.status !== "resolved" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={() => {
                      setEditFixText("");
                      setEditingFix(true);
                    }}
                  >
                    <Wrench className="w-4 h-4 mr-2" />
                    Add Fix Instructions
                  </Button>
                ) : null}

                {/* Meta info */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    Reported {new Date(selectedObs.created_at).toLocaleDateString()} at{" "}
                    {new Date(selectedObs.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {selectedObs.reporter && (
                    <p>By {selectedObs.reporter.full_name}</p>
                  )}
                  {selectedObs.resolved_at && (
                    <p className="flex items-center gap-1.5 text-green-600">
                      <CheckCircle2 className="w-3 h-3" />
                      Resolved {new Date(selectedObs.resolved_at).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {/* Linked task */}
                {selectedObs.task && (
                  <Card>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-primary" />
                        <div>
                          <p className="text-sm font-medium">{selectedObs.task.title}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {selectedObs.task.status?.replace("_", " ")}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/tasks/${selectedObs.task!.id}`)}
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Actions */}
                <div className="space-y-2">
                  {/* Status change buttons */}
                  {selectedObs.status !== "resolved" && (
                    <div className="flex gap-2">
                      {selectedObs.status === "open" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleStatusChange(selectedObs, "in_progress")}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Mark In Progress
                        </Button>
                      )}
                      {selectedObs.status === "in_progress" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleStatusChange(selectedObs, "monitoring")}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Monitor
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-green-600 border-green-200 hover:bg-green-50"
                        onClick={() => handleStatusChange(selectedObs, "resolved")}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        Resolve
                      </Button>
                    </div>
                  )}

                  {/* Create task button */}
                  {!selectedObs.task_id && selectedObs.status !== "resolved" && (
                    <Button
                      className="w-full bg-[#1B4332] hover:bg-[#2D6A4F]"
                      onClick={() => setTaskDialogObs(selectedObs)}
                    >
                      <ClipboardList className="w-4 h-4 mr-2" />
                      Create Task from This
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Create Task Confirmation Dialog ── */}
      <Dialog open={!!taskDialogObs} onOpenChange={(open) => !open && setTaskDialogObs(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>
              This will create a new task from this observation and link them together. The task will appear in the Tasks page.
            </DialogDescription>
          </DialogHeader>
          {taskDialogObs && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium text-sm">
                Hole {taskDialogObs.hole_number}: {taskDialogObs.title}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {issueTypeLabels[taskDialogObs.issue_type]} · {priorityLabels[taskDialogObs.priority]} priority
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDialogObs(null)}>
              Cancel
            </Button>
            <Button
              className="bg-[#1B4332] hover:bg-[#2D6A4F]"
              disabled={creatingTask}
              onClick={() => taskDialogObs && handleCreateTask(taskDialogObs)}
            >
              {creatingTask ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <ClipboardList className="w-4 h-4 mr-2" />
              )}
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
