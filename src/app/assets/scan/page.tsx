"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ScanLine,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  Loader2,
  X,
  Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import {
  fy26AssetStatusLabels,
  fy26AssetStatusColors,
  type Fy26Asset,
  type Fy26AssetStatus,
} from "@/types/fy26-assets";

// Dynamically import html5-qrcode only on client to avoid SSR issues.
let Html5Qrcode: typeof import("html5-qrcode").Html5Qrcode | null = null;

/**
 * Asset barcode / serial scanner page.
 *
 * Workflow: scan barcode (or type serial#) → auto-search fy26_assets
 * → show match → one-tap mark Present.
 */
export default function AssetScanPage() {
  const router = useRouter();
  const supabase = createClient();

  const [scanning, setScanning] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [match, setMatch] = useState<Fy26Asset | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scannerRef = useRef<InstanceType<
    typeof import("html5-qrcode").Html5Qrcode
  > | null>(null);
  const scanContainerRef = useRef<HTMLDivElement>(null);

  // ── Lookup logic ──────────────────────────────────────────────────────

  const lookupAsset = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      setSearching(true);
      setMatch(null);
      setMatchError(null);

      try {
        // 1. Try exact barcode match first (fastest, most reliable).
        //    NOTE: capture the error — previously it was swallowed,
        //    which hid real DB failures behind a misleading "no match".
        const { data: barcodeHit, error: barcodeErr } = await supabase
          .from("fy26_assets")
          .select("*")
          .eq("barcode_value", trimmed)
          .maybeSingle();

        if (barcodeErr) {
          setMatchError(`Lookup failed: ${barcodeErr.message}`);
          return;
        }

        if (barcodeHit) {
          setMatch(barcodeHit as Fy26Asset);
          return;
        }

        // 2. Fall back to fuzzy search on serial / asset # / description / model.
        //    Sanitize the term — commas, parentheses, asterisks break
        //    PostgREST's .or() filter parser and cause 400 errors.
        const safe = trimmed.replace(/[,()%*]/g, " ").trim();
        if (!safe) {
          setMatchError(`No asset matching "${trimmed}"`);
          return;
        }

        const term = `%${safe}%`;
        const { data, error } = await supabase
          .from("fy26_assets")
          .select("*")
          .or(
            `serial_number.ilike.${term},asset_number.ilike.${term},description.ilike.${term},model_text.ilike.${term}`
          )
          .limit(1)
          .maybeSingle();

        if (error) {
          setMatchError(`Search failed: ${error.message}`);
          return;
        }
        if (!data) {
          setMatchError(`No asset found matching "${trimmed}"`);
          return;
        }
        setMatch(data as Fy26Asset);
      } catch (err) {
        setMatchError(
          err instanceof Error
            ? `Search failed: ${err.message}`
            : "Search failed — check connection."
        );
      } finally {
        setSearching(false);
      }
    },
    [supabase]
  );

  // ── Mark asset present ────────────────────────────────────────────────

  const markPresent = async () => {
    if (!match) return;
    setUpdating(true);
    try {
      const { data, error } = await supabase
        .from("fy26_assets")
        .update({
          status: "verified_present" as Fy26AssetStatus,
          verified_at: new Date().toISOString(),
        })
        .eq("id", match.id)
        .select()
        .single();

      if (error) throw error;
      setMatch(data as Fy26Asset);
    } catch {
      // Non-fatal: show as already-present or offline
    } finally {
      setUpdating(false);
    }
  };

  // ── Camera scanner lifecycle ──────────────────────────────────────────

  const startScanner = useCallback(async () => {
    if (scanning) return;
    setCameraError(null);

    try {
      // Dynamic import so SSR doesn't fail
      if (!Html5Qrcode) {
        const mod = await import("html5-qrcode");
        Html5Qrcode = mod.Html5Qrcode;
      }

      const containerId = "scanner-viewport";
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 280, height: 120 },
          aspectRatio: 2.0,
        },
        (decodedText) => {
          // Stop scanning on first successful decode
          scanner
            .stop()
            .then(() => {
              setScanning(false);
              lookupAsset(decodedText);
            })
            .catch(() => {
              /* ignore */
            });
        },
        () => {
          /* ignore per-frame failures */
        }
      );
      setScanning(true);
    } catch (err) {
      console.error("Camera start error:", err);
      setCameraError(
        "Could not access camera. Make sure you granted camera permission, or use manual entry."
      );
    }
  }, [scanning, lookupAsset]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        /* already stopped */
      }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  // ── Manual entry submit ───────────────────────────────────────────────

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    lookupAsset(manualInput);
  };

  // ── Render ────────────────────────────────────────────────────────────

  const statusColor = match
    ? fy26AssetStatusColors[match.status]
    : undefined;

  return (
    <div className="p-4 md:p-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/assets")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Scan Asset</h1>
          <p className="text-xs text-muted-foreground">
            Scan barcode or type serial / asset #
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={!manualMode ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setManualMode(false);
            setMatch(null);
            setMatchError(null);
          }}
        >
          <ScanLine className="w-4 h-4 mr-1.5" />
          Camera
        </Button>
        <Button
          variant={manualMode ? "default" : "outline"}
          size="sm"
          onClick={() => {
            stopScanner();
            setManualMode(true);
            setMatch(null);
            setMatchError(null);
          }}
        >
          <Keyboard className="w-4 h-4 mr-1.5" />
          Manual
        </Button>
      </div>

      {/* Camera scanner */}
      {!manualMode && (
        <div className="mb-4">
          <div
            id="scanner-viewport"
            ref={scanContainerRef}
            className="rounded-xl overflow-hidden bg-black min-h-[220px] relative"
          />
          {cameraError && (
            <p className="text-sm text-red-500 mt-2">{cameraError}</p>
          )}
          <div className="flex gap-2 mt-3">
            {!scanning ? (
              <Button onClick={startScanner} className="flex-1">
                <ScanLine className="w-4 h-4 mr-2" />
                Start scanning
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={stopScanner}
                className="flex-1"
              >
                <X className="w-4 h-4 mr-2" />
                Stop
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Manual entry */}
      {manualMode && (
        <form onSubmit={handleManualSubmit} className="flex gap-2 mb-4">
          <Input
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Serial #, asset #, or description..."
            autoFocus
          />
          <Button type="submit" disabled={searching || !manualInput.trim()}>
            {searching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Search"
            )}
          </Button>
        </form>
      )}

      {/* Searching indicator */}
      {searching && (
        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Searching inventory...</span>
        </div>
      )}

      {/* No match */}
      {matchError && !searching && (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-600 dark:text-red-400">
              {matchError}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setMatchError(null);
                if (manualMode) setManualInput("");
              }}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Match found */}
      {match && !searching && (
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h2 className="font-semibold text-base">
                  {match.description}
                </h2>
                <p className="text-xs text-muted-foreground font-mono">
                  Asset #{match.asset_number}
                  {match.sub_number &&
                    match.sub_number !== "0" &&
                    ` / sub ${match.sub_number}`}
                </p>
              </div>
              <Badge
                variant="outline"
                style={{
                  backgroundColor: `${statusColor}15`,
                  borderColor: statusColor,
                  color: statusColor,
                }}
              >
                {fy26AssetStatusLabels[match.status]}
              </Badge>
            </div>

            <div className="space-y-1 text-xs text-muted-foreground mb-4">
              {match.serial_number && (
                <p>
                  <span className="font-semibold">SN:</span>{" "}
                  <span className="font-mono">{match.serial_number}</span>
                </p>
              )}
              {match.manufacturer && (
                <p>
                  <span className="font-semibold">Manufacturer:</span>{" "}
                  {match.manufacturer}
                </p>
              )}
              {match.model_text && (
                <p>
                  <span className="font-semibold">Model:</span>{" "}
                  {match.model_text}
                </p>
              )}
              <p>
                <span className="font-semibold">Site:</span> {match.site}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              {match.status !== "verified_present" ? (
                <Button
                  onClick={markPresent}
                  disabled={updating}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {updating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Mark Present
                </Button>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-2 py-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-semibold">Verified Present</span>
                </div>
              )}
              <Button
                variant="outline"
                onClick={() => router.push(`/assets/${match.id}`)}
              >
                Details
              </Button>
            </div>

            {/* Scan next */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-3 text-muted-foreground"
              onClick={() => {
                setMatch(null);
                setMatchError(null);
                setManualInput("");
                if (!manualMode) startScanner();
              }}
            >
              <ScanLine className="w-4 h-4 mr-1.5" />
              Scan next
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
