"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { callApi } from "@/lib/api/client";
import { Overlay } from "./overlay";
import type { ProShopShift, ProShopStaff, ShiftGroup } from "@/lib/pro-shop/types";
import { compactTime, hhmm, shortDate, summarizeWeekly } from "@/lib/pro-shop/schedule-engine";
import type { ShiftInput } from "@/lib/pro-shop/use-pro-shop";

const selectCls = "w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm";

interface Addition {
  staffName: string;
  group: ShiftGroup;
  start: string;
  end: string;
  note?: string;
}

export function CoverSheet({
  date,
  staff,
  dayShifts,
  defaultOffStaffId,
  deleteShift,
  addShift,
  addTimeOff,
  onClose,
}: {
  date: string;
  staff: ProShopStaff[];
  dayShifts: ProShopShift[];
  defaultOffStaffId?: string;
  deleteShift: (id: string) => Promise<void>;
  addShift: (input: ShiftInput) => Promise<void>;
  addTimeOff: (staffId: string, start: string, end: string, reason: string) => Promise<void>;
  onClose: () => void;
}) {
  // People who have a shift that day are the likely candidates to drop out.
  const working = useMemo(
    () => staff.filter((s) => dayShifts.some((sh) => sh.staff_id === s.id)),
    [staff, dayShifts],
  );
  const [offStaffId, setOffStaffId] = useState(defaultOffStaffId ?? working[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [markOff, setMarkOff] = useState(true);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [additions, setAdditions] = useState<Addition[] | null>(null);
  const [include, setInclude] = useState<boolean[]>([]);

  const offStaff = staff.find((s) => s.id === offStaffId) ?? null;
  const offShifts = dayShifts.filter((sh) => sh.staff_id === offStaffId);

  function resolveStaff(name: string): ProShopStaff | null {
    const n = name.trim().toLowerCase();
    return (
      staff.find((s) => s.full_name.toLowerCase() === n) ||
      staff.find((s) => s.full_name.toLowerCase().startsWith(n)) ||
      staff.find((s) => s.full_name.split(" ")[0].toLowerCase() === n.split(" ")[0]) ||
      null
    );
  }

  async function findCover() {
    if (!offStaff) return;
    setBusy(true);
    setError(null);
    setAdditions(null);
    setExplanation(null);
    try {
      const roster = staff
        .filter((s) => s.is_active && s.id !== offStaffId)
        .map((s) => {
          const theirShift = dayShifts.find((sh) => sh.staff_id === s.id);
          return {
            name: s.full_name,
            homeArea: s.default_group,
            flex: s.flex,
            canCoverAnyArea: s.flex,
            usualAvailability: summarizeWeekly(s),
            alreadyWorkingToday: theirShift
              ? `${hhmm(theirShift.start_time)}-${hhmm(theirShift.end_time)} ${theirShift.group}`
              : "no",
          };
        });
      const res = await callApi<{ explanation: string; additions: Addition[] }>("pro-shop-ai", {
        method: "POST",
        body: {
          action: "cover_change",
          date,
          offName: offStaff.full_name,
          reason,
          dayShifts: offShifts.map((sh) => ({
            staffName: offStaff.full_name,
            group: sh.group,
            start: hhmm(sh.start_time),
            end: hhmm(sh.end_time),
          })),
          roster,
        },
      });
      const adds = Array.isArray(res.additions) ? res.additions : [];
      setAdditions(adds);
      setInclude(adds.map(() => true));
      setExplanation(res.explanation ?? null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't reach the AI. You can cover the shift manually.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!offStaff) return;
    setApplying(true);
    setError(null);
    try {
      // 1. Remove the off person's shifts for this day.
      for (const sh of offShifts) await deleteShift(sh.id);
      // 2. Optionally record the time off.
      if (markOff) await addTimeOff(offStaffId, date, date, reason || "Day off");
      // 3. Add the selected cover shifts.
      if (additions) {
        for (let i = 0; i < additions.length; i++) {
          if (!include[i]) continue;
          const a = additions[i];
          const target = resolveStaff(a.staffName);
          if (!target) continue;
          await addShift({
            staff_id: target.id,
            shift_date: date,
            group: a.group ?? target.default_group,
            start_time: a.start,
            end_time: a.end,
            note: a.note ?? `Covering for ${offStaff.full_name}`,
            source: "ai",
          });
        }
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply the changes.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Overlay title={`Day off / cover — ${shortDate(date)}`} onClose={onClose}>
      <div className="p-4 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Who needs off?</Label>
          <select value={offStaffId} onChange={(e) => setOffStaffId(e.target.value)} className={selectCls}>
            {working.length === 0 && <option value="">No one is scheduled this day</option>}
            {working.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
            {/* allow picking anyone, even if not currently scheduled */}
            {staff
              .filter((s) => !working.some((w) => w.id === s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
          </select>
        </div>

        {offShifts.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Dropping:{" "}
            {offShifts
              .map((sh) => `${compactTime(sh.start_time)}-${compactTime(sh.end_time)} (${sh.group})`)
              .join(", ")}
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Reason (optional)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. doctor's appointment" />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={markOff} onChange={(e) => setMarkOff(e.target.checked)} className="w-4 h-4" />
          Mark {offStaff?.full_name.split(" ")[0] ?? "them"} off for this day
        </label>

        <Button className="w-full gap-1.5" variant="outline" onClick={findCover} disabled={busy || !offStaffId}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Find the best cover with AI
        </Button>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {additions && (
          <div className="rounded-xl border border-border p-3 space-y-2">
            {explanation && <p className="text-sm">{explanation}</p>}
            {additions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No automatic cover suggested. Close this and add a shift by hand if needed.
              </p>
            ) : (
              <div className="space-y-1.5">
                {additions.map((a, i) => (
                  <label key={i} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={include[i] ?? false}
                      onChange={(e) =>
                        setInclude((arr) => arr.map((v, j) => (j === i ? e.target.checked : v)))
                      }
                      className="w-4 h-4"
                    />
                    <span>
                      <span className="font-medium">{a.staffName}</span>{" "}
                      {compactTime(a.start)}-{compactTime(a.end)}{" "}
                      <span className="text-xs text-muted-foreground">({a.group})</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button
            className="flex-1 gap-1.5 bg-[#1B4332] hover:bg-[#2D6A4F]"
            onClick={apply}
            disabled={applying || !offStaffId}
          >
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
            Apply
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
