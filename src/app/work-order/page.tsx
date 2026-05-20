"use client";

import { useState, useEffect } from "react";
import {
  Wrench,
  ChevronRight,
  ChevronLeft,
  Download,
  Loader2,
  CheckCircle,
  Sparkles,
  ClipboardList,
  MapPin,
  ImagePlus,
  Camera,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/hooks/useAuth";
import { callApi } from "@/lib/api/client";
import { downloadWorkOrderReport, type WorkOrderData } from "@/lib/reports/work-order-report";
import { todayCentralMmDdYyyy } from "@/lib/utils/date";
import { resizeImageFile } from "@/lib/utils/image-resize";
import { isNative, capturePhoto } from "@/lib/utils/native-camera";

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Work Details", icon: ClipboardList },
  { id: 2, label: "Location & Contact", icon: MapPin },
];

// ── Work type options ─────────────────────────────────────────────────────────

const WORK_TYPES = [
  "General Maintenance",
  "Electrical",
  "Plumbing",
  "HVAC/Mechanical",
  "Carpentry/Structural",
  "Painting/Finishes",
  "Grounds/Landscaping",
  "Vehicle/Equipment",
  "Pest Control",
  "Special Event Support",
  "Other",
];

// ── Form state ────────────────────────────────────────────────────────────────

interface WoForm {
  workDescription: string;
  priority: string;
  facilityBldg: string;
  programAreaRoom: string;
  costCenter: string;
  numberOfEnclosures: string;
  secondaryPocName: string;
  secondaryPocPhone: string;
  primaryPocEmail: string;
  primaryPocPhone: string;
}

function emptyForm(): WoForm {
  return {
    workDescription: "",
    priority: "Routine",
    facilityBldg: "",
    programAreaRoom: "",
    costCenter: "",
    numberOfEnclosures: "0",
    secondaryPocName: "",
    secondaryPocPhone: "",
    primaryPocEmail: "",
    primaryPocPhone: "",
  };
}

// ── AI content generation ─────────────────────────────────────────────────────

async function generateWorkOrderContent(
  description: string,
  priority: string,
  facility: string,
  programArea: string,
): Promise<{ formattedDescription: string; workType: string }> {
  const prompt = `You are an MWR Facilities Maintenance coordinator writing a maintenance work order.

Based on the request below, produce two outputs:

1. A professional, clear description of the work needed (100–180 words). Use factual maintenance language. Include the specific facility and area when relevant. If the priority is Urgent or Emergent, begin with "URGENT:" or "EMERGENT:" respectively. Do not editorialize — just describe the work clearly.

2. The single most appropriate work type from this exact list:
General Maintenance | Electrical | Plumbing | HVAC/Mechanical | Carpentry/Structural | Painting/Finishes | Grounds/Landscaping | Vehicle/Equipment | Pest Control | Special Event Support | Other

PRIORITY: ${priority}
FACILITY/LOCATION: ${facility || "Golf Course Maintenance Facility"}
PROGRAM AREA/ROOM: ${programArea || "See description"}
REQUEST: ${description}

Respond using EXACTLY this format (no extra text):
DESCRIPTION:
[your description here]

WORK_TYPE:
[single work type from the list]`;

  const reply = await callApi<{ reply?: string; error?: string }>("ai-assistant", {
    method: "POST",
    body: { message: prompt, history: [] },
  });

  const text = reply?.reply ?? "";
  const descMatch = text.match(/DESCRIPTION:\s*([\s\S]*?)(?=WORK_TYPE:|$)/i);
  const typeMatch = text.match(/WORK_TYPE:\s*([\s\S]*?)$/i);

  return {
    formattedDescription: descMatch?.[1]?.trim() ?? description,
    workType: typeMatch?.[1]?.trim() ?? "General Maintenance",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WorkOrderPage() {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WoForm>(emptyForm);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastData, setLastData] = useState<WorkOrderData | null>(null);

  // Photo attachments
  const [photos, setPhotos] = useState<{ file: File; dataUrl: string }[]>([]);
  const [onNative, setOnNative] = useState(false);
  const MAX_PHOTOS = 10;

  useEffect(() => {
    isNative().then(setOnNative);
  }, []);

  /** Add photos from file picker */
  const handlePhotoFiles = async (files: FileList | null) => {
    if (!files) return;
    const remaining = MAX_PHOTOS - photos.length;
    const batch = Array.from(files).slice(0, remaining);
    const results: { file: File; dataUrl: string }[] = [];
    for (const f of batch) {
      try {
        const resized = await resizeImageFile(f, { maxDim: 1600, quality: 0.82 });
        results.push({
          file: resized.file,
          dataUrl: `data:${resized.mediaType};base64,${resized.base64}`,
        });
      } catch {
        // skip unreadable files silently
      }
    }
    setPhotos((prev) => [...prev, ...results]);
  };

  /** Take photo on native */
  const handleCameraCapture = async () => {
    try {
      const captured = await capturePhoto();
      const resized = await resizeImageFile(captured.file, { maxDim: 1600, quality: 0.82 });
      setPhotos((prev) => [
        ...prev,
        {
          file: resized.file,
          dataUrl: `data:${resized.mediaType};base64,${resized.base64}`,
        },
      ]);
    } catch {
      // user cancelled — ignore
    }
  };

  const removePhoto = (idx: number) =>
    setPhotos((prev) => prev.filter((_, i) => i !== idx));

  // Auto-fill primary POC from profile
  useEffect(() => {
    if (!profile) return;
    setForm((prev) => ({
      ...prev,
      primaryPocEmail: profile.email ?? prev.primaryPocEmail,
      primaryPocPhone: profile.phone ?? prev.primaryPocPhone,
    }));
  }, [profile]);

  const set = (key: keyof WoForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canNext = (): boolean => {
    if (step === 1) return form.workDescription.trim().length >= 10;
    if (step === 2)
      return (
        form.facilityBldg.trim().length > 0 &&
        form.programAreaRoom.trim().length > 0 &&
        form.primaryPocEmail.trim().length > 0 &&
        form.primaryPocPhone.trim().length > 0
      );
    return true;
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { formattedDescription, workType } = await generateWorkOrderContent(
        form.workDescription,
        form.priority,
        form.facilityBldg,
        form.programAreaRoom,
      );

      // Auto-set enclosure count to match photos if user left it at 0
      const photoDataUrls = photos.map((p) => p.dataUrl);
      const enclosureCount =
        photos.length > 0 && (form.numberOfEnclosures === "0" || !form.numberOfEnclosures)
          ? String(photos.length)
          : form.numberOfEnclosures || "0";

      const data: WorkOrderData = {
        date: todayCentralMmDdYyyy(),
        facilityBldg: form.facilityBldg,
        programAreaRoom: form.programAreaRoom,
        costCenter: form.costCenter,
        descriptionOfWork: formattedDescription,
        workType,
        primaryPocEmail: form.primaryPocEmail,
        primaryPocPhone: form.primaryPocPhone,
        numberOfEnclosures: enclosureCount,
        secondaryPocName: form.secondaryPocName,
        secondaryPocPhone: form.secondaryPocPhone,
        photos: photoDataUrls.length > 0 ? photoDataUrls : undefined,
      };

      setLastData(data);
      await downloadWorkOrderReport(data);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate work order. Please try again.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadAgain = async () => {
    if (!lastData) return;
    setGenerating(true);
    try {
      await downloadWorkOrderReport(lastData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setGenerating(false);
    }
  };

  const handleReset = () => {
    setForm(emptyForm());
    setPhotos([]);
    setStep(1);
    setDone(false);
    setError(null);
    setLastData(null);
  };

  return (
    <div className="p-4 md:p-6 pb-24 max-w-2xl mx-auto">
      <PageHeader
        title="Maintenance Work Order"
        description="Generate an MWR Facilities Maintenance Work Order (Section 2)"
        icon={Wrench}
      />

      {/* Step indicator */}
      {!done && (
        <div className="flex items-center gap-1 mt-6 mb-6">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isComplete = step > s.id;
            return (
              <div key={s.id} className="flex items-center flex-1">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? "bg-[#1B4332] text-white"
                      : isComplete
                        ? "bg-[#1B4332]/20 text-[#1B4332]"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {isComplete ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-1 ${step > s.id ? "bg-[#1B4332]/40" : "bg-gray-200"}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── DONE state ── */}
      {done && (
        <Card className="mt-6 border-green-200 bg-green-50">
          <CardContent className="p-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-green-800">Work Order Generated</h2>
              <p className="text-sm text-green-700 mt-1">
                Your MWR Facilities Maintenance Work Order PDF has been downloaded. Email it to{" "}
                <span className="font-medium">grlkmwrworkorders@us.navy.mil</span> to submit.
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <Button onClick={handleDownloadAgain} variant="outline" disabled={generating}>
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download Again
                  </>
                )}
              </Button>
              <Button onClick={handleReset} className="bg-[#1B4332] hover:bg-[#2D6A4F]">
                New Work Order
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 1: Work Details ── */}
      {!done && step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What work needs to be done?</CardTitle>
            <CardDescription>
              Describe the issue or task. The AI will write the professional work order
              description and determine the work type.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="workDescription">
                Description of Work Needed <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="workDescription"
                placeholder="e.g. The exterior door on the north side of the maintenance building is not latching properly — the latch mechanism is broken and the door swings open on its own. Needs repair or replacement of the latch hardware."
                value={form.workDescription}
                onChange={(e) => set("workDescription", e.target.value)}
                rows={6}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Be specific — include location, what's broken, and what you need done. The AI will
                expand this into formal work order language.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="priority">Priority / Nature of Request</Label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Routine">
                    Routine — standard scheduling, no immediate urgency
                  </SelectItem>
                  <SelectItem value="Urgent">
                    Urgent — impacts customer service, revenue, or operations
                  </SelectItem>
                  <SelectItem value="Emergent">
                    Emergent — life/safety, security, or prevents damage to MWR assets
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Urgent/Emergent requests can be called in first — but the work order must still be
                submitted no later than COB the following business day.
              </p>
            </div>

            {/* ── Photo attachments ── */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    Photos{" "}
                    <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Attach up to {MAX_PHOTOS} photos. They'll be appended as enclosure pages in the
                    PDF.
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {photos.length}/{MAX_PHOTOS}
                </span>
              </div>

              {/* Thumbnails */}
              {photos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {photos.map((p, idx) => (
                    <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.dataUrl}
                        alt={`Photo ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add buttons */}
              {photos.length < MAX_PHOTOS && (
                <div className="flex gap-2">
                  <label className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors">
                    <ImagePlus className="w-4 h-4 text-muted-foreground" />
                    Choose Photos
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      onChange={(e) => handlePhotoFiles(e.target.files)}
                    />
                  </label>
                  {onNative && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={handleCameraCapture}
                    >
                      <Camera className="w-4 h-4" />
                      Take Photo
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: Location & Contact ── */}
      {!done && step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Location & Contact Details</CardTitle>
            <CardDescription>These fill Section 2 of the official form.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="facility">
                  Facility / Building # <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="facility"
                  placeholder="e.g. Golf Course Maintenance, Bldg 8400"
                  value={form.facilityBldg}
                  onChange={(e) => set("facilityBldg", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="programArea">
                  Program Area / Room <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="programArea"
                  placeholder="e.g. Golf Operations / North Entry"
                  value={form.programAreaRoom}
                  onChange={(e) => set("programAreaRoom", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="costCenter">Cost Center</Label>
                <Input
                  id="costCenter"
                  placeholder="e.g. 1353-8400"
                  value={form.costCenter}
                  onChange={(e) => set("costCenter", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enclosures">Number of Enclosures</Label>
                <Input
                  id="enclosures"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.numberOfEnclosures}
                  onChange={(e) => set("numberOfEnclosures", e.target.value)}
                />
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Primary POC (You)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pocEmail">
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="pocEmail"
                    type="email"
                    placeholder="name@navy.mil"
                    value={form.primaryPocEmail}
                    onChange={(e) => set("primaryPocEmail", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pocPhone">
                    Phone <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="pocPhone"
                    type="tel"
                    placeholder="(000) 000-0000"
                    value={form.primaryPocPhone}
                    onChange={(e) => set("primaryPocPhone", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                Secondary POC{" "}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="secName">Name</Label>
                  <Input
                    id="secName"
                    placeholder="First Last"
                    value={form.secondaryPocName}
                    onChange={(e) => set("secondaryPocName", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="secPhone">Phone</Label>
                  <Input
                    id="secPhone"
                    type="tel"
                    placeholder="(000) 000-0000"
                    value={form.secondaryPocPhone}
                    onChange={(e) => set("secondaryPocPhone", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Ready banner */}
            <div className="mt-2 p-4 bg-[#1B4332]/5 border border-[#1B4332]/20 rounded-lg space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-[#1B4332]">
                <Sparkles className="w-4 h-4" />
                Ready to Generate
              </div>
              <p className="text-xs text-muted-foreground">
                Claude AI will professionalize your description, determine the work type, and
                produce a filled PDF matching the official MWR Facilities Maintenance Work Order
                form (rev 10/2024). Section 1 and Section 3 are intentionally left blank for
                Facilities Admin and the Maintenance Team.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Navigation */}
      {!done && (
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 1}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          {step < STEPS.length ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext()}
              className="bg-[#1B4332] hover:bg-[#2D6A4F]"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={!canNext() || generating}
              className="bg-[#1B4332] hover:bg-[#2D6A4F]"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Work Order
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
