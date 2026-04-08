"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
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
  Pencil,
  Save,
  Edit3,
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
  useGreenObservations,
  greenIssueTypeLabels,
  greenIssueTypeIcons,
  greenStatusLabels,
  greenStatusColors,
  greenPriorityLabels,
  greenPriorityColors,
} from "@/lib/hooks/useGreenObservations";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import GreenDrawingCanvas, { computeCentroid } from "@/components/green-drawing-canvas";
import type {
  AreaPoint,
  GreenIssueType,
  GreenObservation,
  GreenObservationStatus,
  TaskPriority,
} from "@/types/database";

type FormStep = "photo" | "analyzing" | "review";

export default function GreenDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isSuper, isForeman } = useAuth();
  const holeNumber = parseInt(params.hole as string, 10);

  const {
    observations,
    loading,
    getObservationsForGreen,
    createObservation,
    updateObservation,
    uploadPhoto,
  } = useGreenObservations();

  // Drawing mode state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnPath, setDrawnPath] = useState<AreaPoint[] | null>(null);

  // Multi-step form: photo → analyzing → review
  const [showForm, setShowForm] = useState(false);
  const [formStep, setFormStep] = useState<FormStep>("photo");
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    fix_instructions: "",
    issue_type: "other" as GreenIssueType,
    priority: "normal" as TaskPriority,
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generatingFix, setGeneratingFix] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Camera input ref for triggering
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // View observation detail
  const [selectedObs, setSelectedObs] = useState<GreenObservation | null>(null);
  const [editingObs, setEditingObs] = useState(false);
  const [editFormData, setEditFormData] = useState({
    title: "",
    description: "",
    fix_instructions: "",
    issue_type: "other" as GreenIssueType,
    priority: "normal" as TaskPriority,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [generatingFixForObs, setGeneratingFixForObs] = useState(false);

  // Feedback messages
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (feedbackMsg) {
      const timer = setTimeout(() => setFeedbackMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedbackMsg]);

  // Create task dialog
  const [taskDialogObs, setTaskDialogObs] = useState<GreenObservation | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  // Filter
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const greenObs = getObservationsForGreen(holeNumber);
  const filteredObs = greenObs.filter((o) => {
    if (statusFilter === "active") return o.status !== "resolved";
    if (statusFilter === "resolved") return o.status === "resolved";
    return true;
  });

  const [imgError, setImgError] = useState(false);

  // Validate hole number
  if (isNaN(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    return (
      <div className="p-4 text-center py-12">
        <p className="text-muted-foreground">Invalid green number</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/course-map")}>
          Back to Course Map
        </Button>
      </div>
    );
  }

  // ── Drawing complete → open photo step ──
  const handleDrawComplete = useCallback((path: AreaPoint[]) => {
    setDrawnPath(path);
    setIsDrawing(false);
    setFormStep("photo");
    setShowForm(true);
    setAnalyzeError(null);
    // Reset form data for new observation
    setFormData({ title: "", description: "", fix_instructions: "", issue_type: "other", priority: "normal" });
    setPhotoFile(null);
    setPhotoPreview(null);
  }, []);

  // ── Handle Photo Capture & Auto-Analyze ──
  const handlePhotoCaptured = useCallback(async (file: File) => {
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setPhotoPreview(base64);
      setFormStep("analyzing");
      setAnalyzeError(null);

      // Send to AI for analysis
      try {
        const res = await fetch("/api/analyze-observation-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_base64: base64,
            context: "green",
            hole_number: holeNumber,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setFormData((prev) => ({
            ...prev,
            title: data.title || prev.title,
            description: data.description || prev.description,
            issue_type: (data.issue_type as GreenIssueType) || prev.issue_type,
          }));
          setFormStep("review");
        } else {
          console.error("Photo analysis failed:", res.status);
          setAnalyzeError("AI analysis failed. You can fill in the details manually.");
          setFormStep("review");
        }
      } catch (err) {
        console.error("Photo analysis error:", err);
        setAnalyzeError("AI analysis failed. You can fill in the details manually.");
        setFormStep("review");
      }
    };
    reader.readAsDataURL(file);
  }, [holeNumber]);

  const handlePhotoInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handlePhotoCaptured(file);
  }, [handlePhotoCaptured]);

  // ── AI Generate Fix Instructions ──
  const handleGenerateFix = useCallback(async () => {
    if (!formData.title.trim()) return;
    setGeneratingFix(true);
    try {
      const res = await fetch("/api/green-fix-instructions", {
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
      setFeedbackMsg({ type: "error", text: "Failed to generate fix instructions." });
    } finally {
      setGeneratingFix(false);
    }
  }, [formData.title, formData.issue_type, formData.priority, formData.description, holeNumber]);

  // ── Submit Observation ──
  const handleSubmit = useCallback(async () => {
    if (!drawnPath || drawnPath.length < 3 || !formData.title.trim() || !photoFile) return;
    setSubmitting(true);

    const centroid = computeCentroid(drawnPath);

    let photoUrl: string | null = null;
    photoUrl = await uploadPhoto(photoFile);

    const result = await createObservation({
      hole_number: holeNumber,
      pin_x: centroid.x,
      pin_y: centroid.y,
      area_path: drawnPath,
      issue_type: formData.issue_type,
      priority: formData.priority,
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      fix_instructions: formData.fix_instructions.trim() || null,
      photo_url: photoUrl,
    });

    if (result) {
      setShowForm(false);
      setDrawnPath(null);
      setFormData({ title: "", description: "", fix_instructions: "", issue_type: "other", priority: "normal" });
      setPhotoFile(null);
      setPhotoPreview(null);
      setFeedbackMsg({ type: "success", text: "Observation reported successfully." });
    } else {
      setFeedbackMsg({ type: "error", text: "Failed to save observation. Please try again." });
    }
    setSubmitting(false);
  }, [drawnPath, formData, photoFile, holeNumber, uploadPhoto, createObservation]);

  // ── Edit saved observation ──
  const handleStartEdit = useCallback((obs: GreenObservation) => {
    setEditFormData({
      title: obs.title,
      description: obs.description || "",
      fix_instructions: obs.fix_instructions || "",
      issue_type: obs.issue_type,
      priority: obs.priority,
    });
    setEditingObs(true);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedObs) return;
    setSavingEdit(true);
    const updates: Partial<GreenObservation> = {
      title: editFormData.title.trim(),
      description: editFormData.description.trim() || null,
      fix_instructions: editFormData.fix_instructions.trim() || null,
      issue_type: editFormData.issue_type,
      priority: editFormData.priority,
    };
    const result = await updateObservation(selectedObs.id, updates);
    if (result) {
      setSelectedObs({ ...selectedObs, ...updates });
      setEditingObs(false);
      setFeedbackMsg({ type: "success", text: "Observation updated." });
    } else {
      setFeedbackMsg({ type: "error", text: "Failed to update observation." });
    }
    setSavingEdit(false);
  }, [selectedObs, editFormData, updateObservation]);

  const handleGenerateFixForEdit = useCallback(async () => {
    setGeneratingFixForObs(true);
    try {
      const res = await fetch("/api/green-fix-instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editFormData.title,
          issue_type: editFormData.issue_type,
          priority: editFormData.priority,
          description: editFormData.description || undefined,
          hole_number: holeNumber,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.fix_instructions) {
          setEditFormData((p) => ({ ...p, fix_instructions: data.fix_instructions }));
        }
      }
    } catch (err) {
      console.error("Failed to generate fix:", err);
    } finally {
      setGeneratingFixForObs(false);
    }
  }, [editFormData.title, editFormData.issue_type, editFormData.priority, editFormData.description, holeNumber]);

  // ── Create Task from Observation ──
  const handleCreateTask = useCallback(async (obs: GreenObservation) => {
    setCreatingTask(true);
    const supabase = createClient();

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: task, error } = await (supabase.from("tasks") as any)
        .insert({
          title: `Green ${obs.hole_number}: ${obs.title}`,
          description: `${greenIssueTypeLabels[obs.issue_type]} reported on Green ${obs.hole_number}.\n\n${obs.description || "No additional details."}${obs.fix_instructions ? `\n\n--- How to Fix ---\n${obs.fix_instructions}` : ""}${obs.photo_url ? `\n\nPhoto: ${obs.photo_url}` : ""}`,
          category: "greens",
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
        setFeedbackMsg({ type: "error", text: "Failed to create task. Please try again." });
      } else if (task) {
        await updateObservation(obs.id, {
          task_id: task.id,
          status: "in_progress",
        });
        setTaskDialogObs(null);
        setSelectedObs(null);
        setFeedbackMsg({ type: "success", text: "Task created and linked to observation." });
      }
    } catch (err) {
      console.error("Task creation error:", err);
      setFeedbackMsg({ type: "error", text: "Failed to create task. Please try again." });
    } finally {
      setCreatingTask(false);
    }
  }, [user?.id, updateObservation]);

  // ── Update Observation Status ──
  const handleStatusChange = useCallback(async (obs: GreenObservation, newStatus: GreenObservationStatus) => {
    const updates: Partial<GreenObservation> = { status: newStatus };
    if (newStatus === "resolved") {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = user?.id || null;
    }
    await updateObservation(obs.id, updates);
    if (selectedObs?.id === obs.id) {
      setSelectedObs({ ...obs, ...updates });
    }
  }, [user?.id, updateObservation, selectedObs?.id]);

  // ── Reset form when sheet closes ──
  const handleFormSheetClose = useCallback((open: boolean) => {
    if (!open) {
      setShowForm(false);
      setDrawnPath(null);
      setPhotoFile(null);
      setPhotoPreview(null);
      setFormStep("photo");
      setAnalyzeError(null);
    }
  }, []);

  const activeCount = greenObs.filter((o) => o.status !== "resolved").length;

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="p-4 md:p-6 pb-0">
        <DetailPageHeader
          title={`Green ${holeNumber}`}
          subtitle="Putting surface observation & tracking"
          backHref="/course-map"
        />

        {/* Navigation between greens */}
        <div className="flex items-center justify-between mt-2 mb-4">
          {holeNumber > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/course-map/green/${holeNumber - 1}`)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Green {holeNumber - 1}
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
              onClick={() => router.push(`/course-map/green/${holeNumber + 1}`)}
            >
              Green {holeNumber + 1}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <div className="w-20" />
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div className={`mx-4 md:mx-6 mb-3 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 ${
          feedbackMsg.type === "success"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {feedbackMsg.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          {feedbackMsg.text}
          <button className="ml-auto" onClick={() => setFeedbackMsg(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Green Image with Drawing Canvas */}
      <div className="px-4 md:px-6 mb-6">
        <div
          className={`relative rounded-2xl overflow-hidden border-2 transition-colors ${
            isDrawing
              ? "border-emerald-500 ring-2 ring-emerald-500/30"
              : "border-border"
          }`}
        >
          <GreenDrawingCanvas
            holeNumber={holeNumber}
            isDrawing={isDrawing}
            onDrawComplete={handleDrawComplete}
            observations={greenObs}
            onZoneTap={(obs) => setSelectedObs(obs)}
            imgError={imgError}
            onImgError={() => setImgError(true)}
          />
        </div>

        {/* Action buttons below image */}
        <div className="flex gap-2 mt-3">
          {isDrawing ? (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsDrawing(false)}
            >
              <X className="w-4 h-4 mr-2" />
              Cancel Drawing
            </Button>
          ) : (
            <Button
              className="flex-1 bg-emerald-700 hover:bg-emerald-600"
              onClick={() => setIsDrawing(true)}
            >
              <Pencil className="w-4 h-4 mr-2" />
              Report Green Issue
            </Button>
          )}
        </div>
      </div>

      {/* Observations List */}
      <div className="px-4 md:px-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Green Observations</h2>
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
                  ? "No active issues on this green"
                  : statusFilter === "resolved"
                  ? "No resolved issues yet"
                  : "No observations recorded"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Tap &quot;Report Green Issue&quot; to draw around the affected area
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredObs.map((obs) => (
              <button
                key={obs.id}
                onClick={() => { setSelectedObs(obs); setEditingObs(false); }}
                className="w-full text-left bg-card rounded-xl border border-border p-3 hover:bg-muted/50 active:scale-[0.99] transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-lg shrink-0">
                    {greenIssueTypeIcons[obs.issue_type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{obs.title}</p>
                      {obs.area_path && obs.area_path.length >= 3 && (
                        <Badge variant="outline" className="text-[10px] h-5 shrink-0 border-emerald-300 text-emerald-700 bg-emerald-50">
                          <Pencil className="w-3 h-3 mr-0.5" />
                          Zone
                        </Badge>
                      )}
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
                      {greenIssueTypeLabels[obs.issue_type]}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge
                        className={`text-[10px] ${greenPriorityColors[obs.priority].bg} ${greenPriorityColors[obs.priority].text} border-0`}
                      >
                        {greenPriorityLabels[obs.priority]}
                      </Badge>
                      <Badge
                        className={`text-[10px] ${greenStatusColors[obs.status].bg} ${greenStatusColors[obs.status].text} border-0`}
                      >
                        {greenStatusLabels[obs.status]}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(obs.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
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

      {/* ══════════════════════════════════════════════════════════
          NEW OBSERVATION SHEET — 3 Steps: Photo → Analyzing → Review
         ══════════════════════════════════════════════════════════ */}
      <Sheet open={showForm} onOpenChange={handleFormSheetClose}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-emerald-600" />
              {formStep === "photo" && "Take a Photo"}
              {formStep === "analyzing" && "Analyzing Photo..."}
              {formStep === "review" && "Review & Submit"}
              <span className="text-muted-foreground font-normal text-sm">— Green {holeNumber}</span>
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 pb-6">
            {/* ── STEP 1: Photo Capture ── */}
            {formStep === "photo" && (
              <div className="space-y-4">
                {/* Area drawn confirmation */}
                {drawnPath && drawnPath.length >= 3 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Affected area marked on green
                  </div>
                )}

                <div className="text-center py-4">
                  <Camera className="w-16 h-16 text-emerald-600/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-1">
                    Take a photo of the issue so AI can identify it
                  </p>
                  <p className="text-xs text-muted-foreground mb-6">
                    The photo will be analyzed to auto-fill the issue details
                  </p>

                  <label className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl cursor-pointer transition-colors text-sm font-medium shadow-md">
                    <Camera className="w-5 h-5" />
                    Open Camera
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handlePhotoInputChange}
                    />
                  </label>

                  <div className="mt-3">
                    <label className="text-xs text-muted-foreground underline cursor-pointer hover:text-foreground">
                      Or choose from gallery
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoInputChange}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 2: Analyzing ── */}
            {formStep === "analyzing" && (
              <div className="space-y-4">
                {photoPreview && (
                  <div className="relative w-full h-48 rounded-xl overflow-hidden border border-border">
                    <img src={photoPreview} alt="Captured" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="text-center text-white">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                        <p className="text-sm font-medium">AI is analyzing your photo...</p>
                        <p className="text-xs opacity-80 mt-1">Identifying issue type and details</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 3: Review & Submit ── */}
            {formStep === "review" && (
              <div className="space-y-4">
                {/* AI error notice */}
                {analyzeError && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {analyzeError}
                  </div>
                )}

                {/* Photo preview */}
                {photoPreview && (
                  <div className="relative w-full h-40 rounded-xl overflow-hidden border border-border">
                    <img src={photoPreview} alt="Captured" className="w-full h-full object-cover" />
                    <button
                      className="absolute top-2 right-2 bg-black/50 rounded-full p-1"
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoPreview(null);
                        setFormStep("photo");
                      }}
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                    {!analyzeError && (
                      <div className="absolute bottom-2 left-2 px-2 py-1 bg-emerald-700/90 text-white text-[10px] font-medium rounded-md flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        AI analyzed
                      </div>
                    )}
                  </div>
                )}

                {/* Title (AI-filled) */}
                <div className="space-y-2">
                  <Label htmlFor="obs-title">Issue Title *</Label>
                  <Input
                    id="obs-title"
                    placeholder="e.g., Ball mark cluster front-right"
                    value={formData.title}
                    onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                    autoFocus
                  />
                </div>

                {/* Issue Type & Priority */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Issue Type</Label>
                    <Select
                      value={formData.issue_type}
                      onValueChange={(v) => setFormData((p) => ({ ...p, issue_type: v as GreenIssueType }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(greenIssueTypeLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            <span className="flex items-center gap-2">
                              <span>{greenIssueTypeIcons[value as GreenIssueType]}</span>
                              {label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority *</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(v) => setFormData((p) => ({ ...p, priority: v as TaskPriority }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(greenPriorityLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            <span className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: greenPriorityColors[value as TaskPriority].pin }}
                              />
                              {label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Description (AI-filled) */}
                <div className="space-y-2">
                  <Label htmlFor="obs-desc">Description</Label>
                  <Textarea
                    id="obs-desc"
                    placeholder="Describe the green issue in more detail..."
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>

                {/* Fix Instructions (super/foreman only) */}
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
                      rows={4}
                      value={formData.fix_instructions}
                      onChange={(e) => setFormData((p) => ({ ...p, fix_instructions: e.target.value }))}
                    />
                  </div>
                )}

                {/* Submit */}
                <Button
                  className="w-full bg-emerald-700 hover:bg-emerald-600"
                  disabled={!drawnPath || drawnPath.length < 3 || !formData.title.trim() || !photoFile || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Pencil className="w-4 h-4 mr-2" />
                  )}
                  Submit Observation
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ══════════════════════════════════════════════════════════
          OBSERVATION DETAIL SHEET — View + Full Edit Mode
         ══════════════════════════════════════════════════════════ */}
      <Sheet open={!!selectedObs} onOpenChange={(open) => { if (!open) { setSelectedObs(null); setEditingObs(false); } }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          {selectedObs && !editingObs && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className="text-lg">{greenIssueTypeIcons[selectedObs.issue_type]}</span>
                  <span className="flex-1 truncate">{selectedObs.title}</span>
                  {selectedObs.status !== "resolved" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs shrink-0"
                      onClick={() => handleStartEdit(selectedObs)}
                    >
                      <Edit3 className="w-3.5 h-3.5 mr-1" />
                      Edit
                    </Button>
                  )}
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-4 mt-4 pb-6">
                {/* Status & Priority badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    className={`${greenPriorityColors[selectedObs.priority].bg} ${greenPriorityColors[selectedObs.priority].text} border-0`}
                  >
                    {greenPriorityLabels[selectedObs.priority]}
                  </Badge>
                  <Badge
                    className={`${greenStatusColors[selectedObs.status].bg} ${greenStatusColors[selectedObs.status].text} border-0`}
                  >
                    {greenStatusLabels[selectedObs.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {greenIssueTypeLabels[selectedObs.issue_type]}
                  </span>
                  {selectedObs.area_path && selectedObs.area_path.length >= 3 && (
                    <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 bg-emerald-50">
                      <Pencil className="w-3 h-3 mr-0.5" />
                      Zone mapped
                    </Badge>
                  )}
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
                {selectedObs.fix_instructions ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-2">
                      <Wrench className="w-3.5 h-3.5" />
                      How to Fix
                    </p>
                    <p className="text-sm text-amber-900 whitespace-pre-line">{selectedObs.fix_instructions}</p>
                  </div>
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

                  {!selectedObs.task_id && selectedObs.status !== "resolved" && (
                    <Button
                      className="w-full bg-emerald-700 hover:bg-emerald-600"
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

          {/* ── EDIT MODE ── */}
          {selectedObs && editingObs && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-emerald-600" />
                  Edit Observation
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-4 mt-4 pb-6">
                {/* Photo (read-only) */}
                {selectedObs.photo_url && (
                  <img
                    src={selectedObs.photo_url}
                    alt="Issue photo"
                    className="w-full h-36 object-cover rounded-xl border border-border"
                  />
                )}

                {/* Title */}
                <div className="space-y-2">
                  <Label>Issue Title *</Label>
                  <Input
                    value={editFormData.title}
                    onChange={(e) => setEditFormData((p) => ({ ...p, title: e.target.value }))}
                    autoFocus
                  />
                </div>

                {/* Issue Type & Priority */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Issue Type</Label>
                    <Select
                      value={editFormData.issue_type}
                      onValueChange={(v) => setEditFormData((p) => ({ ...p, issue_type: v as GreenIssueType }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(greenIssueTypeLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            <span className="flex items-center gap-2">
                              <span>{greenIssueTypeIcons[value as GreenIssueType]}</span>
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
                      value={editFormData.priority}
                      onValueChange={(v) => setEditFormData((p) => ({ ...p, priority: v as TaskPriority }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(greenPriorityLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            <span className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: greenPriorityColors[value as TaskPriority].pin }}
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
                  <Label>Description</Label>
                  <Textarea
                    rows={3}
                    value={editFormData.description}
                    onChange={(e) => setEditFormData((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>

                {/* Fix Instructions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5" />
                      How to Fix
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      disabled={!editFormData.title.trim() || generatingFixForObs}
                      onClick={handleGenerateFixForEdit}
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
                    rows={5}
                    value={editFormData.fix_instructions}
                    onChange={(e) => setEditFormData((p) => ({ ...p, fix_instructions: e.target.value }))}
                    placeholder="Step-by-step instructions for the crew..."
                  />
                </div>

                {/* Save / Cancel */}
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-emerald-700 hover:bg-emerald-600"
                    disabled={!editFormData.title.trim() || savingEdit}
                    onClick={handleSaveEdit}
                  >
                    {savingEdit ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Changes
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setEditingObs(false)}
                  >
                    Cancel
                  </Button>
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
              This will create a new task from this green observation and link them together.
            </DialogDescription>
          </DialogHeader>
          {taskDialogObs && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium text-sm">
                Green {taskDialogObs.hole_number}: {taskDialogObs.title}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {greenIssueTypeLabels[taskDialogObs.issue_type]} · {greenPriorityLabels[taskDialogObs.priority]} priority
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDialogObs(null)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-700 hover:bg-emerald-600"
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
