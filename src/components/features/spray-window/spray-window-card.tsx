"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Droplets, ChevronRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RISK_LEVEL_CONFIG } from "@/lib/utils/disease-models";

interface SprayWindowData {
  disease_pressure: number;
  risk_level: keyof typeof RISK_LEVEL_CONFIG;
  windows: {
    start: string;
    end: string;
    score: number;
    risk_level: string;
  }[];
}

function formatWindowTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatWindowDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Compact spray-window card for the dashboard.
 * Only renders when disease pressure >= 0.2 (moderate+).
 */
export function SprayWindowCard() {
  const [data, setData] = useState<SprayWindowData | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/spray-window", {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return;
        const json: SprayWindowData = await res.json();
        // Only show card when disease pressure is moderate+
        if (json.disease_pressure >= 0.2) {
          setData(json);
        }
      } catch {
        // Silently fail — this is a non-critical card
      }
    }
    load();
  }, []);

  if (!data || data.windows.length === 0) return null;

  const nextWindow = data.windows[0];
  const riskConfig = RISK_LEVEL_CONFIG[data.risk_level] || RISK_LEVEL_CONFIG.low;

  return (
    <Link
      href="/spray-window"
      className="gk-card p-4 group hover:border-primary/20 active:bg-muted/20 transition-all block"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Droplets className="w-4 h-4" />
          <span className="text-xs font-medium uppercase tracking-wider">
            Spray Window
          </span>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/0 group-hover:text-muted-foreground transition-all" />
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <Clock className="w-3.5 h-3.5 text-primary" />
        <span className="text-sm font-semibold">
          {formatWindowDay(nextWindow.start)}{" "}
          {formatWindowTime(nextWindow.start)}-{formatWindowTime(nextWindow.end)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Dollar spot risk:</span>
        <Badge className={`text-[10px] ${riskConfig.color}`}>
          {riskConfig.label}
        </Badge>
      </div>
    </Link>
  );
}
