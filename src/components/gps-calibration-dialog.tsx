"use client";

/**
 * GPS Calibration dialog.
 *
 * Lets an admin teach the app how a hole image relates to real-world GPS
 * by tapping the same landmark (typically the TEE then the GREEN FLAG)
 * on BOTH the hole image AND a satellite map. Two reference points are
 * enough to derive a similarity transform — see lib/utils/gps-to-pixel.ts.
 *
 * Flow:
 *   Step 1 — pick TEE on image, pick TEE on satellite map
 *   Step 2 — pick GREEN FLAG on image, pick GREEN FLAG on satellite map
 *   Save   — persist via useHoleGpsCalibration.save()
 *
 * The user can tap the image or the map in either order within a step.
 * Both must be filled before the step is complete.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Flag,
  MapPin,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  Crosshair,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { useHoleGpsCalibration } from "@/lib/hooks/useHoleGpsCalibration";
import { isCalibrationUsable } from "@/lib/utils/gps-to-pixel";
import type { HoleGpsSurfaceType } from "@/types/database";

// React-Leaflet must render client-only — dynamic import avoids SSR errors.
const GpsCalibrationMap = dynamic(
  () =>
    import("@/components/features/map/gps-calibration-map").then(
      (m) => m.GpsCalibrationMap,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-muted/30 rounded-lg">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

// VMGC course center — keeps the map opened on the course on first launch.
// Pulled from the existing course-map-component.tsx default.
const DEFAULT_MAP_CENTER: [number, number] = [42.3095, -87.8475];

interface ImagePoint {
  /** 0-1 relative X. */
  x: number;
  /** 0-1 relative Y. */
  y: number;
}

type Step = "p1" | "p2" | "done";

const STEP_META: Record<Exclude<Step, "done">, { label: string; icon: typeof Flag }> = {
  p1: { label: "Tee", icon: MapPin },
  p2: { label: "Green Flag", icon: Flag },
};

interface GpsCalibrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which hole this calibration is for. */
  holeNumber: number;
  /** "hole" calibrates against /holes/hole-N.png; "green" against /greens/green-N.svg. */
  surfaceType: HoleGpsSurfaceType;
  /** Image src to use on top half — supply so the dialog doesn't have to guess. */
  imageSrc: string;
  /** Called after a successful save so the parent can refresh its UI state. */
  onSaved?: () => void;
}

export function GpsCalibrationDialog({
  open,
  onOpenChange,
  holeNumber,
  surfaceType,
  imageSrc,
  onSaved,
}: GpsCalibrationDialogProps) {
  const { calibration, save, saving, error } = useHoleGpsCalibration(
    holeNumber,
    surfaceType,
  );

  // Pick state — image-space picks (0-1) and world-space picks (lat, lng).
  // Index 0 = tee/p1, index 1 = green/p2.
  const [imagePicks, setImagePicks] = useState<[ImagePoint | null, ImagePoint | null]>([
    null,
    null,
  ]);
  const [mapPicks, setMapPicks] = useState<[[number, number] | null, [number, number] | null]>([
    null,
    null,
  ]);
  const [step, setStep] = useState<Step>("p1");
  const [imgError, setImgError] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Where to centre the map. Use the most-recent map pick (current step or
  // prior) so a second pick lands near the first. Falls back to course
  // center.
  const mapCenter = useMemo<[number, number]>(() => {
    if (mapPicks[1]) return mapPicks[1];
    if (mapPicks[0]) return mapPicks[0];
    if (calibration) {
      // If recalibrating, open the map zoomed in on the prior tee position.
      return [calibration.p1_lat, calibration.p1_lng];
    }
    return DEFAULT_MAP_CENTER;
  }, [mapPicks, calibration]);

  // Pick-slot index, narrowed to a 2-tuple-safe type so TS lets us write
  // back into a `[T | null, T | null]` array directly.
  const stepIndex: 0 | 1 | -1 = step === "p1" ? 0 : step === "p2" ? 1 : -1;

  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (stepIndex === -1) return;
      const slot: 0 | 1 = stepIndex;
      const container = imageContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const clamped: ImagePoint = {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      };
      setImagePicks((prev) => {
        const next: [ImagePoint | null, ImagePoint | null] = [prev[0], prev[1]];
        next[slot] = clamped;
        return next;
      });
    },
    [stepIndex],
  );

  const handleMapPickSet = useCallback(
    (idx: number, ll: [number, number]) => {
      if (idx !== stepIndex || stepIndex === -1) return;
      const slot: 0 | 1 = stepIndex;
      setMapPicks((prev) => {
        const next: [[number, number] | null, [number, number] | null] = [
          prev[0],
          prev[1],
        ];
        next[slot] = ll;
        return next;
      });
    },
    [stepIndex],
  );

  const stepComplete = (idx: number) => imagePicks[idx] && mapPicks[idx];
  const canContinue = stepComplete(0);
  const canSave = stepComplete(0) && stepComplete(1);

  const handleReset = () => {
    setImagePicks([null, null]);
    setMapPicks([null, null]);
    setStep("p1");
    setSavedMsg(null);
  };

  const handleSave = async () => {
    if (!canSave) return;
    const p1Img = imagePicks[0]!;
    const p2Img = imagePicks[1]!;
    const [p1Lat, p1Lng] = mapPicks[0]!;
    const [p2Lat, p2Lng] = mapPicks[1]!;

    // Validate the two map picks aren't on top of each other — that would
    // make the transform singular.
    if (
      !isCalibrationUsable({
        p1_lat: p1Lat,
        p1_lng: p1Lng,
        p2_lat: p2Lat,
        p2_lng: p2Lng,
      })
    ) {
      setSavedMsg(
        "Your two map points are too close together — pick two distinct landmarks (e.g. tee and green) and try again.",
      );
      return;
    }

    const result = await save({
      p1_lat: p1Lat,
      p1_lng: p1Lng,
      p1_x: p1Img.x,
      p1_y: p1Img.y,
      p2_lat: p2Lat,
      p2_lng: p2Lng,
      p2_x: p2Img.x,
      p2_y: p2Img.y,
    });
    if (result) {
      setSavedMsg("Calibration saved — Use My Location is ready.");
      onSaved?.();
      // Close after a short pause so the user sees the success message.
      setTimeout(() => onOpenChange(false), 1200);
    }
  };

  // Reset transient state when the dialog opens (but keep prior calibration
  // picks visible if the admin is recalibrating an existing hole).
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setImagePicks([null, null]);
      setMapPicks([null, null]);
      setStep("p1");
      setSavedMsg(null);
      setImgError(false);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-[#B68D40]" />
            Calibrate Hole {holeNumber}{" "}
            <span className="text-muted-foreground font-normal">
              ({surfaceType === "green" ? "Green" : "Fairway"})
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Teach the app how this hole image maps to real-world GPS so the
            &ldquo;Use My Location&rdquo; button can drop pins exactly where you stand.
            Tap the same landmark on the hole image AND on the satellite map
            — the tee first, then the green flag.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-3">
          {(["p1", "p2"] as const).map((s, i) => {
            const Meta = STEP_META[s];
            const done = stepComplete(i);
            const active = step === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStep(s)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-2 justify-center ${
                  active
                    ? "bg-[#1B4332] text-white border-[#1B4332]"
                    : done
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-card text-muted-foreground border-border"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Meta.icon className="w-4 h-4" />
                )}
                Step {i + 1}: {Meta.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs font-medium bg-red-50 text-red-700 border border-red-200 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}
        {savedMsg && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            {savedMsg}
          </div>
        )}

        {/* Two-pane layout: hole image (top) + satellite map (bottom) */}
        <div className="grid gap-3">
          {/* HOLE IMAGE PANE */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                Hole image — tap the {stepIndex >= 0 ? STEP_META[step === "done" ? "p1" : (step as Exclude<Step, "done">)].label.toLowerCase() : "point"}
              </p>
              <span className="text-[10px] text-muted-foreground">
                {imagePicks.filter(Boolean).length}/2 picked
              </span>
            </div>
            <div
              ref={imageContainerRef}
              onClick={handleImageClick}
              className={`relative w-full aspect-[16/10] rounded-lg overflow-hidden border ${
                stepIndex >= 0
                  ? "border-[#B68D40] cursor-crosshair"
                  : "border-border"
              } bg-gradient-to-b from-green-50 to-green-100/50`}
            >
              {imgError ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <ImageIcon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">
                      Image not found
                    </p>
                  </div>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageSrc}
                  alt={`Hole ${holeNumber}`}
                  className="w-full h-full object-contain pointer-events-none"
                  onError={() => setImgError(true)}
                  draggable={false}
                />
              )}
              {/* Existing picks */}
              {imagePicks.map((pt, i) =>
                pt ? (
                  <div
                    key={i}
                    className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{
                      left: `${pt.x * 100}%`,
                      top: `${pt.y * 100}%`,
                    }}
                  >
                    <div
                      className={`w-5 h-5 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[10px] font-bold text-white ${
                        i === 0 ? "bg-[#1B4332]" : "bg-[#B68D40]"
                      }`}
                    >
                      {i + 1}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          </div>

          {/* SATELLITE MAP PANE */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                Satellite view — tap the same {stepIndex >= 0 ? STEP_META[step === "done" ? "p1" : (step as Exclude<Step, "done">)].label.toLowerCase() : "point"} here
              </p>
              <span className="text-[10px] text-muted-foreground">
                {mapPicks.filter(Boolean).length}/2 picked
              </span>
            </div>
            <div className="w-full h-64 sm:h-72 rounded-lg overflow-hidden border border-border">
              <GpsCalibrationMap
                center={mapCenter}
                picks={mapPicks.filter((p): p is [number, number] => !!p)}
                labels={["Tee", "Green Flag"]}
                activeIndex={stepIndex}
                onPickSet={handleMapPickSet}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 text-center">
              Tip: zoom in close on the course before tapping for the most
              accurate calibration.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 mt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={saving}
            className="text-muted-foreground"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Reset
          </Button>

          <div className="flex gap-2">
            {step === "p1" && (
              <Button
                type="button"
                onClick={() => setStep("p2")}
                disabled={!canContinue}
                className="bg-[#1B4332] hover:bg-[#2D6A4F]"
              >
                Next: Green Flag
              </Button>
            )}
            {step === "p2" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("p1")}
                  disabled={saving}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave || saving}
                  className="bg-[#1B4332] hover:bg-[#2D6A4F] gap-2"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Save Calibration
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
