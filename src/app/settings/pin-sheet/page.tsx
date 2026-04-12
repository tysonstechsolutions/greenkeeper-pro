"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Flag, Loader2, Save, Printer, Check, AlertCircle } from "lucide-react";
import { RoleGuard, STAFF_ROLES } from "@/components/auth/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  usePinPositions,
  todayIso,
  type CreatePinInput,
} from "@/lib/hooks/usePinPositions";
import { PinPlacement } from "@/components/features/pin-sheet/pin-placement";

// Staff only (NOT seasonal, NOT pro)
const PIN_EDIT_ROLES = STAFF_ROLES.filter(
  (r) => r !== "seasonal" && r !== "pro"
);

interface PinDraft {
  hole_number: number;
  paces_from_front: number;
  paces_from_left: number;
  difficulty: "" | "easy" | "medium" | "hard";
  notes: string;
}

function blankDrafts(): PinDraft[] {
  return Array.from({ length: 18 }, (_, i) => ({
    hole_number: i + 1,
    paces_from_front: 15,
    paces_from_left: 15,
    difficulty: "",
    notes: "",
  }));
}

function PinSheetEditor() {
  const { profile } = useAuth();
  const { fetchPinsByDate, setBulkPins, loading } = usePinPositions();

  const [date, setDate] = useState<string>(todayIso());
  const [drafts, setDrafts] = useState<PinDraft[]>(blankDrafts());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadDate = useCallback(
    async (d: string) => {
      const rows = await fetchPinsByDate(d);
      const nextDrafts = blankDrafts();
      for (const row of rows) {
        const idx = row.hole_number - 1;
        if (idx < 0 || idx > 17) continue;
        nextDrafts[idx] = {
          hole_number: row.hole_number,
          paces_from_front: row.paces_from_front,
          paces_from_left: row.paces_from_left,
          difficulty: (row.difficulty as PinDraft["difficulty"]) || "",
          notes: row.notes || "",
        };
      }
      setDrafts(nextDrafts);
    },
    [fetchPinsByDate]
  );

  useEffect(() => {
    loadDate(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const updateDraft = (idx: number, patch: Partial<PinDraft>) => {
    setDrafts((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setMessage(null);

    const payload: CreatePinInput[] = drafts.map((d) => ({
      date,
      hole_number: d.hole_number,
      paces_from_front: Number(d.paces_from_front) || 0,
      paces_from_left: Number(d.paces_from_left) || 0,
      difficulty: d.difficulty === "" ? null : d.difficulty,
      notes: d.notes || null,
      set_by: profile?.id ?? null,
    }));

    const ok = await setBulkPins(payload);
    setSaving(false);

    if (ok) {
      setMessage({ type: "success", text: "Pin sheet saved." });
      setTimeout(() => setMessage(null), 3000);
    } else {
      setMessage({
        type: "error",
        text: "Failed to save pin sheet. Check required fields and try again.",
      });
    }
  };

  const printUrl = `/api/reports/pin-sheet?date=${encodeURIComponent(date)}`;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/settings"
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flag className="w-6 h-6 text-primary" />
            Daily Pin Sheet
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set today&apos;s hole locations for the pro shop.
          </p>
        </div>
      </div>

      {/* Date + actions */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-sm font-medium">Date:</label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto"
        />
        <div className="flex-1" />
        <Button onClick={handleSaveAll} disabled={saving || loading}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-1" />
              Save all
            </>
          )}
        </Button>
        <a href={printUrl} target="_blank" rel="noreferrer">
          <Button variant="outline">
            <Printer className="w-4 h-4 mr-1" />
            Print pin sheet PDF
          </Button>
        </a>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-sm mb-4 ${
            message.type === "success"
              ? "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {message.type === "success" ? (
            <Check className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {drafts.map((d, idx) => (
            <div
              key={d.hole_number}
              className="bg-card rounded-xl border border-border shadow-sm p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {d.hole_number}
                  </div>
                  <span className="font-semibold">Hole {d.hole_number}</span>
                </div>
                <PinPlacement
                  pacesFromFront={Number(d.paces_from_front) || 0}
                  pacesFromLeft={Number(d.paces_from_left) || 0}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Paces from front (0-50)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    value={d.paces_from_front}
                    onChange={(e) =>
                      updateDraft(idx, { paces_from_front: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Paces from left (0-40)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={40}
                    value={d.paces_from_left}
                    onChange={(e) =>
                      updateDraft(idx, { paces_from_left: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <label className="text-xs text-muted-foreground block mb-1">
                Difficulty
              </label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mb-2"
                value={d.difficulty}
                onChange={(e) =>
                  updateDraft(idx, {
                    difficulty: e.target.value as PinDraft["difficulty"],
                  })
                }
              >
                <option value="">—</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>

              <label className="text-xs text-muted-foreground block mb-1">
                Notes
              </label>
              <Textarea
                rows={2}
                placeholder="Optional"
                value={d.notes}
                onChange={(e) => updateDraft(idx, { notes: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PinSheetPage() {
  return (
    <RoleGuard allowedRoles={PIN_EDIT_ROLES}>
      <PinSheetEditor />
    </RoleGuard>
  );
}
