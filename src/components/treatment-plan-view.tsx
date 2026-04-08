"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Calendar,
  Shield,
  Leaf,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Beaker,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DiagnosisResult } from "@/types/database";

const severityColors: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  2: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  3: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  4: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  5: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
};

export default function TreatmentPlanView({ data }: { data: DiagnosisResult }) {
  const [expanded, setExpanded] = useState(false);
  const diag = data.diagnosis;
  const treat = data.treatment;
  const sev = severityColors[diag?.severity] || severityColors[3];

  if (!diag || !treat) return null;

  return (
    <div className="space-y-3">
      {/* Diagnosis Summary Card */}
      <div className={`rounded-xl border ${sev.border} ${sev.bg} p-3`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${sev.text}`}>
              {diag.condition}
            </p>
            {diag.scientific_name && (
              <p className={`text-xs italic ${sev.text} opacity-70`}>
                {diag.scientific_name}
              </p>
            )}
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Badge className={`text-[10px] ${sev.bg} ${sev.text} border ${sev.border}`}>
              {diag.severity_label}
            </Badge>
            <Badge
              variant="outline"
              className={`text-[10px] ${
                diag.confidence === "high"
                  ? "border-green-300 text-green-700"
                  : diag.confidence === "medium"
                  ? "border-amber-300 text-amber-700"
                  : "border-red-300 text-red-700"
              }`}
            >
              {diag.confidence} confidence
            </Badge>
          </div>
        </div>
        {diag.confidence_reason && (
          <p className="text-xs text-muted-foreground mt-1.5">{diag.confidence_reason}</p>
        )}
      </div>

      {/* Expand/Collapse for Treatment Details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <FlaskConical className="w-4 h-4 text-emerald-600" />
          Treatment Plan
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* Products */}
          {treat.products && treat.products.length > 0 && (
            <div className="rounded-xl border border-border p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Beaker className="w-3.5 h-3.5" />
                Recommended Products
              </p>
              {treat.products.map((product, i) => (
                <div key={i} className="bg-muted/30 rounded-lg p-2.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium flex-1">{product.name}</p>
                    {product.in_inventory ? (
                      <Badge className="text-[10px] bg-green-50 text-green-700 border border-green-200">
                        <CheckCircle2 className="w-3 h-3 mr-0.5" />
                        In Stock
                      </Badge>
                    ) : (
                      <Badge className="text-[10px] bg-red-50 text-red-700 border border-red-200">
                        Not in Stock
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {product.active_ingredient} · {product.type}
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                    <span className="text-muted-foreground">Rate:</span>
                    <span>{product.application_rate}</span>
                    <span className="text-muted-foreground">Per acre:</span>
                    <span>{product.rate_per_acre}</span>
                    <span className="text-muted-foreground">Water:</span>
                    <span>{product.water_volume}</span>
                    <span className="text-muted-foreground">Method:</span>
                    <span className="capitalize">{product.method}</span>
                    <span className="text-muted-foreground">REI:</span>
                    <span>{product.rei_hours} hours</span>
                  </div>
                  {product.timing && (
                    <p className="text-xs text-muted-foreground">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {product.timing}
                    </p>
                  )}
                  {!product.in_inventory && product.alternative_products?.length > 0 && (
                    <p className="text-xs text-amber-600">
                      Alternatives: {product.alternative_products.join(", ")}
                    </p>
                  )}
                  {product.precautions?.length > 0 && (
                    <div className="text-xs text-red-600 flex items-start gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>{product.precautions.join(". ")}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Application Window */}
          {treat.application_window && (
            <div className="rounded-xl border border-border p-3 space-y-1.5">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Best Application Window
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground">Best date:</span>
                <span>{treat.application_window.best_date}</span>
                <span className="text-muted-foreground">Best time:</span>
                <span>{treat.application_window.best_time}</span>
                <span className="text-muted-foreground">Temp range:</span>
                <span>{treat.application_window.ideal_temp_range}</span>
                <span className="text-muted-foreground">Max wind:</span>
                <span>{treat.application_window.max_wind}</span>
                <span className="text-muted-foreground">Rain buffer:</span>
                <span>{treat.application_window.rain_buffer}</span>
              </div>
            </div>
          )}

          {/* Follow-up Schedule */}
          {treat.follow_up && treat.follow_up.length > 0 && (
            <div className="rounded-xl border border-border p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Follow-up Schedule
              </p>
              {treat.follow_up.map((fu, i) => (
                <div key={i} className="flex gap-3 text-xs">
                  <div className="shrink-0 w-14 text-right">
                    <Badge variant="outline" className="text-[10px]">
                      Day {fu.days_after}
                    </Badge>
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <p className="font-medium">{fu.action}</p>
                    <p className="text-muted-foreground">Look for: {fu.what_to_look_for}</p>
                    {fu.if_no_improvement && (
                      <p className="text-amber-600">If no improvement: {fu.if_no_improvement}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Prevention */}
          {data.prevention && data.prevention.length > 0 && (
            <div className="rounded-xl border border-border p-3 space-y-1.5">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                Prevention
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                {data.prevention.map((p, i) => (
                  <li key={i} className="flex gap-2">
                    <Leaf className="w-3 h-3 shrink-0 mt-0.5 text-emerald-500" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Differential Diagnosis */}
          {diag.differential && diag.differential.length > 0 && (
            <div className="rounded-xl border border-border p-3 space-y-1.5">
              <p className="text-xs font-semibold text-foreground">Other Possibilities</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                {diag.differential.map((d, i) => (
                  <li key={i}>• {d}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Lab test recommendation */}
          {data.lab_test_recommended && (
            <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              <FlaskConical className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Lab confirmation recommended</p>
                {data.extension_contact && (
                  <p className="text-blue-600 mt-0.5">{data.extension_contact}</p>
                )}
              </div>
            </div>
          )}

          {/* Additional notes */}
          {data.additional_notes && (
            <p className="text-xs text-muted-foreground px-1">{data.additional_notes}</p>
          )}
        </div>
      )}
    </div>
  );
}
