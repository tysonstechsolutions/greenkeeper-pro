"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Cpu, Cloud, WifiOff, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { classifyTurfImage } from "@/lib/ai/ondevice-classifier";
import type {
  ClassificationResult,
  ClassificationPrediction,
  SmartDiagnosisProps,
} from "@/lib/ai/classifier-types";

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: ClassificationResult["source"] }) {
  switch (source) {
    case "on-device":
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">
          <Cpu className="w-3 h-3 mr-1" />
          On-device
        </Badge>
      );
    case "cloud":
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
          <Cloud className="w-3 h-3 mr-1" />
          Cloud AI
        </Badge>
      );
    case "fallback":
      return (
        <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 text-[10px]">
          <WifiOff className="w-3 h-3 mr-1" />
          Offline
        </Badge>
      );
  }
}

// ── Confidence bar ───────────────────────────────────────────────────────────

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-red-400";

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-9 text-right font-mono">
        {pct}%
      </span>
    </div>
  );
}

// ── Prediction card ──────────────────────────────────────────────────────────

function PredictionCard({
  prediction,
  rank,
  onSelect,
}: {
  prediction: ClassificationPrediction;
  rank: number;
  onSelect?: () => void;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        rank === 1 ? "border-[#1B4332]/30 bg-[#1B4332]/5" : "border-border bg-background"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-sm leading-tight ${rank === 1 ? "text-[#1B4332]" : ""}`}>
            {rank === 1 && <span className="mr-1">1.</span>}
            {rank > 1 && <span className="mr-1 text-muted-foreground">{rank}.</span>}
            {prediction.displayName}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {prediction.description}
          </p>
        </div>
        {rank === 1 && onSelect && (
          <Button
            size="sm"
            variant="default"
            className="shrink-0 h-7 text-xs bg-[#1B4332] hover:bg-[#2D6A4F]"
            onClick={onSelect}
          >
            Use this
          </Button>
        )}
      </div>
      <ConfidenceBar confidence={prediction.confidence} />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function SmartDiagnosis({ imageBase64, onDiagnosisSelect }: SmartDiagnosisProps) {
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const classify = useCallback(async (base64: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const classResult = await classifyTurfImage(base64);
      setResult(classResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classification failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (imageBase64) {
      classify(imageBase64);
    } else {
      setResult(null);
      setError(null);
    }
  }, [imageBase64, classify]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
        <Loader2 className="w-5 h-5 animate-spin text-[#1B4332]" />
        <div>
          <p className="text-sm font-medium">Analyzing turf condition...</p>
          <p className="text-xs text-muted-foreground">Identifying potential issues</p>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
        Classification failed: {error}
      </div>
    );
  }

  // ── No result yet ──
  if (!result) return null;

  // Get top predictions (top 1 always, 2nd/3rd if confidence > 10%)
  const topPrediction = result.predictions[0];
  const secondaryPredictions = result.predictions
    .slice(1, 3)
    .filter((p) => p.confidence > 0.1);

  const handleSelect = () => {
    if (onDiagnosisSelect && topPrediction) {
      onDiagnosisSelect({
        className: topPrediction.className,
        displayName: topPrediction.displayName,
        confidence: topPrediction.confidence,
      });
    }
  };

  return (
    <div className="space-y-2">
      {/* Header with source badge and timing */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Smart Diagnosis
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {result.processingTimeMs}ms
          </span>
          <SourceBadge source={result.source} />
        </div>
      </div>

      {/* Top prediction */}
      {topPrediction && (
        <PredictionCard
          prediction={topPrediction}
          rank={1}
          onSelect={onDiagnosisSelect ? handleSelect : undefined}
        />
      )}

      {/* Secondary predictions */}
      {secondaryPredictions.length > 0 && (
        <>
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showAll ? "Hide" : "Show"} other possibilities
          </button>
          {showAll &&
            secondaryPredictions.map((pred, i) => (
              <PredictionCard key={pred.classId} prediction={pred} rank={i + 2} />
            ))}
        </>
      )}
    </div>
  );
}
