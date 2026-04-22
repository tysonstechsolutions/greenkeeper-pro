"use client";

/**
 * ScanWizard — multi-step flow that runs after a successful asset scan.
 *
 * Step order (see WizardStep type): verify → link → status → photo_front →
 * photo_left → photo_back → photo_right → damage_prompt → (damage_loop) →
 * operational → parts → service → review → done.
 *
 * Writes happen on advance, not at Save. If the user's phone dies in the
 * middle we don't lose 10 minutes of work — each step that has data to
 * persist commits it to Supabase before moving forward.
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ImageOff,
  Loader2,
  Package,
  Plus,
  Trash2,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { InlineCamera } from "@/components/ui/inline-camera";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { uploadPhoto } from "@/lib/supabase/storage";
import { useAuth } from "@/lib/hooks/useAuth";
import { useProfiles, getDisplayName } from "@/lib/hooks/useProfiles";
import { useEquipment } from "@/lib/hooks/useEquipment";
import { useEquipmentParts } from "@/lib/hooks/useEquipmentParts";
import { useEquipmentServiceRecords } from "@/lib/hooks/useEquipmentServiceRecords";
import type {
  ConditionPhotoAngle,
  Fy26Asset,
  Fy26AssetStatus,
} from "@/types/fy26-assets";
import {
  CONDITION_PHOTO_LABELS,
  fy26AssetStatusLabels,
  fy26AssetStatusColors,
} from "@/types/fy26-assets";
import type { EquipmentType } from "@/types/database";

type WizardStep =
  | "verify"
  | "link"
  | "status"
  | "photo_front"
  | "photo_left"
  | "photo_back"
  | "photo_right"
  | "damage_prompt"
  | "damage_capture"
  | "damage_note"
  | "operational"
  | "parts"
  | "service"
  | "review"
  | "done";

interface PartRow {
  name: string;
  part_number: string;
  quantity: number;
}

interface DamageEntry {
  photo_url: string;
  note: string;
}

interface ServiceRecordDraft {
  service_date: string;
  performed_by: string;
  description: string;
}

const WIZARD_PHOTO_ANGLES: ConditionPhotoAngle[] = [
  "front",
  "left",
  "back",
  "right",
];

// Map an angle to the wizard step that captures it.
const ANGLE_TO_STEP: Record<ConditionPhotoAngle, WizardStep> = {
  front: "photo_front",
  left: "photo_left",
  back: "photo_back",
  right: "photo_right",
};

const STATUS_OPTIONS: Fy26AssetStatus[] = [
  "verified_present",
  "needs_disposed",
  "disposed",
  "mia",
  "no_asset_tag",
];

// Guess an equipment_type from the asset description — keeps new equipment
// records from all landing on "other". Cheap keyword match; the user can
// override on the equipment edit page later.
function guessEquipmentType(description: string): EquipmentType {
  const d = description.toLowerCase();
  if (/reel\s*mower|greens\s*mower/.test(d)) return "mower_reel";
  if (/rotary\s*mower|fairway/.test(d)) return "mower_rotary";
  if (/rough\s*mower/.test(d)) return "mower_rough";
  if (/mower/.test(d)) return "mower_rotary";
  if (/aerat|aerifier/.test(d)) return "aerator";
  if (/sprayer/.test(d)) return "sprayer";
  if (/topdress/.test(d)) return "topdresser";
  if (/utility|ute\b|gator|cushman/.test(d)) return "utility_vehicle";
  if (/tractor/.test(d)) return "tractor";
  if (/blower/.test(d)) return "blower";
  if (/trimmer|weed.?eater/.test(d)) return "trimmer";
  if (/chainsaw|chain.?saw/.test(d)) return "chainsaw";
  if (/roller/.test(d)) return "roller";
  if (/seeder|overseeder/.test(d)) return "seeder";
  if (/pump/.test(d)) return "pump";
  return "other";
}

interface ScanWizardProps {
  asset: Fy26Asset;
  /** The raw barcode value that matched this asset (null = manual entry). */
  barcode: string | null;
  /** Called when the wizard finishes (save success or user bails out). */
  onDone: () => void;
  /** Called from the Verify step's "Not this asset" button. */
  onNotThisAsset: () => void;
}

export function ScanWizard({
  asset,
  barcode,
  onDone,
  onNotThisAsset,
}: ScanWizardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { allStaff } = useProfiles();
  const { createEquipment } = useEquipment();
  const { addPart } = useEquipmentParts();
  const { addRecord: addServiceRecord } = useEquipmentServiceRecords();

  const [step, setStep] = useState<WizardStep>("verify");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persistent wizard state — survives step-to-step.
  const [equipmentId, setEquipmentId] = useState<string | null>(
    asset.equipment_id,
  );
  const [status, setStatus] = useState<Fy26AssetStatus>(asset.status);
  const [conditionPhotos, setConditionPhotos] = useState<
    Record<ConditionPhotoAngle, string | null>
  >({
    front: asset.condition_photos?.front ?? null,
    left: asset.condition_photos?.left ?? null,
    back: asset.condition_photos?.back ?? null,
    right: asset.condition_photos?.right ?? null,
  });
  const [damageEntries, setDamageEntries] = useState<DamageEntry[]>([]);
  const [damageTooExtensive, setDamageTooExtensive] = useState(false);
  const [pendingDamagePhoto, setPendingDamagePhoto] = useState<string | null>(
    null,
  );
  const [pendingDamageNote, setPendingDamageNote] = useState("");
  const [operational, setOperational] = useState<boolean | null>(null);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [service, setService] = useState<ServiceRecordDraft>({
    service_date: new Date().toISOString().slice(0, 10),
    performed_by: "",
    description: "",
  });

  // Camera modal state (for the photo steps).
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraFor, setCameraFor] = useState<
    | { kind: "condition"; angle: ConditionPhotoAngle }
    | { kind: "damage" }
    | null
  >(null);

  const supabase = createClient();

  // ── Helpers ────────────────────────────────────────────────────────────

  const safeSetError = useCallback((msg: string | null) => {
    setError(msg);
    if (msg) console.error("[ScanWizard]", msg);
  }, []);

  const uploadFileAsPhoto = useCallback(
    async (file: File): Promise<string> => {
      if (!user) throw new Error("No user session");
      const { publicUrl } = await uploadPhoto(file, user.id);
      return publicUrl;
    },
    [user],
  );

  // ── Step 1: Verify ─────────────────────────────────────────────────────

  const handleVerified = useCallback(() => {
    setError(null);
    setStep("link");
  }, []);

  // ── Step 2: Auto-link barcode + create equipment record ────────────────

  const runLink = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const updates: Record<string, unknown> = {};

      // Auto-learn the barcode on the asset if the scan provided one and
      // the asset doesn't already have it.
      if (barcode && !asset.barcode_value) {
        updates.barcode_value = barcode;
      }

      // Create the equipment record if none exists yet.
      let eqId = equipmentId;
      if (!eqId) {
        const created = await createEquipment({
          name: asset.description,
          equipment_type: guessEquipmentType(asset.description),
          make: asset.manufacturer || undefined,
          model: asset.model_text || undefined,
          serial_number: asset.serial_number || undefined,
          asset_tag:
            asset.sub_number && asset.sub_number !== "0"
              ? `${asset.asset_number}-${asset.sub_number}`
              : asset.asset_number,
          status: "operational", // default; updated later if user says otherwise
          notes: `Auto-created from FY26 asset scan on ${new Date()
            .toISOString()
            .slice(0, 10)}`,
        });
        if (!created) throw new Error("Failed to create equipment record");
        eqId = created.id;
        updates.equipment_id = eqId;
        setEquipmentId(eqId);
      }

      if (Object.keys(updates).length > 0) {
        const { error: upErr } = await supabase
          .from("fy26_assets")
          .update(updates)
          .eq("id", asset.id);
        if (upErr) throw upErr;
      }

      // Small delay so the "Linked ✓" screen is visible; feels better than
      // flashing through.
      await new Promise((r) => setTimeout(r, 600));
      setStep("status");
    } catch (err) {
      safeSetError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [
    asset.id,
    asset.description,
    asset.manufacturer,
    asset.model_text,
    asset.serial_number,
    asset.asset_number,
    asset.sub_number,
    asset.barcode_value,
    barcode,
    equipmentId,
    createEquipment,
    supabase,
    safeSetError,
  ]);

  // Kick off the link as soon as the user reaches the link step.
  if (step === "link" && !busy && equipmentId === asset.equipment_id && !error) {
    // Only run once; runLink checks equipmentId itself and is idempotent
    // through the updates guard, but this avoids the double-fire under
    // StrictMode. Using a setTimeout(0) defers past the current render.
    setTimeout(() => {
      if (step === "link") runLink();
    }, 0);
  }

  // ── Step 3: Status ─────────────────────────────────────────────────────

  const handleStatus = useCallback(
    async (newStatus: Fy26AssetStatus) => {
      setBusy(true);
      setError(null);
      try {
        const { error: upErr } = await supabase
          .from("fy26_assets")
          .update({
            status: newStatus,
            verified_at: new Date().toISOString(),
            verified_by: user?.id ?? null,
          })
          .eq("id", asset.id);
        if (upErr) throw upErr;
        setStatus(newStatus);
        setStep("photo_front");
      } catch (err) {
        safeSetError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [asset.id, user?.id, supabase, safeSetError],
  );

  // ── Steps 4a-4d: Condition photos ──────────────────────────────────────

  const openConditionCamera = useCallback((angle: ConditionPhotoAngle) => {
    setCameraFor({ kind: "condition", angle });
    setCameraOpen(true);
  }, []);

  const handleConditionPhotoCaptured = useCallback(
    async (file: File) => {
      if (!cameraFor || cameraFor.kind !== "condition") {
        setCameraOpen(false);
        return;
      }
      setCameraOpen(false);
      setBusy(true);
      setError(null);
      try {
        const url = await uploadFileAsPhoto(file);
        const angle = cameraFor.angle;
        const nextPhotos = { ...conditionPhotos, [angle]: url };
        setConditionPhotos(nextPhotos);

        // Persist the whole condition_photos map so a crash mid-wizard
        // doesn't lose photos already taken.
        const filtered = Object.fromEntries(
          Object.entries(nextPhotos).filter(([, v]) => !!v),
        );
        const { error: upErr } = await supabase
          .from("fy26_assets")
          .update({ condition_photos: filtered })
          .eq("id", asset.id);
        if (upErr) throw upErr;

        // Advance to the next angle (or to damage step after right).
        const currentIdx = WIZARD_PHOTO_ANGLES.indexOf(angle);
        const next = WIZARD_PHOTO_ANGLES[currentIdx + 1];
        setStep(next ? ANGLE_TO_STEP[next] : "damage_prompt");
      } catch (err) {
        safeSetError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
        setCameraFor(null);
      }
    },
    [cameraFor, conditionPhotos, asset.id, supabase, uploadFileAsPhoto, safeSetError],
  );

  const skipConditionPhoto = useCallback(
    (angle: ConditionPhotoAngle) => {
      const idx = WIZARD_PHOTO_ANGLES.indexOf(angle);
      const next = WIZARD_PHOTO_ANGLES[idx + 1];
      setStep(next ? ANGLE_TO_STEP[next] : "damage_prompt");
    },
    [],
  );

  // ── Step 5: Damage ─────────────────────────────────────────────────────

  const openDamageCamera = useCallback(() => {
    setCameraFor({ kind: "damage" });
    setCameraOpen(true);
    setStep("damage_capture");
  }, []);

  const handleDamagePhotoCaptured = useCallback(
    async (file: File) => {
      setCameraOpen(false);
      setBusy(true);
      setError(null);
      try {
        const url = await uploadFileAsPhoto(file);
        setPendingDamagePhoto(url);
        setPendingDamageNote("");
        setStep("damage_note");
      } catch (err) {
        safeSetError(err instanceof Error ? err.message : String(err));
        setStep("damage_prompt");
      } finally {
        setBusy(false);
        setCameraFor(null);
      }
    },
    [uploadFileAsPhoto, safeSetError],
  );

  const commitDamageEntry = useCallback(
    async (after: "more" | "done") => {
      if (!pendingDamagePhoto) return;
      setBusy(true);
      setError(null);
      try {
        const { error: insErr } = await supabase
          .from("asset_damage_records")
          .insert({
            asset_id: asset.id,
            damage_date: new Date().toISOString().slice(0, 10),
            description: pendingDamageNote.trim() || "(no note)",
            photos: [pendingDamagePhoto],
            reported_by: user?.id ?? null,
          });
        if (insErr) throw insErr;
        setDamageEntries((prev) => [
          ...prev,
          { photo_url: pendingDamagePhoto, note: pendingDamageNote.trim() },
        ]);
        setPendingDamagePhoto(null);
        setPendingDamageNote("");
        if (after === "more") {
          openDamageCamera();
        } else {
          setStep("operational");
        }
      } catch (err) {
        safeSetError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [
      pendingDamagePhoto,
      pendingDamageNote,
      asset.id,
      user?.id,
      supabase,
      openDamageCamera,
      safeSetError,
    ],
  );

  const markTooExtensive = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: upErr } = await supabase
        .from("fy26_assets")
        .update({ damage_too_extensive: true })
        .eq("id", asset.id);
      if (upErr) throw upErr;
      setDamageTooExtensive(true);
      setStep("operational");
    } catch (err) {
      safeSetError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [asset.id, supabase, safeSetError]);

  // ── Step 6: Operational ────────────────────────────────────────────────

  const handleOperational = useCallback(async (isOp: boolean) => {
    setOperational(isOp);
    // Persist to the equipment record.
    if (equipmentId) {
      try {
        await supabase
          .from("equipment")
          .update({ status: isOp ? "operational" : "out_of_service" })
          .eq("id", equipmentId);
      } catch (err) {
        console.warn("[ScanWizard] equipment status update failed:", err);
      }
    }
    setStep("parts");
  }, [equipmentId, supabase]);

  // ── Step 7: Parts ──────────────────────────────────────────────────────

  const addPartRow = useCallback(() => {
    setParts((p) => [...p, { name: "", part_number: "", quantity: 1 }]);
  }, []);
  const removePartRow = useCallback((idx: number) => {
    setParts((p) => p.filter((_, i) => i !== idx));
  }, []);
  const updatePartRow = useCallback(
    (idx: number, patch: Partial<PartRow>) => {
      setParts((p) =>
        p.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
      );
    },
    [],
  );

  const commitParts = useCallback(async () => {
    if (parts.length === 0 || !equipmentId) {
      setStep("service");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const row of parts) {
        if (!row.name.trim()) continue;
        const { error: addErr } = await addPart(equipmentId, {
          name: row.name.trim(),
          part_number: row.part_number.trim() || undefined,
          quantity: row.quantity || 1,
          status: "needed",
        });
        if (addErr) throw new Error(addErr);
      }
      setStep("service");
    } catch (err) {
      safeSetError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [parts, equipmentId, addPart, safeSetError]);

  // ── Step 8: Service ────────────────────────────────────────────────────

  const commitService = useCallback(async () => {
    // Allow skipping if the user didn't enter anything.
    if (
      !service.performed_by &&
      !service.description.trim() &&
      service.service_date === new Date().toISOString().slice(0, 10)
    ) {
      setStep("review");
      return;
    }
    if (!equipmentId) {
      setStep("review");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: addErr } = await addServiceRecord(equipmentId, {
        service_date: service.service_date,
        performed_by: service.performed_by || "Unknown",
        description: service.description.trim() || "(no description)",
      });
      if (addErr) throw new Error(addErr);
      setStep("review");
    } catch (err) {
      safeSetError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [service, equipmentId, addServiceRecord, safeSetError]);

  // ── Step 9: Review & Save ──────────────────────────────────────────────

  const finalizeAndSave = useCallback(() => {
    // Everything has already been persisted as we went. This step is a
    // confirmation; finalize by navigating away.
    setStep("done");
    onDone();
    router.push("/assets");
  }, [onDone, router]);

  // ── Progress indicator ─────────────────────────────────────────────────

  const progress = useMemo(() => {
    const ordered: WizardStep[] = [
      "verify",
      "link",
      "status",
      "photo_front",
      "photo_left",
      "photo_back",
      "photo_right",
      "damage_prompt",
      "operational",
      "parts",
      "service",
      "review",
    ];
    const idx = ordered.indexOf(step);
    const total = ordered.length;
    const stepNum = idx >= 0 ? idx + 1 : total;
    return { stepNum, total, pct: Math.round((stepNum / total) * 100) };
  }, [step]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto">
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>
            Step {progress.stepNum} of {progress.total}
          </span>
          <button
            type="button"
            onClick={onDone}
            className="underline underline-offset-2 hover:text-foreground"
          >
            Cancel
          </button>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Step content */}
      {step === "verify" && (
        <VerifyStep
          asset={asset}
          onConfirm={handleVerified}
          onReject={onNotThisAsset}
        />
      )}

      {step === "link" && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Linking barcode and creating equipment record…
          </p>
        </div>
      )}

      {step === "status" && (
        <StatusStep busy={busy} onPick={handleStatus} />
      )}

      {(step === "photo_front" ||
        step === "photo_left" ||
        step === "photo_back" ||
        step === "photo_right") && (
        <ConditionPhotoStep
          angle={stepToAngle(step)}
          existing={conditionPhotos[stepToAngle(step)]}
          busy={busy}
          onOpenCamera={() => openConditionCamera(stepToAngle(step))}
          onSkip={() => skipConditionPhoto(stepToAngle(step))}
        />
      )}

      {step === "damage_prompt" && (
        <DamagePromptStep
          damageCount={damageEntries.length}
          busy={busy}
          onTakePhoto={openDamageCamera}
          onNoDamage={() => setStep("operational")}
          onTooExtensive={markTooExtensive}
        />
      )}

      {step === "damage_capture" && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {cameraOpen ? "Opening camera…" : "Uploading…"}
          </p>
        </div>
      )}

      {step === "damage_note" && pendingDamagePhoto && (
        <DamageNoteStep
          photoUrl={pendingDamagePhoto}
          note={pendingDamageNote}
          onNoteChange={setPendingDamageNote}
          busy={busy}
          onAddAnother={() => commitDamageEntry("more")}
          onContinue={() => commitDamageEntry("done")}
        />
      )}

      {step === "operational" && (
        <OperationalStep busy={busy} onPick={handleOperational} />
      )}

      {step === "parts" && (
        <PartsStep
          operational={operational}
          parts={parts}
          busy={busy}
          onAddRow={addPartRow}
          onRemoveRow={removePartRow}
          onUpdateRow={updatePartRow}
          onContinue={commitParts}
        />
      )}

      {step === "service" && (
        <ServiceStep
          service={service}
          staff={allStaff.map((s) => ({
            id: s.id,
            name: getDisplayName(s),
          }))}
          busy={busy}
          onChange={setService}
          onContinue={commitService}
        />
      )}

      {step === "review" && (
        <ReviewStep
          asset={asset}
          status={status}
          conditionPhotos={conditionPhotos}
          damageEntries={damageEntries}
          damageTooExtensive={damageTooExtensive}
          operational={operational}
          parts={parts.filter((p) => p.name.trim())}
          service={service}
          busy={busy}
          onSave={finalizeAndSave}
        />
      )}

      <InlineCamera
        open={cameraOpen}
        onCapture={
          cameraFor?.kind === "condition"
            ? handleConditionPhotoCaptured
            : handleDamagePhotoCaptured
        }
        onClose={() => {
          setCameraOpen(false);
          setCameraFor(null);
          if (step === "damage_capture") setStep("damage_prompt");
        }}
      />
    </div>
  );
}

function stepToAngle(s: WizardStep): ConditionPhotoAngle {
  if (s === "photo_front") return "front";
  if (s === "photo_left") return "left";
  if (s === "photo_back") return "back";
  return "right";
}

// ── Sub-components ─────────────────────────────────────────────────────────

function VerifyStep({
  asset,
  onConfirm,
  onReject,
}: {
  asset: Fy26Asset;
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Verify asset</h2>
      <p className="text-sm text-muted-foreground">
        Does this match the asset you scanned? If so, tap Next.
      </p>
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="font-semibold text-base">{asset.description}</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Asset #</div>
              <div className="font-mono">
                {asset.asset_number}
                {asset.sub_number && asset.sub_number !== "0"
                  ? ` / ${asset.sub_number}`
                  : ""}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Site</div>
              <div>{asset.site}</div>
            </div>
            {asset.manufacturer && (
              <div>
                <div className="text-muted-foreground text-xs">Manufacturer</div>
                <div>{asset.manufacturer}</div>
              </div>
            )}
            {asset.model_text && (
              <div>
                <div className="text-muted-foreground text-xs">Model</div>
                <div>{asset.model_text}</div>
              </div>
            )}
            {asset.serial_number && (
              <div className="col-span-2">
                <div className="text-muted-foreground text-xs">Serial</div>
                <div className="font-mono text-xs">{asset.serial_number}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-2">
        <Button size="lg" className="w-full" onClick={onConfirm}>
          Yes, this is the asset
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={onReject}
        >
          Not this asset — rescan
        </Button>
      </div>
    </div>
  );
}

function StatusStep({
  busy,
  onPick,
}: {
  busy: boolean;
  onPick: (s: Fy26AssetStatus) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Mark status</h2>
      <p className="text-sm text-muted-foreground">
        What&apos;s the current state of this asset?
      </p>
      <div className="flex flex-col gap-2">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => onPick(s)}
            className="flex items-center justify-between p-4 rounded-lg border-2 border-border hover:border-primary active:scale-[0.98] transition disabled:opacity-50"
            style={{
              borderColor: undefined,
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: fy26AssetStatusColors[s] }}
              />
              <span className="font-medium">{fy26AssetStatusLabels[s]}</span>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

function ConditionPhotoStep({
  angle,
  existing,
  busy,
  onOpenCamera,
  onSkip,
}: {
  angle: ConditionPhotoAngle;
  existing: string | null;
  busy: boolean;
  onOpenCamera: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">
        Photo — {CONDITION_PHOTO_LABELS[angle]}
      </h2>
      <p className="text-sm text-muted-foreground">
        Take a photo of the {CONDITION_PHOTO_LABELS[angle].toLowerCase()} of the
        asset.
      </p>
      {existing ? (
        <div className="relative rounded-lg overflow-hidden border border-border aspect-[4/3] bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={existing}
            alt={`Existing ${angle} photo`}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-2 right-2 bg-background/90 text-xs px-2 py-1 rounded flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-green-600" />
            Already captured
          </div>
        </div>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-border aspect-[4/3] flex flex-col items-center justify-center text-muted-foreground">
          <ImageOff className="w-10 h-10 mb-2" />
          <p className="text-sm">No photo yet</p>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={onOpenCamera}
        >
          {busy ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Camera className="w-4 h-4 mr-2" />
          )}
          {existing ? "Retake photo" : "Take photo"}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={onSkip}
        >
          Skip this angle
        </Button>
      </div>
    </div>
  );
}

function DamagePromptStep({
  damageCount,
  busy,
  onTakePhoto,
  onNoDamage,
  onTooExtensive,
}: {
  damageCount: number;
  busy: boolean;
  onTakePhoto: () => void;
  onNoDamage: () => void;
  onTooExtensive: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Damage</h2>
      <p className="text-sm text-muted-foreground">
        Is there visible damage to document?
        {damageCount > 0 && (
          <span className="ml-1 font-medium text-foreground">
            ({damageCount} captured so far)
          </span>
        )}
      </p>
      <div className="flex flex-col gap-2">
        <Button size="lg" className="w-full" disabled={busy} onClick={onTakePhoto}>
          <Camera className="w-4 h-4 mr-2" />
          Yes — take a photo
        </Button>
        <Button
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={onNoDamage}
        >
          {damageCount > 0 ? "Continue — no more damage" : "No visible damage"}
        </Button>
        <Button
          variant="outline"
          className="w-full text-red-600 border-red-200 hover:bg-red-50"
          disabled={busy}
          onClick={onTooExtensive}
        >
          Too much damage to document
        </Button>
      </div>
    </div>
  );
}

function DamageNoteStep({
  photoUrl,
  note,
  onNoteChange,
  busy,
  onAddAnother,
  onContinue,
}: {
  photoUrl: string;
  note: string;
  onNoteChange: (s: string) => void;
  busy: boolean;
  onAddAnother: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Damage note</h2>
      <div className="rounded-lg overflow-hidden border border-border aspect-[4/3] bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="Damage" className="w-full h-full object-cover" />
      </div>
      <div>
        <Label htmlFor="damage-note">What&apos;s damaged?</Label>
        <Textarea
          id="damage-note"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="e.g. Cracked front fender, left side"
          rows={3}
          className="mt-1"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={onContinue}
        >
          {busy ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Check className="w-4 h-4 mr-2" />
          )}
          Save damage & continue
        </Button>
        <Button
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={onAddAnother}
        >
          Save damage & take another photo
        </Button>
      </div>
    </div>
  );
}

function OperationalStep({
  busy,
  onPick,
}: {
  busy: boolean;
  onPick: (isOp: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Operational?</h2>
      <p className="text-sm text-muted-foreground">
        Can this asset be used for its intended purpose right now?
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onPick(true)}
          className="p-6 rounded-xl border-2 border-border hover:border-green-500 active:scale-[0.98] transition flex flex-col items-center gap-2 disabled:opacity-50"
        >
          <CheckCircle2 className="w-10 h-10 text-green-600" />
          <span className="font-semibold">Yes</span>
          <span className="text-xs text-muted-foreground text-center">
            Operational
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onPick(false)}
          className="p-6 rounded-xl border-2 border-border hover:border-red-500 active:scale-[0.98] transition flex flex-col items-center gap-2 disabled:opacity-50"
        >
          <XCircle className="w-10 h-10 text-red-600" />
          <span className="font-semibold">No</span>
          <span className="text-xs text-muted-foreground text-center">
            Needs parts / repair
          </span>
        </button>
      </div>
    </div>
  );
}

function PartsStep({
  operational,
  parts,
  busy,
  onAddRow,
  onRemoveRow,
  onUpdateRow,
  onContinue,
}: {
  operational: boolean | null;
  parts: PartRow[];
  busy: boolean;
  onAddRow: () => void;
  onRemoveRow: (idx: number) => void;
  onUpdateRow: (idx: number, patch: Partial<PartRow>) => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">
        {operational === false
          ? "Parts required to make operational"
          : "Parts to order (optional)"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {operational === false
          ? "What parts are needed? Each row lands on the /order-list page."
          : "Any parts to order for this equipment? Optional."}
      </p>
      {parts.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-60" />
          No parts added yet.
        </div>
      ) : (
        <div className="space-y-3">
          {parts.map((row, idx) => (
            <Card key={idx}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Part {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveRow(idx)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                    aria-label="Remove part"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <Input
                  placeholder="Part name (e.g. bedknife)"
                  value={row.name}
                  onChange={(e) =>
                    onUpdateRow(idx, { name: e.target.value })
                  }
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Part # (optional)"
                    value={row.part_number}
                    onChange={(e) =>
                      onUpdateRow(idx, { part_number: e.target.value })
                    }
                  />
                  <Input
                    type="number"
                    min={1}
                    placeholder="Qty"
                    value={row.quantity}
                    onChange={(e) =>
                      onUpdateRow(idx, {
                        quantity: parseInt(e.target.value, 10) || 1,
                      })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Button
        variant="outline"
        className="w-full"
        onClick={onAddRow}
        disabled={busy}
      >
        <Plus className="w-4 h-4 mr-2" />
        Add part
      </Button>
      <Button
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={onContinue}
      >
        {busy ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <ArrowRight className="w-4 h-4 mr-2" />
        )}
        {parts.length > 0 ? "Save parts & continue" : "Skip — no parts"}
      </Button>
    </div>
  );
}

function ServiceStep({
  service,
  staff,
  busy,
  onChange,
  onContinue,
}: {
  service: ServiceRecordDraft;
  staff: Array<{ id: string; name: string }>;
  busy: boolean;
  onChange: (s: ServiceRecordDraft) => void;
  onContinue: () => void;
}) {
  const hasData =
    !!service.performed_by || !!service.description.trim();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Service history</h2>
      <p className="text-sm text-muted-foreground">
        Most recent service performed on this asset. Skip if no recent service
        to log.
      </p>
      <div className="space-y-3">
        <div>
          <Label htmlFor="service-date">Date serviced</Label>
          <Input
            id="service-date"
            type="date"
            value={service.service_date}
            onChange={(e) =>
              onChange({ ...service, service_date: e.target.value })
            }
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="service-by">Who serviced it</Label>
          <Select
            value={service.performed_by}
            onValueChange={(v) => onChange({ ...service, performed_by: v })}
          >
            <SelectTrigger id="service-by" className="mt-1">
              <SelectValue placeholder="Select staff" />
            </SelectTrigger>
            <SelectContent>
              {staff.map((p) => (
                <SelectItem key={p.id} value={p.name}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="service-desc">What was the service?</Label>
          <Textarea
            id="service-desc"
            value={service.description}
            onChange={(e) =>
              onChange({ ...service, description: e.target.value })
            }
            placeholder="e.g. Sharpened reel, adjusted bedknife"
            rows={3}
            className="mt-1"
          />
        </div>
      </div>
      <Button
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={onContinue}
      >
        {busy ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Wrench className="w-4 h-4 mr-2" />
        )}
        {hasData ? "Save service & continue" : "Skip — no service to log"}
      </Button>
    </div>
  );
}

function ReviewStep({
  asset,
  status,
  conditionPhotos,
  damageEntries,
  damageTooExtensive,
  operational,
  parts,
  service,
  busy,
  onSave,
}: {
  asset: Fy26Asset;
  status: Fy26AssetStatus;
  conditionPhotos: Record<ConditionPhotoAngle, string | null>;
  damageEntries: DamageEntry[];
  damageTooExtensive: boolean;
  operational: boolean | null;
  parts: PartRow[];
  service: ServiceRecordDraft;
  busy: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Review</h2>
      <p className="text-sm text-muted-foreground">
        Quick look before finishing. Everything&apos;s already saved; tap Done to
        return to the asset list.
      </p>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <div className="text-xs text-muted-foreground">Asset</div>
            <div className="font-medium">{asset.description}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              style={{
                backgroundColor: `${fy26AssetStatusColors[status]}15`,
                borderColor: fy26AssetStatusColors[status],
                color: fy26AssetStatusColors[status],
              }}
            >
              {fy26AssetStatusLabels[status]}
            </Badge>
            {operational !== null && (
              <Badge
                variant="outline"
                className={
                  operational
                    ? "bg-green-50 text-green-700 border-green-200"
                    : "bg-red-50 text-red-700 border-red-200"
                }
              >
                {operational ? "Operational" : "Not operational"}
              </Badge>
            )}
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              Condition photos
            </div>
            <div className="grid grid-cols-4 gap-2">
              {WIZARD_PHOTO_ANGLES.map((angle) => (
                <div
                  key={angle}
                  className="aspect-square rounded bg-muted overflow-hidden text-center text-[10px] text-muted-foreground flex items-center justify-center"
                >
                  {conditionPhotos[angle] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={conditionPhotos[angle]!}
                      alt={angle}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>
                      No
                      <br />
                      {angle}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Damage</div>
            {damageTooExtensive ? (
              <div className="text-sm text-red-600 font-medium">
                Too extensive to document
              </div>
            ) : damageEntries.length === 0 ? (
              <div className="text-sm text-muted-foreground">None reported</div>
            ) : (
              <div className="text-sm">
                {damageEntries.length} photo
                {damageEntries.length === 1 ? "" : "s"} saved
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Parts to order</div>
            <div className="text-sm">
              {parts.length === 0
                ? "None"
                : parts.map((p) => p.name).join(", ")}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Service logged</div>
            <div className="text-sm">
              {service.description.trim()
                ? `${service.service_date} — ${service.description}`
                : "None"}
            </div>
          </div>
        </CardContent>
      </Card>
      <Button size="lg" className="w-full" disabled={busy} onClick={onSave}>
        <Check className="w-4 h-4 mr-2" />
        Done
      </Button>
    </div>
  );
}

export type { ScanWizardProps };
