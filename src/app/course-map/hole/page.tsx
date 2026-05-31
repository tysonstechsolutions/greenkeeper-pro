"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
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
  Download,
  Mail,
  ArrowUpRight,
  Sparkles,
  Wrench,
  Edit3,
  Move,
  Trash2,
  Crosshair,
  Locate,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InlineCamera } from "@/components/ui/inline-camera";
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
import { ResolveIssueDialog } from "@/components/resolve-issue-dialog";
import { GpsCalibrationDialog } from "@/components/gps-calibration-dialog";
import { useHoleGpsCalibration } from "@/lib/hooks/useHoleGpsCalibration";
import { gpsToImageCoords, clampPixel } from "@/lib/utils/gps-to-pixel";
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
import { issueTypeDescriptions, issueTypeFixTemplates } from "@/lib/hole-constants";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { directInsertRow } from "@/lib/supabase/rest";
import { downloadObservationReport } from "@/lib/reports/observation-report";
import { callApi } from "@/lib/api/client";
import TreatmentPlanView from "@/components/treatment-plan-view";
import { todayLocal } from "@/lib/utils/date";
import type {
  DiagnosisResult,
  HoleIssueType,
  HoleObservation,
  HoleObservationStatus,
  TaskPriority,
} from "@/types/database";

type FormStep = "photo" | "review";

function PageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isSuper, isForeman } = useAuth();
  const holeNumber = parseInt(searchParams.get("n") ?? "", 10);

  const {
    loading,
    getObservationsForHole,
    createObservation,
    updateObservation,
    deleteObservation,
    uploadPhoto,
  } = useHoleObservations();

  // Pin placement mode
  const [isPlacingPin, setIsPlacingPin] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Pin move mode — tap new location to reposition an existing observation
  const [movingObsId, setMovingObsId] = useState<string | null>(null);

  // GPS calibration + locate state
  const {
    calibration: gpsCalibration,
    isCalibrated,
    loading: calibrationLoading,
  } = useHoleGpsCalibration(holeNumber, "hole");
  const [showCalibrationDialog, setShowCalibrationDialog] = useState(false);
  const [locating, setLocating] = useState(false);
  const canCalibrate = isSuper || isForeman;

  // Multi-step form: photo → analyzing → review
  const [showForm, setShowForm] = useState(false);
  const [formStep, setFormStep] = useState<FormStep>("photo");
  const [formData, setFormData] = useState({
    description: "",
    fix_instructions: "",
    issue_type: "other" as HoleIssueType,
    priority: "normal" as TaskPriority,
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showInlineCamera, setShowInlineCamera] = useState(false);

  // Persist pin state before camera opens (Android kills background tabs)
  const STORAGE_KEY = `hole-obs-pending-${holeNumber}`;
  const savePinState = useCallback(() => {
    if (pendingPin) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
          pendingPin,
          showForm: true,
          formStep: "photo",
          formData: { description: "", fix_instructions: "", issue_type: "other", priority: "normal" },
        }));
      } catch { /* ignore */ }
    }
  }, [pendingPin, STORAGE_KEY]);

  // Restore pin state on mount (after camera returns and page reloads)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.pendingPin) {
          setPendingPin(state.pendingPin);
          setShowForm(true);
          setFormStep("photo");
        }
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch { /* ignore */ }
  }, [STORAGE_KEY]);
  const [submitting, setSubmitting] = useState(false);
  const [generatingFix, setGeneratingFix] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);

  // View observation detail
  const [selectedObs, setSelectedObs] = useState<HoleObservation | null>(null);
  const [editingObs, setEditingObs] = useState(false);
  const [editFormData, setEditFormData] = useState({
    description: "",
    fix_instructions: "",
    issue_type: "other" as HoleIssueType,
    priority: "normal" as TaskPriority,
  });
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [generatingFixForObs, setGeneratingFixForObs] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editPhotoUploading, setEditPhotoUploading] = useState(false);
  const editPhotoInputRef = useRef<HTMLInputElement>(null);

  // Feedback messages
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error" | "loading"; text: string } | null>(null);

  useEffect(() => {
    if (feedbackMsg && feedbackMsg.type !== "loading") {
      const timer = setTimeout(() => setFeedbackMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedbackMsg]);

  // Create task dialog
  const [taskDialogObs, setTaskDialogObs] = useState<HoleObservation | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  // Resolve dialog (capture proof photos before closing the issue)
  const [resolvingObs, setResolvingObs] = useState<HoleObservation | null>(null);

  // Filter
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const holeObs = getObservationsForHole(holeNumber);
  const filteredObs = holeObs.filter((o) => {
    if (statusFilter === "active") return o.status !== "resolved";
    if (statusFilter === "resolved") return o.status === "resolved";
    return true;
  });

  const [imgError, setImgError] = useState(false);

  const isInvalidHole =
    isNaN(holeNumber) || holeNumber < 1 || holeNumber > 18;

  /**
   * Use the phone's GPS to drop a pin at the user's current location.
   *
   * Requires a calibration row for this hole — if missing, we route the
   * user to the calibration dialog first (admins only). Otherwise we
   * request a high-accuracy reading from navigator.geolocation, map it
   * through the calibration's similarity transform, and seed the same
   * pendingPin state the manual tap-to-place flow uses.
   */
  const handleUseMyLocation = useCallback(() => {
    if (!isCalibrated || !gpsCalibration) {
      if (canCalibrate) {
        setShowCalibrationDialog(true);
      } else {
        setFeedbackMsg({
          type: "error",
          text: "This hole isn't calibrated yet — ask a super or foreman to set it up.",
        });
      }
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setFeedbackMsg({
        type: "error",
        text: "GPS isn't available on this device.",
      });
      return;
    }
    if (movingObsId) {
      // If we're in pin-move mode, use GPS to move the existing pin instead.
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const px = clampPixel(
            gpsToImageCoords(gpsCalibration, {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }),
          );
          updateObservation(movingObsId, { pin_x: px.x, pin_y: px.y }).then(
            (result) => {
              if (result) {
                setFeedbackMsg({ type: "success", text: "Pin moved to your location." });
              } else {
                setFeedbackMsg({ type: "error", text: "Failed to move pin." });
              }
              setMovingObsId(null);
              setLocating(false);
            },
          );
        },
        (err) => {
          console.error("GPS error:", err);
          setFeedbackMsg({
            type: "error",
            text:
              err.code === err.PERMISSION_DENIED
                ? "Location permission denied — enable GPS for this app in your phone settings."
                : "Couldn't get your location. Make sure GPS is on and try again.",
          });
          setLocating(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
      return;
    }
    setLocating(true);
    setFeedbackMsg({
      type: "loading",
      text: "Getting your GPS location…",
    });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const px = clampPixel(
          gpsToImageCoords(gpsCalibration, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        );
        setPendingPin({ x: px.x, y: px.y });
        setIsPlacingPin(false);
        setFormStep("photo");
        setShowForm(true);
        setAnalyzeError(null);
        setDiagnosisResult(null);
        setFormData({ description: "", fix_instructions: "", issue_type: "other", priority: "normal" });
        setPhotoFile(null);
        setPhotoPreview(null);
        const accuracy = Math.round(pos.coords.accuracy ?? 0);
        setFeedbackMsg({
          type: "success",
          text: `Pin dropped at your location (±${accuracy}m).`,
        });
        setLocating(false);
      },
      (err) => {
        console.error("GPS error:", err);
        setFeedbackMsg({
          type: "error",
          text:
            err.code === err.PERMISSION_DENIED
              ? "Location permission denied — enable GPS for this app in your phone settings."
              : err.code === err.TIMEOUT
                ? "GPS timed out. Try again with a clearer view of the sky."
                : "Couldn't get your location. Make sure GPS is on and try again.",
        });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, [
    isCalibrated,
    gpsCalibration,
    canCalibrate,
    movingObsId,
    updateObservation,
  ]);

  // ── Handle Image Tap (pin drop or pin move) ──
  const handleImageTap = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!isPlacingPin && !movingObsId) return;
    e.preventDefault();

    const container = imageContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ("changedTouches" in e) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    // Moving an existing pin
    if (movingObsId) {
      updateObservation(movingObsId, { pin_x: x, pin_y: y }).then((result) => {
        if (result) {
          setFeedbackMsg({ type: "success", text: "Pin moved successfully." });
        } else {
          setFeedbackMsg({ type: "error", text: "Failed to move pin." });
        }
      });
      setMovingObsId(null);
      return;
    }

    // Placing a new pin
    setPendingPin({ x, y });
    setIsPlacingPin(false);
    setFormStep("photo");
    setShowForm(true);
    setAnalyzeError(null);
    setDiagnosisResult(null);
    // Reset form data for new observation
    setFormData({ description: "", fix_instructions: "", issue_type: "other", priority: "normal" });
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  // ── Handle Photo Capture ──
  const handlePhotoCaptured = useCallback(async (file: File) => {
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setPhotoPreview(base64);
      setAnalyzeError(null);
      setDiagnosisResult(null);
      setFormStep("review");
    };
    reader.readAsDataURL(file);
  }, [holeNumber]);

  const handlePhotoInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handlePhotoCaptured(file);
  }, [handlePhotoCaptured]);

  // ── AI Generate Fix Instructions ──
  const handleGenerateFix = useCallback(async () => {
    if (formData.issue_type === "other") return;
    setGeneratingFix(true);
    const title = issueTypeLabels[formData.issue_type] || formData.issue_type;
    try {
      const data = await callApi<{ fix_instructions?: string }>("fix-instructions", {
        method: "POST",
        body: {
          title,
          issue_type: formData.issue_type,
          priority: formData.priority,
          description: formData.description || undefined,
          hole_number: holeNumber,
        },
      });
      if (data.fix_instructions) {
        setFormData((p) => ({ ...p, fix_instructions: data.fix_instructions! }));
      }
    } catch (err) {
      console.error("Failed to generate fix instructions:", err);
      setFeedbackMsg({ type: "error", text: "Failed to generate fix instructions." });
    } finally {
      setGeneratingFix(false);
    }
  }, [formData.issue_type, formData.priority, formData.description, holeNumber]);

  // ── Submit Observation ──
  const handleSubmit = useCallback(async () => {
    if (!pendingPin || formData.issue_type === "other") return;
    setSubmitting(true);

    let photoUrl: string | null = null;
    if (photoFile) {
      photoUrl = await uploadPhoto(photoFile);
      if (!photoUrl) {
        setFeedbackMsg({ type: "error", text: "Photo upload failed — saving observation without photo." });
      }
    }

    const result = await createObservation({
      hole_number: holeNumber,
      pin_x: pendingPin.x,
      pin_y: pendingPin.y,
      issue_type: formData.issue_type,
      priority: formData.priority,
      title: issueTypeLabels[formData.issue_type] || formData.issue_type,
      description: formData.description.trim() || null,
      fix_instructions: formData.fix_instructions.trim() || null,
      photo_url: photoUrl,
      diagnosis_result: diagnosisResult as unknown as Record<string, unknown> | null,
    });

    if (result) {
      setShowForm(false);
      setPendingPin(null);
      setFormData({ description: "", fix_instructions: "", issue_type: "other", priority: "normal" });
      setPhotoFile(null);
      setPhotoPreview(null);
      setDiagnosisResult(null);
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      setFeedbackMsg({ type: "success", text: "Observation reported successfully." });
    } else {
      setFeedbackMsg({ type: "error", text: "Failed to save observation. Please try again." });
    }
    setSubmitting(false);
  }, [pendingPin, formData, photoFile, holeNumber, uploadPhoto, createObservation, diagnosisResult]);

  // ── Edit saved observation ──
  const handleStartEdit = useCallback((obs: HoleObservation) => {
    setEditFormData({
      description: obs.description || "",
      fix_instructions: obs.fix_instructions || "",
      issue_type: obs.issue_type,
      priority: obs.priority,
    });
    setEditingObs(true);
    setAutoSaveStatus("idle");
  }, []);

  // Auto-save: debounced save on every field change
  const triggerAutoSave = useCallback((updates: Partial<HoleObservation>) => {
    if (!selectedObs) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setAutoSaveStatus("saving");
    autoSaveTimerRef.current = setTimeout(async () => {
      const result = await updateObservation(selectedObs.id, updates);
      if (result) {
        setSelectedObs((prev) => prev ? { ...prev, ...updates } : prev);
        setAutoSaveStatus("saved");
        setTimeout(() => setAutoSaveStatus("idle"), 1500);
      } else {
        setAutoSaveStatus("idle");
        setFeedbackMsg({ type: "error", text: "Failed to save changes." });
      }
    }, 800);
  }, [selectedObs, updateObservation]);

  // Wrap setEditFormData to also trigger auto-save
  const updateEditField = useCallback((field: string, value: string) => {
    setEditFormData((prev) => {
      const updated = { ...prev, [field]: value };
      const updates: Partial<HoleObservation> = {
        title: issueTypeLabels[updated.issue_type as HoleIssueType] || updated.issue_type,
        description: updated.description.trim() || null,
        fix_instructions: updated.fix_instructions.trim() || null,
        issue_type: updated.issue_type,
        priority: updated.priority,
      };
      triggerAutoSave(updates);
      return updated;
    });
  }, [triggerAutoSave]);

  // Manual save (still available as backup)
  const handleSaveEdit = useCallback(async () => {
    if (!selectedObs) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const updates: Partial<HoleObservation> = {
      title: issueTypeLabels[editFormData.issue_type as HoleIssueType] || editFormData.issue_type,
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
  }, [selectedObs, editFormData, updateObservation]);

  const handleGenerateFixForEdit = useCallback(async () => {
    setGeneratingFixForObs(true);
    const title = issueTypeLabels[editFormData.issue_type as HoleIssueType] || editFormData.issue_type;
    try {
      const data = await callApi<{ fix_instructions?: string }>("fix-instructions", {
        method: "POST",
        body: {
          title,
          issue_type: editFormData.issue_type,
          priority: editFormData.priority,
          description: editFormData.description || undefined,
          hole_number: holeNumber,
        },
      });
      if (data.fix_instructions) {
        setEditFormData((p) => ({ ...p, fix_instructions: data.fix_instructions! }));
        triggerAutoSave({ fix_instructions: data.fix_instructions });
      }
    } catch (err) {
      console.error("Failed to generate fix:", err);
    } finally {
      setGeneratingFixForObs(false);
    }
  }, [editFormData.issue_type, editFormData.priority, editFormData.description, holeNumber]);

  // ── Create Task from Observation ──
  const handleCreateTask = useCallback(async (obs: HoleObservation) => {
    setCreatingTask(true);

    try {
      // Direct REST so the insert can't wedge on a stalled supabase-js
      // auth wrapper after the user navigates between course holes.
      const task = await directInsertRow<{
        id: string;
        title: string;
        status: string;
      }>(
        "tasks",
        {
          title: `Hole ${obs.hole_number}: ${obs.title}`,
          description: `${issueTypeLabels[obs.issue_type]} reported on Hole ${obs.hole_number}.\n\n${obs.description || "No additional details."}${obs.fix_instructions ? `\n\n--- How to Fix ---\n${obs.fix_instructions}` : ""}${obs.photo_url ? `\n\nPhoto: ${obs.photo_url}` : ""}`,
          category: obs.issue_type === "bunker_issue" ? "bunker" : obs.issue_type === "irrigation_issue" ? "irrigation" : obs.issue_type === "mechanical_damage" ? "mechanical" : "greens",
          priority: obs.priority,
          status: "pending",
          due_date: todayLocal(),
          hole_numbers: [obs.hole_number],
          assigned_by: user?.id,
          equipment_needed: [],
          materials_needed: [],
          checklist: [],
        },
        "course-map.hole.createTaskFromObservation",
      );

      if (task) {
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
  // For "resolved": open the proof-photo dialog instead of resolving directly.
  const handleStatusChange = useCallback(async (obs: HoleObservation, newStatus: HoleObservationStatus) => {
    if (newStatus === "resolved") {
      setResolvingObs(obs);
      return;
    }
    const updates: Partial<HoleObservation> = { status: newStatus };
    await updateObservation(obs.id, updates);
    if (selectedObs?.id === obs.id) {
      setSelectedObs({ ...obs, ...updates });
    }
  }, [updateObservation, selectedObs?.id]);

  // ── Resolve with proof photos ──
  const handleConfirmResolve = useCallback(async (photos: string[], notes: string) => {
    if (!resolvingObs) return;
    const updates: Partial<HoleObservation> = {
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: user?.id || null,
      resolution_photos: photos,
      resolution_notes: notes || null,
    };
    const result = await updateObservation(resolvingObs.id, updates);
    if (result) {
      if (selectedObs?.id === resolvingObs.id) {
        setSelectedObs({ ...resolvingObs, ...updates });
      }
      setResolvingObs(null);
      setFeedbackMsg({ type: "success", text: "Issue resolved — proof photos saved to history." });
    } else {
      throw new Error("Failed to resolve");
    }
  }, [resolvingObs, user?.id, updateObservation, selectedObs?.id]);

  // ── Reset form when sheet closes ──
  const handleFormSheetClose = useCallback((open: boolean) => {
    if (!open) {
      setShowForm(false);
      setPendingPin(null);
      setPhotoFile(null);
      setPhotoPreview(null);
      setFormStep("photo");
      setAnalyzeError(null);
    }
  }, []);

  const par = HOLE_PARS[holeNumber] || 4;
  const yards = HOLE_YARDS[holeNumber] || 0;
  const activeCount = holeObs.filter((o) => o.status !== "resolved").length;

  if (isInvalidHole) {
    return (
      <div className="p-4 text-center py-12">
        <p className="text-muted-foreground">Invalid hole number</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/course-map")}>
          Back to Course Map
        </Button>
      </div>
    );
  }

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
              onClick={() => router.push(`/course-map/hole?n=${holeNumber - 1}`)}
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
              onClick={() => router.push(`/course-map/hole?n=${holeNumber + 1}`)}
            >
              Hole {holeNumber + 1}
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
            : feedbackMsg.type === "loading"
            ? "bg-blue-50 text-blue-700 border border-blue-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {feedbackMsg.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : feedbackMsg.type === "loading" ? (
            <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          {feedbackMsg.text}
          <button className="ml-auto" onClick={() => setFeedbackMsg(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Export Actions */}
      {holeObs.length > 0 && (
        <div className="px-4 md:px-6 mb-3 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={async () => {
              setFeedbackMsg({ type: "loading", text: "Generating PDF report..." });
              try {
                await downloadObservationReport({ hole: holeNumber, type: "hole" });
                setFeedbackMsg({ type: "success", text: "Report downloaded!" });
              } catch {
                setFeedbackMsg({ type: "error", text: "Failed to generate report." });
              }
            }}
          >
            <Download className="w-3.5 h-3.5" />
            Download Report
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => {
              const subject = encodeURIComponent(`Hole ${holeNumber} Fairway Observation Report - ${new Date().toLocaleDateString()}`);
              const body = encodeURIComponent(
                `Hi,\n\nPlease find attached the observation report for Hole ${holeNumber} fairway.\n\nTotal observations: ${holeObs.length}\nOpen issues: ${holeObs.filter(o => o.status !== "resolved").length}\n\nGenerated from VMGC GreenKeeper Pro\n${window.location.origin}/course-map/hole?n=${holeNumber}`
              );
              window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
            }}
          >
            <Mail className="w-3.5 h-3.5" />
            Email Report
          </Button>
        </div>
      )}

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
          onTouchEnd={(isPlacingPin || movingObsId) ? handleImageTap : undefined}
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
                    if (!isPlacingPin) { setSelectedObs(obs); setEditingObs(false); }
                  }}
                >
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

          {/* Pin move mode overlay */}
          {movingObsId && (
            <div className="absolute inset-0 bg-blue-500/5 flex items-end justify-center pb-4 pointer-events-none">
              <div className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg flex items-center gap-2">
                <Move className="w-4 h-4" />
                Tap new location for pin
              </div>
            </div>
          )}
        </div>

        {/* Action buttons below image */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {movingObsId ? (
            <>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setMovingObsId(null)}
                disabled={locating}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel Move
              </Button>
              {isCalibrated && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleUseMyLocation}
                  disabled={locating}
                  title="Use my GPS location to move this pin"
                >
                  {locating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Locate className="w-4 h-4 mr-2" />
                  )}
                  Move to My Location
                </Button>
              )}
            </>
          ) : isPlacingPin ? (
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
            <>
              <Button
                className="flex-1 bg-[#1B4332] hover:bg-[#2D6A4F]"
                onClick={() => setIsPlacingPin(true)}
                disabled={locating}
              >
                <Plus className="w-4 h-4 mr-2" />
                Report Issue
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-[#B68D40] text-[#B68D40] hover:bg-[#B68D40]/10 hover:text-[#B68D40]"
                onClick={handleUseMyLocation}
                disabled={locating || calibrationLoading}
                title={
                  isCalibrated
                    ? "Drop a pin where I'm standing using GPS"
                    : canCalibrate
                      ? "Calibrate this hole's GPS first"
                      : "Hole not GPS-calibrated yet — ask a super or foreman"
                }
              >
                {locating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Locate className="w-4 h-4 mr-2" />
                )}
                {isCalibrated ? "Use My Location" : canCalibrate ? "Calibrate GPS" : "GPS not set"}
              </Button>
            </>
          )}
          {/* Admin-only: recalibrate button shown alongside when already
              calibrated, so they can fix bad calibrations easily. */}
          {canCalibrate && isCalibrated && !movingObsId && !isPlacingPin && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setShowCalibrationDialog(true)}
              disabled={locating}
              title="Recalibrate this hole's GPS mapping"
            >
              <Crosshair className="w-3.5 h-3.5 mr-1" />
              Recalibrate
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
              <div
                key={obs.id}
                className="bg-card rounded-xl border border-border hover:border-primary/30 transition-all overflow-hidden"
              >
                {/* Tap the body to open the full detail sheet */}
                <button
                  type="button"
                  onClick={() => { setSelectedObs(obs); setEditingObs(false); }}
                  className="w-full text-left p-3 hover:bg-muted/50 active:scale-[0.99] transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-lg shrink-0">
                      {issueTypeIcons[obs.issue_type]}
                    </div>
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
                    {obs.photo_url && (
                      <img
                        src={obs.photo_url}
                        alt=""
                        className="w-14 h-14 rounded-lg object-cover shrink-0 border border-border"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                  </div>
                </button>
                {/* Quick actions row — visible without opening the sheet */}
                <div className="flex border-t border-border divide-x divide-border">
                  {obs.status !== "resolved" && (
                    <button
                      type="button"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 active:scale-[0.97] transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusChange(obs, "resolved");
                      }}
                      aria-label="Mark as fixed"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mark Fixed
                    </button>
                  )}
                  <button
                    type="button"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-foreground hover:bg-muted/50 active:scale-[0.97] transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedObs(obs);
                      handleStartEdit(obs);
                    }}
                    aria-label="Edit issue"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 active:scale-[0.97] transition-all"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`Delete "${obs.title}"? This cannot be undone.`)) return;
                      const ok = await deleteObservation(obs.id);
                      if (ok) {
                        setFeedbackMsg({ type: "success", text: "Observation deleted." });
                      } else {
                        setFeedbackMsg({ type: "error", text: "Failed to delete observation." });
                      }
                    }}
                    aria-label="Delete issue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          NEW OBSERVATION SHEET — 3 Steps: Photo → Analyzing → Review
         ══════════════════════════════════════════════════════════ */}
      <Sheet open={showForm && !showInlineCamera} onOpenChange={handleFormSheetClose}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#B68D40]" />
              {formStep === "photo" && "Take a Photo"}
              {formStep === "review" && "Review & Submit"}
              <span className="text-muted-foreground font-normal text-sm">— Hole {holeNumber}</span>
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 pb-6">
            {/* ── STEP 1: Photo Capture ── */}
            {formStep === "photo" && (
              <div className="space-y-4">
                {pendingPin && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Pin placed on hole map
                  </div>
                )}

                <div className="text-center py-4">
                  <Camera className="w-16 h-16 text-[#B68D40]/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-1">
                    Take a photo of the issue
                  </p>
                  <p className="text-xs text-muted-foreground mb-6">
                    Attach a photo to help document the problem
                  </p>

                  <button
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#1B4332] hover:bg-[#2D6A4F] text-white rounded-xl cursor-pointer transition-colors text-sm font-medium shadow-md"
                    onClick={() => {
                      savePinState();
                      setShowInlineCamera(true);
                    }}
                  >
                    <Camera className="w-5 h-5" />
                    Open Camera
                  </button>

                  <div className="mt-3 flex flex-col items-center gap-2">
                    <label className="text-xs text-muted-foreground underline cursor-pointer hover:text-foreground">
                      Or choose from gallery
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoInputChange}
                      />
                    </label>
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground mt-2"
                      onClick={() => setFormStep("review")}
                    >
                      Skip photo — fill in manually
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 2: Review & Submit ── */}
            {formStep === "review" && (
              <div className="space-y-4">
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
                  </div>
                )}

                {/* Issue Type & Priority */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Issue Type</Label>
                    <Select
                      value={formData.issue_type}
                      onValueChange={(v) => {
                        const issueType = v as HoleIssueType;
                        setFormData((p) => {
                          const updated = { ...p, issue_type: issueType };
                          const prevDesc = issueTypeDescriptions[p.issue_type] || "";
                          if (!p.description.trim() || p.description === prevDesc) {
                            updated.description = issueTypeDescriptions[issueType] || "";
                          }
                          const prevFix = issueTypeFixTemplates[p.issue_type] || "";
                          if (!p.fix_instructions.trim() || p.fix_instructions === prevFix) {
                            updated.fix_instructions = issueTypeFixTemplates[issueType] || "";
                          }
                          return updated;
                        });
                      }}
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
                    <Label>Priority *</Label>
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

                {/* Description (AI-filled) */}
                <div className="space-y-2">
                  <Label htmlFor="obs-desc">Description</Label>
                  <Textarea
                    id="obs-desc"
                    placeholder="Describe the issue in more detail..."
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
                        disabled={formData.issue_type === "other" || generatingFix}
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
                  className="w-full bg-[#1B4332] hover:bg-[#2D6A4F]"
                  disabled={formData.issue_type === "other" || submitting}
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
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ══════════════════════════════════════════════════════════
          OBSERVATION DETAIL SHEET — View + Full Edit Mode
         ══════════════════════════════════════════════════════════ */}
      <Sheet open={!!selectedObs} onOpenChange={(open) => {
        if (!open) {
          // Flush pending auto-save before closing
          if (editingObs && autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
            if (selectedObs) {
              const updates: Partial<HoleObservation> = {
                title: issueTypeLabels[editFormData.issue_type as HoleIssueType] || editFormData.issue_type,
                description: editFormData.description.trim() || null,
                fix_instructions: editFormData.fix_instructions.trim() || null,
                issue_type: editFormData.issue_type,
                priority: editFormData.priority,
              };
              updateObservation(selectedObs.id, updates);
            }
          }
          setSelectedObs(null);
          setEditingObs(false);
        }
      }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          {selectedObs && !editingObs && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 pr-8">
                  <span className="text-lg">{issueTypeIcons[selectedObs.issue_type]}</span>
                  <span className="flex-1 truncate">{selectedObs.title}</span>
                </SheetTitle>
                {selectedObs.status !== "resolved" && (
                  <div className="flex items-center gap-2 mt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setMovingObsId(selectedObs.id);
                        setSelectedObs(null);
                      }}
                    >
                      <Move className="w-3.5 h-3.5 mr-1" />
                      Move Pin
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => handleStartEdit(selectedObs)}
                    >
                      <Edit3 className="w-3.5 h-3.5 mr-1" />
                      Edit
                    </Button>
                  </div>
                )}
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
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
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

                {/* Resolution proof — shown once the issue is resolved */}
                {selectedObs.status === "resolved" && (selectedObs.resolution_photos?.length || selectedObs.resolution_notes) && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-3">
                    <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Resolution Proof
                    </p>
                    {selectedObs.resolution_photos && selectedObs.resolution_photos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {selectedObs.resolution_photos.map((url) => (
                          <img
                            key={url}
                            src={url}
                            alt="Resolution proof"
                            className="aspect-square w-full rounded-lg object-cover border border-emerald-200"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ))}
                      </div>
                    )}
                    {selectedObs.resolution_notes && (
                      <p className="text-sm text-emerald-900 whitespace-pre-line">{selectedObs.resolution_notes}</p>
                    )}
                  </div>
                )}

                {/* Treatment Plan */}
                {selectedObs.diagnosis_result && (
                  <TreatmentPlanView data={selectedObs.diagnosis_result as unknown as DiagnosisResult} />
                )}

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
                        onClick={() => router.push(`/tasks/view?id=${selectedObs.task!.id}`)}
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
                      className="w-full bg-[#1B4332] hover:bg-[#2D6A4F]"
                      onClick={() => setTaskDialogObs(selectedObs)}
                    >
                      <ClipboardList className="w-4 h-4 mr-2" />
                      Create Task from This
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-red-200 text-red-600 hover:bg-red-50"
                    onClick={async () => {
                      if (!confirm("Delete this observation? This cannot be undone.")) return;
                      const ok = await deleteObservation(selectedObs.id);
                      if (ok) {
                        setSelectedObs(null);
                        setFeedbackMsg({ type: "success", text: "Observation deleted." });
                      } else {
                        setFeedbackMsg({ type: "error", text: "Failed to delete observation." });
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* ── EDIT MODE ── */}
          {selectedObs && editingObs && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-[#B68D40]" />
                  Edit Observation
                  {/* Auto-save indicator */}
                  <span className="ml-auto text-xs font-normal">
                    {autoSaveStatus === "saving" && (
                      <span className="text-blue-600 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Saving...
                      </span>
                    )}
                    {autoSaveStatus === "saved" && (
                      <span className="text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Saved
                      </span>
                    )}
                  </span>
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-4 mt-4 pb-6">
                {/* Photo — add/replace in edit mode */}
                <div className="space-y-2">
                  {selectedObs.photo_url ? (
                    <div className="relative">
                      <img
                        src={selectedObs.photo_url}
                        alt="Issue photo"
                        className="w-full h-36 object-cover rounded-xl border border-border"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="absolute bottom-2 right-2 h-8 text-xs gap-1.5 bg-white/90 hover:bg-white"
                        disabled={editPhotoUploading}
                        onClick={() => editPhotoInputRef.current?.click()}
                      >
                        {editPhotoUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                        {editPhotoUploading ? "Uploading..." : "Replace Photo"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-24 border-dashed flex flex-col gap-1"
                      disabled={editPhotoUploading}
                      onClick={() => editPhotoInputRef.current?.click()}
                    >
                      {editPhotoUploading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Camera className="w-5 h-5 text-muted-foreground" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {editPhotoUploading ? "Uploading photo..." : "Add Photo"}
                      </span>
                    </Button>
                  )}
                  <input
                    ref={editPhotoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !selectedObs) return;
                      e.target.value = "";
                      setEditPhotoUploading(true);
                      try {
                        const url = await uploadPhoto(file);
                        if (url) {
                          await updateObservation(selectedObs.id, { photo_url: url });
                          setSelectedObs((prev) => prev ? { ...prev, photo_url: url } : prev);
                          setAutoSaveStatus("saved");
                          setTimeout(() => setAutoSaveStatus("idle"), 1500);
                        }
                      } catch (err) {
                        console.error("Photo upload failed:", err);
                        setFeedbackMsg({ type: "error", text: "Failed to upload photo." });
                      } finally {
                        setEditPhotoUploading(false);
                      }
                    }}
                  />
                </div>

                {/* Issue Type & Priority */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Issue Type</Label>
                    <Select
                      value={editFormData.issue_type}
                      onValueChange={(v) => {
                        const issueType = v as HoleIssueType;
                        // Auto-fill description if empty or still a default
                        const prevDesc = issueTypeDescriptions[editFormData.issue_type] || "";
                        if (!editFormData.description.trim() || editFormData.description === prevDesc) {
                          updateEditField("description", issueTypeDescriptions[issueType] || "");
                        }
                        // Auto-fill fix if empty or still a default
                        const prevFix = issueTypeFixTemplates[editFormData.issue_type] || "";
                        if (!editFormData.fix_instructions.trim() || editFormData.fix_instructions === prevFix) {
                          updateEditField("fix_instructions", issueTypeFixTemplates[issueType] || "");
                        }
                        updateEditField("issue_type", v);
                      }}
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
                      value={editFormData.priority}
                      onValueChange={(v) => updateEditField("priority", v)}
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
                  <Label>Description</Label>
                  <Textarea
                    rows={3}
                    value={editFormData.description}
                    onChange={(e) => updateEditField("description", e.target.value)}
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
                      disabled={editFormData.issue_type === "other" || generatingFixForObs}
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
                    onChange={(e) => updateEditField("fix_instructions", e.target.value)}
                    placeholder="Step-by-step instructions for the crew..."
                  />
                </div>

                {/* Done button — changes auto-save, this just closes the sheet */}
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-[#1B4332] hover:bg-[#2D6A4F]"
                    onClick={() => {
                      // Flush any pending auto-save immediately
                      if (autoSaveTimerRef.current) {
                        clearTimeout(autoSaveTimerRef.current);
                        handleSaveEdit();
                      } else {
                        setEditingObs(false);
                      }
                    }}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Done
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">Changes save automatically as you type</p>
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

      {/* Inline Camera (getUserMedia — stays in-browser, no tab kill on Android) */}
      <InlineCamera
        open={showInlineCamera}
        onCapture={(file) => {
          setShowInlineCamera(false);
          handlePhotoCaptured(file);
        }}
        onClose={() => setShowInlineCamera(false)}
      />

      {/* GPS Calibration dialog (admins only) */}
      <GpsCalibrationDialog
        open={showCalibrationDialog}
        onOpenChange={setShowCalibrationDialog}
        holeNumber={holeNumber}
        surfaceType="hole"
        imageSrc={`/holes/hole-${holeNumber}.png`}
        onSaved={() => {
          setFeedbackMsg({
            type: "success",
            text: "GPS calibration saved — Use My Location is ready.",
          });
        }}
      />

      {/* Resolve dialog — captures proof photos and notes before closing the issue */}
      <ResolveIssueDialog
        open={!!resolvingObs}
        title={resolvingObs ? `Resolve Hole ${resolvingObs.hole_number} Issue` : ""}
        issueTitle={resolvingObs?.title ?? ""}
        uploadPhoto={uploadPhoto}
        onResolve={async ({ photos, notes }) => {
          await handleConfirmResolve(photos, notes);
        }}
        onCancel={() => setResolvingObs(null)}
      />
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
