"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ListChecks,
  Printer,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Sun,
  Moon,
  Users,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Overlay } from "@/components/features/pro-shop/overlay";
import {
  useProShopDuties,
  type DutyInput,
} from "@/lib/pro-shop/use-pro-shop-duties";
import {
  dutyDayFlags,
  summarizeDutyDays,
  buildDutiesPrintHtml,
} from "@/lib/pro-shop/duties";
import { printHtml } from "@/lib/utils/pdf-export";
import {
  WEEKDAY_KEYS,
  type DutyArea,
  type ProShopDuty,
  type WeekdayKey,
} from "@/lib/pro-shop/types";

const DAY_INITIAL: Record<WeekdayKey, string> = {
  sun: "S",
  mon: "M",
  tue: "T",
  wed: "W",
  thu: "T",
  fri: "F",
  sat: "S",
};

const AREA_CHOICES: { value: DutyArea; label: string }[] = [
  { value: "outside", label: "Rec Aids (Outside)" },
  { value: "inside", label: "Golf Ops (Inside)" },
  { value: "both", label: "Both" },
];

/** Compact S M T W T F S strip with the duty's days filled in. */
function DayDots({ days }: { days: WeekdayKey[] }) {
  const flags = dutyDayFlags(days);
  return (
    <div className="flex gap-1">
      {WEEKDAY_KEYS.map((k, i) => (
        <span
          key={k}
          className={`w-5 h-5 rounded-full text-[10px] font-medium flex items-center justify-center ${
            flags[i]
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground/50"
          }`}
          title={k}
        >
          {DAY_INITIAL[k]}
        </span>
      ))}
    </div>
  );
}

function sectionIcon(key: string) {
  if (key === "outside") return <Sun className="w-4 h-4 text-amber-500" />;
  if (key === "inside") return <Moon className="w-4 h-4 text-indigo-500" />;
  if (key === "both") return <Users className="w-4 h-4 text-sky-500" />;
  return <User className="w-4 h-4 text-muted-foreground" />;
}

export default function ProShopDutiesPage() {
  const d = useProShopDuties();
  const [editing, setEditing] = useState<
    { mode: "new" } | { mode: "edit"; duty: ProShopDuty } | null
  >(null);

  function handlePrint() {
    printHtml(buildDutiesPrintHtml(d.sections), "Pro Shop Duties", {
      heading: "Pro Shop Duties",
      subtitle: `Generated ${new Date().toLocaleDateString()}`,
    });
  }

  return (
    <div className="p-3 md:p-6 pb-28 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/pro-shop-schedule"
            className="p-1.5 rounded-lg hover:bg-muted shrink-0"
            aria-label="Back to schedule"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <ListChecks className="w-6 h-6 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight truncate">Pro Shop Duties</h1>
            <p className="text-xs text-muted-foreground">Standing daily tasks for the pro-shop jobs</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handlePrint}
            disabled={d.sections.length === 0}
          >
            <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Print</span>
          </Button>
          <Button size="sm" className="gap-1.5 bg-[#1B4332] hover:bg-[#2D6A4F]" onClick={() => setEditing({ mode: "new" })}>
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add duty</span>
          </Button>
        </div>
      </div>

      {d.error && (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{d.error}</div>
      )}

      {d.loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : d.sections.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <ListChecks className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-50" />
          <p className="text-sm font-medium">No duties yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Add recurring tasks like &quot;Vacuum&quot; or &quot;Graduation table up Wednesday.&quot;
          </p>
          <Button size="sm" className="gap-1.5" onClick={() => setEditing({ mode: "new" })}>
            <Plus className="w-4 h-4" /> Add the first duty
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {d.sections.map((sec) => (
            <section key={sec.key}>
              <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                {sectionIcon(sec.key)} {sec.label}
              </h2>
              <div className="space-y-1.5">
                {sec.duties.map((duty) => (
                  <div
                    key={duty.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{duty.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <DayDots days={duty.days} />
                        <span className="text-[11px] text-muted-foreground">{summarizeDutyDays(duty.days)}</span>
                      </div>
                      {duty.note && <p className="text-[11px] text-muted-foreground mt-1">{duty.note}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditing({ mode: "edit", duty })}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label="Edit duty"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => d.deleteDuty(duty.id)}
                      className="shrink-0 text-muted-foreground hover:text-red-500"
                      aria-label="Delete duty"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <DutyEditor
          state={editing}
          staff={d.activeStaff}
          onClose={() => setEditing(null)}
          addDuty={d.addDuty}
          updateDuty={d.updateDuty}
          deleteDuty={d.deleteDuty}
        />
      )}
    </div>
  );
}

function DutyEditor({
  state,
  staff,
  onClose,
  addDuty,
  updateDuty,
  deleteDuty,
}: {
  state: { mode: "new" } | { mode: "edit"; duty: ProShopDuty };
  staff: { id: string; full_name: string }[];
  onClose: () => void;
  addDuty: (input: DutyInput) => Promise<void>;
  updateDuty: (id: string, patch: Partial<ProShopDuty>) => Promise<void>;
  deleteDuty: (id: string) => Promise<void>;
}) {
  const existing = state.mode === "edit" ? state.duty : null;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [assignKind, setAssignKind] = useState<"area" | "person">(
    existing?.staff_id ? "person" : "area",
  );
  const [area, setArea] = useState<DutyArea>((existing?.area as DutyArea) ?? "outside");
  const [staffId, setStaffId] = useState<string>(existing?.staff_id ?? "");
  const [days, setDays] = useState<WeekdayKey[]>(existing?.days ?? []);
  const [note, setNote] = useState(existing?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggleDay = (k: WeekdayKey) =>
    setDays((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  const allSet = days.length === 7;
  const toggleDaily = () => setDays(allSet ? [] : [...WEEKDAY_KEYS]);

  async function save() {
    setErr(null);
    if (!title.trim()) return setErr("Add a title.");
    if (assignKind === "person" && !staffId) return setErr("Pick a person.");
    if (days.length === 0) return setErr("Pick at least one day.");
    setBusy(true);
    try {
      if (existing) {
        await updateDuty(existing.id, {
          title: title.trim(),
          area: assignKind === "area" ? area : null,
          staff_id: assignKind === "person" ? staffId : null,
          days,
          note: note.trim() || null,
        });
      } else {
        await addDuty({
          title: title.trim(),
          area: assignKind === "area" ? area : null,
          staffId: assignKind === "person" ? staffId : null,
          days,
          note: note.trim() || null,
        });
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save the duty.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    try {
      await deleteDuty(existing.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay title={existing ? "Edit duty" : "Add duty"} onClose={onClose}>
      <div className="p-4 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Duty</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Vacuum pro shop"
            autoFocus
          />
        </div>

        {/* Assign to */}
        <div className="space-y-1.5">
          <Label className="text-xs">Assign to</Label>
          <div className="flex gap-2">
            {(["area", "person"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setAssignKind(k)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                  assignKind === k
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                {k === "area" ? "An area / role" : "A person"}
              </button>
            ))}
          </div>
          {assignKind === "area" ? (
            <div className="flex gap-2 pt-1">
              {AREA_CHOICES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setArea(c.value)}
                  className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium border transition ${
                    area === c.value
                      ? "bg-primary/10 text-primary border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : (
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm mt-1"
            >
              <option value="">— Select a person —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Days */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Days</Label>
            <button
              type="button"
              onClick={toggleDaily}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${
                allSet ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
              }`}
            >
              Daily
            </button>
          </div>
          <div className="flex gap-1.5">
            {WEEKDAY_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => toggleDay(k)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium border transition ${
                  days.includes(k)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                {DAY_INITIAL[k]}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="space-y-1.5">
          <Label className="text-xs">Note (optional)</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. before opening"
          />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex gap-2 pt-1">
          {existing && (
            <Button variant="outline" className="gap-1.5 text-red-600" disabled={busy} onClick={remove}>
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button className="gap-1.5 bg-[#1B4332] hover:bg-[#2D6A4F]" disabled={busy} onClick={save}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {existing ? "Save" : "Add duty"}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
