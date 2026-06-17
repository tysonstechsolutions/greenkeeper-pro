"use client";

import { useState, useEffect } from "react";
import {
  Wrench,
  Loader2,
  CheckCircle,
  Sparkles,
  Download,
  ImagePlus,
  Camera,
  X,
  ChevronDown,
  ChevronUp,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/hooks/useAuth";
import { callApi } from "@/lib/api/client";
import { useAiGenerate, type AiSource } from "@/lib/ai/use-ai-generate";
import {
  generateWorkOrderBlob,
  type WorkOrderData,
} from "@/lib/reports/work-order-report";
import { workOrderPdfFilename } from "@/lib/reports/wo-naming";
import { saveBlobToDevice } from "@/lib/utils/download-blob";
import { todayCentralMmDdYyyy } from "@/lib/utils/date";
import { resizeImageFile } from "@/lib/utils/image-resize";
import { isNative, capturePhoto } from "@/lib/utils/native-camera";
import { directInsertRow } from "@/lib/supabase/rest";
import { createClubhouseIssueForWO } from "@/lib/work-orders/clubhouse-sync";
import { PR_COST_CENTERS } from "@/lib/pr-accounting-codes";

// ── Fixed SECTION 2 values ──────────────────────────────────────────────────────

// Facility/Bldg # — VMGC only runs out of these two buildings. Values must
// match the official form's dropdown options exactly.
const FACILITY_OPTIONS = [
  { value: "VMGC @ 8400", label: "8400 — VMGC @ 8400" },
  { value: "VMGC @ 3311", label: "3311 — VMGC @ 3311" },
];

// Primary/Secondary POC are fixed for every golf work order.
const WO_POC = {
  primaryEmail: "admin@tysonstechsolutions.com",
  primaryPhone: "847-688-4593",
  secondaryName: "Joseph Caprez",
  secondaryPhone: "847-688-4593",
} as const;

const MAX_PHOTOS = 10;

// Official SECTION 2 work-type options (the AI picks one; the user can change it).
const WORK_TYPE_OPTIONS: string[] = [
  "Emergency (Life/Safety)",
  "Fire Deficiency",
  "IH Deficiency",
  "NAVOSH Deficiency",
  "Revenue Impact",
  "Routine",
  "Safety",
  "Urgent (Impact to Mission)",
];

// ── AI content generation (the ai-assistant accepts the "MWR coordinator"
// framing — do NOT switch it to an outside persona, which it refuses). ──────────

async function generateWorkOrderContent(
  description: string,
  facility: string,
  programArea: string,
): Promise<{ formattedDescription: string; workType: string }> {
  const prompt = `You are an MWR Facilities Maintenance coordinator writing a maintenance work order.

Based on the request below, produce two outputs:

1. A professional, clear description of the work needed (100-180 words). Use factual maintenance language. Include the specific facility and area when relevant. If the request involves an emergency or urgent matter, begin with "URGENT:" or "EMERGENCY:" respectively. Do not editorialize, use markdown, or add asterisks — just describe the work clearly.

2. The single most appropriate WORK TYPE from this exact list (pick one):
Emergency (Life/Safety) | Fire Deficiency | IH Deficiency | NAVOSH Deficiency | Revenue Impact | Routine | Safety | Urgent (Impact to Mission)

Choose "Routine" unless the description clearly indicates life/safety, fire, health, safety, revenue impact, or mission-critical urgency.

FACILITY/LOCATION: ${facility || "VMGC"} ${programArea}
REQUEST: ${description}

Respond using EXACTLY this format (no extra text):
DESCRIPTION:
[your description here]

WORK_TYPE:
[single work type from the list above]`;

  const reply = await callApi<{ reply?: string; error?: string }>("ai-assistant", {
    method: "POST",
    body: { message: prompt, history: [] },
  });

  const text = (reply?.reply ?? "").replace(/\*\*/g, "");
  const descMatch = text.match(/DESCRIPTION:\s*([\s\S]*?)(?=WORK_TYPE:|$)/i);
  const typeMatch = text.match(/WORK_TYPE:\s*([\s\S]*?)$/i);

  return {
    formattedDescription: descMatch?.[1]?.trim() || description,
    workType: typeMatch?.[1]?.trim() || "Routine",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /** Called after a work order is saved so the parent list can refresh. */
  onCreated: () => void;
}

export function NewWorkOrderForm({ onCreated }: Props) {
  const { profile } = useAuth();
  const [expanded, setExpanded] = useState(true);
  const [description, setDescription] = useState("");
  const [facility, setFacility] = useState("");
  const [programAreaRoom, setProgramAreaRoom] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [photos, setPhotos] = useState<{ file: File; dataUrl: string }[]>([]);
  const [onNative, setOnNative] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastData, setLastData] = useState<WorkOrderData | null>(null);
  const [lastFilename, setLastFilename] = useState<string | null>(null);

  // AI learning library: reuse a past write-up for the same request (free)
  // before paying for a new one; the user can regenerate or edit either way.
  const ai = useAiGenerate("work_order");
  const [preview, setPreview] = useState<{
    desc: string;
    workType: string;
    source: AiSource;
    degraded: boolean;
    servedDesc: string;
  } | null>(null);

  useEffect(() => {
    isNative().then(setOnNative);
  }, []);

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
        /* skip unreadable files */
      }
    }
    setPhotos((prev) => [...prev, ...results]);
  };

  const handleCameraCapture = async () => {
    try {
      const captured = await capturePhoto();
      const resized = await resizeImageFile(captured.file, { maxDim: 1600, quality: 0.82 });
      setPhotos((prev) => [
        ...prev,
        { file: resized.file, dataUrl: `data:${resized.mediaType};base64,${resized.base64}` },
      ]);
    } catch {
      /* user cancelled */
    }
  };

  const removePhoto = (idx: number) =>
    setPhotos((prev) => prev.filter((_, i) => i !== idx));

  const canGenerate =
    description.trim().length >= 10 &&
    facility.trim().length > 0 &&
    programAreaRoom.trim().length > 0;

  const runArgs = () => ({
    input: description,
    inputMeta: { facility, programArea: programAreaRoom },
    callAi: async () => {
      const r = await generateWorkOrderContent(description, facility, programAreaRoom);
      return {
        text: r.formattedDescription,
        meta: { workType: r.workType },
        model: "claude-sonnet-4-6",
      };
    },
  });

  const showPreview = (res: {
    text: string;
    meta: Record<string, unknown>;
    source: AiSource;
    degraded: boolean;
  }) => {
    const wt =
      typeof res.meta.workType === "string" && res.meta.workType.trim()
        ? res.meta.workType.trim()
        : "Routine";
    setPreview({
      desc: res.text,
      workType: wt,
      source: res.source,
      degraded: res.degraded,
      servedDesc: res.text,
    });
  };

  // Step 1 — produce the write-up (library-first; only pays the AI on a miss).
  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      showPreview(await ai.run(runArgs()));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate work order. Please try again.",
      );
    } finally {
      setGenerating(false);
    }
  };

  // "I don't like it" — force a fresh paid AI version.
  const handleRegenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      showPreview(await ai.regenerate(runArgs()));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The AI couldn't generate a new version. Please try again.",
      );
    } finally {
      setGenerating(false);
    }
  };

  // Step 2 — commit the (possibly edited) write-up: learn it, save the WO, make the PDF.
  const handleConfirmSave = async () => {
    if (!preview) return;
    setGenerating(true);
    setError(null);
    try {
      const formattedDescription = preview.desc.trim() || description;
      const workType = preview.workType.trim() || "Routine";

      // Teach the library the final text we actually used.
      await ai.saveFinal({
        input: description,
        inputMeta: { facility, programArea: programAreaRoom },
        text: formattedDescription,
        meta: { workType },
        servedText: preview.servedDesc,
      });

      const photoDataUrls = photos.map((p) => p.dataUrl);
      const enclosureCount = photos.length > 0 ? String(photos.length) : "0";

      const data: WorkOrderData = {
        date: todayCentralMmDdYyyy(),
        facilityBldg: facility,
        programAreaRoom,
        costCenter,
        descriptionOfWork: formattedDescription,
        workType,
        primaryPocEmail: WO_POC.primaryEmail,
        primaryPocPhone: WO_POC.primaryPhone,
        numberOfEnclosures: enclosureCount,
        secondaryPocName: WO_POC.secondaryName,
        secondaryPocPhone: WO_POC.secondaryPhone,
        photos: photoDataUrls.length > 0 ? photoDataUrls : undefined,
      };
      setLastData(data);

      // Save to DB — the BEFORE INSERT trigger assigns wo_sequence_number.
      const row = await directInsertRow<{ id: string; wo_sequence_number: number }>(
        "work_orders",
        {
          date_submitted: new Date().toISOString().slice(0, 10),
          nature_of_request: null, // SECTION 1 — Facilities Admin fills this
          facility_bldg: facility || null,
          program_area_room: programAreaRoom || null,
          cost_center: costCenter || null,
          description_of_work: formattedDescription,
          work_type: workType || null,
          primary_poc_email: WO_POC.primaryEmail,
          primary_poc_phone: WO_POC.primaryPhone,
          secondary_poc_name: WO_POC.secondaryName,
          secondary_poc_phone: WO_POC.secondaryPhone,
          number_of_enclosures: enclosureCount,
          status: "submitted",
          created_by: profile?.id ?? null,
        },
        "work-orders.create",
      );

      // Mirror this work order onto the clubhouse/facilities board (best-effort).
      await createClubhouseIssueForWO({
        id: row.id,
        description_of_work: formattedDescription,
        work_type: workType,
        facility_bldg: facility,
        program_area_room: programAreaRoom,
      });

      const filename = workOrderPdfFilename(row.wo_sequence_number);
      setLastFilename(filename);

      const blob = await generateWorkOrderBlob(data);
      await saveBlobToDevice({
        blob,
        filename,
        shareTitle: "MWR Facilities Maintenance Work Order",
      });

      onCreated();
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save work order. Please try again.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadAgain = async () => {
    if (!lastData) return;
    setGenerating(true);
    try {
      const blob = await generateWorkOrderBlob(lastData);
      await saveBlobToDevice({
        blob,
        filename: lastFilename ?? "Work-Order.pdf",
        shareTitle: "MWR Facilities Maintenance Work Order",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setGenerating(false);
    }
  };

  const handleReset = () => {
    setDescription("");
    setFacility("");
    setProgramAreaRoom("");
    setCostCenter("");
    setPhotos([]);
    setPreview(null);
    setDone(false);
    setError(null);
    setLastData(null);
    setLastFilename(null);
  };

  // ── Done state ──
  if (done) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-6 text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-7 h-7 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-green-800">Work Order Generated</h2>
            <p className="text-sm text-green-700 mt-1">
              Your MWR Facilities Maintenance Work Order PDF (SECTION 2) has been saved. Email
              it to <span className="font-medium">grlkmwrworkorders@us.navy.mil</span> to submit.
            </p>
          </div>
          <div className="flex gap-3 justify-center pt-1">
            <Button onClick={handleDownloadAgain} variant="outline" disabled={generating}>
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Download Again
            </Button>
            <Button onClick={handleReset} className="bg-[#1B4332] hover:bg-[#2D6A4F]">
              New Work Order
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 p-4 text-left"
      >
        <div className="w-9 h-9 rounded-xl bg-[#1B4332]/10 text-[#1B4332] flex items-center justify-center shrink-0">
          {expanded ? <Wrench className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">New Work Order</p>
          <p className="text-xs text-muted-foreground">
            Describe the issue — AI writes SECTION 2 and fills the official form.
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <CardContent className="space-y-4 pt-0">
          <div className="space-y-1.5">
            <Label htmlFor="wo-desc">
              What needs to be done? <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="wo-desc"
              placeholder="e.g. The irrigation pump at the #7 pump house won't build pressure — needs diagnosis and repair."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Be specific. The AI expands this into a detailed work order description.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="wo-facility">
                Facility / Building # <span className="text-red-500">*</span>
              </Label>
              <select
                id="wo-facility"
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base"
              >
                <option value="">Select facility…</option>
                {FACILITY_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wo-loc">
                Program Area / Specific Location <span className="text-red-500">*</span>
              </Label>
              <Input
                id="wo-loc"
                placeholder="e.g. #7 fairway pump house"
                value={programAreaRoom}
                onChange={(e) => setProgramAreaRoom(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wo-cc">Cost Center</Label>
            <select
              id="wo-cc"
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base"
            >
              <option value="">Select cost center…</option>
              {PR_COST_CENTERS.map((cc) => (
                <option key={cc.value} value={cc.value}>
                  {cc.label}
                </option>
              ))}
            </select>
          </div>

          {/* Photos */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  Photos{" "}
                  <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Up to {MAX_PHOTOS}. Appended as enclosure pages.
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {photos.length}/{MAX_PHOTOS}
              </span>
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {photos.map((p, idx) => (
                  <div
                    key={idx}
                    className="relative group aspect-square rounded-lg overflow-hidden border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.dataUrl} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
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
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleCameraCapture}>
                    <Camera className="w-4 h-4" />
                    Take Photo
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg bg-[#1B4332]/5 border border-[#1B4332]/20 p-3 text-xs text-muted-foreground">
            <CardDescription>
              Date, both POCs, and enclosure count are filled automatically. SECTION 1 and
              SECTION 3 are left blank for Facilities Admin and the Maintenance Team.
            </CardDescription>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {!preview ? (
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              className="w-full gap-2 bg-[#1B4332] hover:bg-[#2D6A4F]"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Generate Work Order
                </>
              )}
            </Button>
          ) : (
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Review the work order</p>
                {preview.degraded ? (
                  <span className="inline-flex items-center text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800">
                    Offline draft — review carefully
                  </span>
                ) : preview.source === "library" ? (
                  <span className="inline-flex items-center text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-800">
                    Reused from your library · free
                  </span>
                ) : (
                  <span className="inline-flex items-center text-xs font-medium px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                    Generated with AI
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wo-preview-desc">Description of work</Label>
                <Textarea
                  id="wo-preview-desc"
                  value={preview.desc}
                  onChange={(e) =>
                    setPreview((p) => (p ? { ...p, desc: e.target.value } : p))
                  }
                  rows={8}
                  className="resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wo-preview-type">Work Type</Label>
                <select
                  id="wo-preview-type"
                  value={preview.workType}
                  onChange={(e) =>
                    setPreview((p) => (p ? { ...p, workType: e.target.value } : p))
                  }
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base"
                >
                  {(WORK_TYPE_OPTIONS.includes(preview.workType)
                    ? WORK_TYPE_OPTIONS
                    : [preview.workType, ...WORK_TYPE_OPTIONS]
                  ).map((wt) => (
                    <option key={wt} value={wt}>
                      {wt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRegenerate}
                  disabled={generating}
                  className="gap-2"
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Regenerate with AI
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmSave}
                  disabled={generating}
                  className="flex-1 gap-2 bg-[#1B4332] hover:bg-[#2D6A4F]"
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Save &amp; Download PDF
                </Button>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
                disabled={generating}
              >
                ← Edit the request
              </button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
