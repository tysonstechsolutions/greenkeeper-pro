"use client";

import { useMemo, useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  format,
} from "date-fns";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Users,
  Pencil,
  Trash2,
  UserMinus,
  Sun,
  Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useProShop, type ShiftInput } from "@/lib/pro-shop/use-pro-shop";
import {
  compactTime,
  dayWarnings,
  hhmm,
  shortDate,
  summarizeWeekly,
  ymd,
} from "@/lib/pro-shop/schedule-engine";
import {
  positionGroup,
  type ProShopShift,
  type ProShopStaff,
  type ShiftGroup,
} from "@/lib/pro-shop/types";
import { Overlay } from "@/components/features/pro-shop/overlay";
import { AvailabilitySheet } from "@/components/features/pro-shop/availability-sheet";
import { CoverSheet } from "@/components/features/pro-shop/cover-sheet";

const selectCls = "w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm";
const NOW = new Date();
const TODAY = ymd(NOW);

function firstName(name: string): string {
  return name.split(" ")[0];
}

export default function ProShopSchedulePage() {
  const ps = useProShop(NOW.getFullYear(), NOW.getMonth());
  const monthDate = useMemo(() => new Date(ps.year, ps.month0, 1), [ps.year, ps.month0]);

  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [availabilityStaff, setAvailabilityStaff] = useState<ProShopStaff | null>(null);
  const [coverDate, setCoverDate] = useState<{ date: string; offId?: string } | null>(null);
  const [editShift, setEditShift] = useState<
    { mode: "new"; date: string } | { mode: "edit"; shift: ProShopShift } | null
  >(null);
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const grid = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthDate));
    const end = endOfWeek(endOfMonth(monthDate));
    return eachDayOfInterval({ start, end });
  }, [monthDate]);

  function shiftsOn(dateStr: string): ProShopShift[] {
    return ps.shifts
      .filter((s) => s.shift_date === dateStr)
      .sort((a, b) => {
        if (a.group !== b.group) return a.group === "outside" ? -1 : 1;
        return hhmm(a.start_time).localeCompare(hhmm(b.start_time));
      });
  }

  function changeMonth(delta: number) {
    const d = new Date(ps.year, ps.month0 + delta, 1);
    ps.setMonth(d.getFullYear(), d.getMonth());
  }

  async function handleGenerate() {
    const exists = !!ps.schedule;
    if (exists) {
      const ok = window.confirm(
        "Regenerate this month from everyone's weekly availability? This replaces all shifts for the month, including manual edits.",
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await ps.generateMonth(exists);
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish() {
    if (!ps.schedule) return;
    setBusy(true);
    try {
      await ps.publishMonth(ps.schedule.id);
    } finally {
      setBusy(false);
    }
  }

  // Month-level coverage warning count.
  const warningDays = useMemo(() => {
    const days = eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) });
    let count = 0;
    for (const d of days) {
      const ds = ymd(d);
      const w = dayWarnings(shiftsOn(ds));
      if (w.length) count++;
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ps.shifts, monthDate]);

  return (
    <div className="p-3 md:p-6 pb-28 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold leading-tight">Pro Shop Schedule</h1>
            <p className="text-xs text-muted-foreground">Rec aids & golf ops — days & hours</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => changeMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <button
            onClick={() => ps.setMonth(NOW.getFullYear(), NOW.getMonth())}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-border hover:bg-muted min-w-[9rem] text-center"
          >
            {format(monthDate, "MMMM yyyy")}
          </button>
          <Button variant="outline" size="icon" onClick={() => changeMonth(1)} aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Status + actions */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {ps.schedule ? (
          <span
            className={`text-xs px-2 py-1 rounded-full border ${
              ps.schedule.status === "published"
                ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                : "bg-amber-50 border-amber-300 text-amber-700"
            }`}
          >
            {ps.schedule.status === "published" ? "Published" : "Draft"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Not created yet</span>
        )}
        {warningDays > 0 && (
          <span className="text-xs px-2 py-1 rounded-full border bg-red-50 border-red-300 text-red-700 inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {warningDays} day{warningDays === 1 ? "" : "s"} need attention
          </span>
        )}
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleGenerate} disabled={busy || ps.staff.length === 0}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {ps.schedule ? "Regenerate" : "Generate schedule"}
        </Button>
        {ps.schedule && ps.schedule.status !== "published" && (
          <Button size="sm" className="gap-1.5 bg-[#1B4332] hover:bg-[#2D6A4F]" onClick={handlePublish} disabled={busy}>
            <CheckCircle2 className="w-4 h-4" /> Publish
          </Button>
        )}
      </div>

      {ps.error && (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{ps.error}</div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Sun className="w-3.5 h-3.5 text-amber-500" /> Outside (rec aids)
        </span>
        <span className="flex items-center gap-1.5">
          <Moon className="w-3.5 h-3.5 text-indigo-500" /> Inside (golf ops)
        </span>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 text-[11px] font-medium text-muted-foreground border-b border-border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-1 py-1 text-center">{d}</div>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-7 border-l border-t border-border">
        {grid.map((day) => {
          const ds = ymd(day);
          const inMonth = isSameMonth(day, monthDate);
          const isToday = ds === TODAY;
          const dayShifts = shiftsOn(ds);
          const out = dayShifts.filter((s) => s.group === "outside");
          const ins = dayShifts.filter((s) => s.group === "inside");
          const warns = inMonth ? dayWarnings(dayShifts) : [];
          return (
            <button
              key={ds}
              onClick={() => inMonth && setDayOpen(ds)}
              className={`min-h-[6.5rem] border-r border-b border-border p-1 text-left align-top ${
                inMonth ? "hover:bg-muted/40" : "bg-muted/30 cursor-default"
              }`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span
                  className={`text-[11px] w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday ? "bg-primary text-primary-foreground font-bold" : inMonth ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {format(day, "d")}
                </span>
                {warns.length > 0 && <AlertTriangle className="w-3 h-3 text-red-500" />}
              </div>
              {inMonth && (
                <div className="space-y-px">
                  {out.map((s) => (
                    <ShiftLine key={s.id} shift={s} name={firstName(ps.staffById[s.staff_id]?.full_name ?? "?")} />
                  ))}
                  {ins.length > 0 && out.length > 0 && <div className="h-px bg-border my-0.5" />}
                  {ins.map((s) => (
                    <ShiftLine key={s.id} shift={s} name={firstName(ps.staffById[s.staff_id]?.full_name ?? "?")} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Staff panel */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Users className="w-4 h-4" /> Staff & availability
          </h2>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddStaffOpen(true)}>
            <Plus className="w-4 h-4" /> Add person
          </Button>
        </div>
        {ps.loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {ps.staff.map((s) => (
              <button
                key={s.id}
                onClick={() => setAvailabilityStaff(s)}
                className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted text-left"
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white ${
                    positionGroup(s.position) === "inside" ? "bg-indigo-500" : "bg-amber-500"
                  }`}
                >
                  {positionGroup(s.position) === "inside" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {s.full_name}
                    {!s.is_active && <span className="text-xs text-muted-foreground"> · inactive</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {s.position === "golf_ops_assistant" ? "Golf Ops Assistant" : "Rec Aid"}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">{summarizeWeekly(s)}</p>
                </div>
                <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Day editor ────────────────────────────────────────────────────── */}
      {dayOpen && (
        <Overlay title={shortDate(dayOpen)} onClose={() => setDayOpen(null)}>
          <DayEditor
            date={dayOpen}
            shifts={shiftsOn(dayOpen)}
            staffById={ps.staffById}
            onEdit={(shift) => setEditShift({ mode: "edit", shift })}
            onAdd={() => setEditShift({ mode: "new", date: dayOpen })}
            onCover={() => setCoverDate({ date: dayOpen })}
          />
        </Overlay>
      )}

      {/* ── Shift add/edit ────────────────────────────────────────────────── */}
      {editShift && (
        <ShiftEditor
          state={editShift}
          staff={ps.staff}
          onClose={() => setEditShift(null)}
          addShift={ps.addShift}
          updateShift={ps.updateShift}
          deleteShift={ps.deleteShift}
        />
      )}

      {/* ── Cover flow ────────────────────────────────────────────────────── */}
      {coverDate && (
        <CoverSheet
          date={coverDate.date}
          staff={ps.staff}
          dayShifts={shiftsOn(coverDate.date)}
          defaultOffStaffId={coverDate.offId}
          deleteShift={ps.deleteShift}
          addShift={ps.addShift}
          addTimeOff={ps.addTimeOff}
          onClose={() => {
            setCoverDate(null);
            setDayOpen(null);
          }}
        />
      )}

      {/* ── Availability ──────────────────────────────────────────────────── */}
      {availabilityStaff && (
        <AvailabilitySheet
          staff={availabilityStaff}
          onClose={() => setAvailabilityStaff(null)}
          onSave={(availability, text) => ps.saveAvailability(availabilityStaff.id, availability, text)}
        />
      )}

      {/* ── Add staff ─────────────────────────────────────────────────────── */}
      {addStaffOpen && (
        <AddStaffSheet onClose={() => setAddStaffOpen(false)} addStaff={ps.addStaff} />
      )}
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function ShiftLine({ shift, name }: { shift: ProShopShift; name: string }) {
  return (
    <div
      className={`truncate text-[10px] leading-tight px-1 rounded ${
        shift.group === "inside" ? "text-indigo-700" : "text-amber-800"
      }`}
      title={shift.note ?? undefined}
    >
      <span className="tabular-nums">
        {compactTime(shift.start_time)}-{compactTime(shift.end_time)}
      </span>{" "}
      {name}
      {shift.note ? " *" : ""}
    </div>
  );
}

function ShiftGroupList({
  title,
  list,
  staffById,
  onEdit,
  icon,
}: {
  title: string;
  list: ProShopShift[];
  staffById: Record<string, ProShopStaff>;
  onEdit: (s: ProShopShift) => void;
  icon: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-1">
        {icon} {title}
      </p>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No one scheduled</p>
      ) : (
        <div className="space-y-1">
          {list.map((s) => (
            <button
              key={s.id}
              onClick={() => onEdit(s)}
              className="w-full flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted text-left"
            >
              <span className="text-sm tabular-nums w-24 shrink-0">
                {compactTime(s.start_time)}-{compactTime(s.end_time)}
              </span>
              <span className="text-sm font-medium flex-1 truncate">
                {staffById[s.staff_id]?.full_name ?? "Unknown"}
              </span>
              {s.note && <span className="text-[10px] text-muted-foreground truncate max-w-[7rem]">{s.note}</span>}
              <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DayEditor({
  date,
  shifts,
  staffById,
  onEdit,
  onAdd,
  onCover,
}: {
  date: string;
  shifts: ProShopShift[];
  staffById: Record<string, ProShopStaff>;
  onEdit: (s: ProShopShift) => void;
  onAdd: () => void;
  onCover: () => void;
}) {
  const out = shifts.filter((s) => s.group === "outside");
  const ins = shifts.filter((s) => s.group === "inside");
  void date;

  return (
    <div className="p-4 space-y-4">
      <ShiftGroupList
        title="Outside (rec aids)"
        list={out}
        staffById={staffById}
        onEdit={onEdit}
        icon={<Sun className="w-3.5 h-3.5 text-amber-500" />}
      />
      <ShiftGroupList
        title="Inside (golf ops)"
        list={ins}
        staffById={staffById}
        onEdit={onEdit}
        icon={<Moon className="w-3.5 h-3.5 text-indigo-500" />}
      />
      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <Button variant="outline" className="flex-1 gap-1.5" onClick={onAdd}>
          <Plus className="w-4 h-4" /> Add shift
        </Button>
        <Button variant="outline" className="flex-1 gap-1.5" onClick={onCover}>
          <UserMinus className="w-4 h-4" /> Day off / cover
        </Button>
      </div>
    </div>
  );
}

function ShiftEditor({
  state,
  staff,
  onClose,
  addShift,
  updateShift,
  deleteShift,
}: {
  state: { mode: "new"; date: string } | { mode: "edit"; shift: ProShopShift };
  staff: ProShopStaff[];
  onClose: () => void;
  addShift: (input: ShiftInput) => Promise<void>;
  updateShift: (id: string, patch: Partial<ProShopShift>) => Promise<void>;
  deleteShift: (id: string) => Promise<void>;
}) {
  const editing = state.mode === "edit";
  const existing = editing ? state.shift : null;
  const date = editing ? state.shift.shift_date : state.date;

  const [staffId, setStaffId] = useState(existing?.staff_id ?? staff[0]?.id ?? "");
  const [group, setGroup] = useState<ShiftGroup>(
    existing?.group ?? (staff[0] ? positionGroup(staff[0].position) : "outside"),
  );
  const [start, setStart] = useState(hhmm(existing?.start_time) || "08:00");
  const [end, setEnd] = useState(hhmm(existing?.end_time) || "14:00");
  const [note, setNote] = useState(existing?.note ?? "");
  const [saving, setSaving] = useState(false);

  function onPickStaff(id: string) {
    setStaffId(id);
    const s = staff.find((x) => x.id === id);
    if (s && !editing) setGroup(positionGroup(s.position));
  }

  async function save() {
    if (!staffId) return;
    setSaving(true);
    try {
      if (editing && existing) {
        await updateShift(existing.id, {
          staff_id: staffId,
          group,
          start_time: start,
          end_time: end,
          note: note || null,
        });
      } else {
        await addShift({ staff_id: staffId, shift_date: date, group, start_time: start, end_time: end, note });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setSaving(true);
    try {
      await deleteShift(existing.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay title={`${editing ? "Edit" : "Add"} shift — ${shortDate(date)}`} onClose={onClose}>
      <div className="p-4 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Person</Label>
          <select value={staffId} onChange={(e) => onPickStaff(e.target.value)} className={selectCls}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({s.position === "golf_ops_assistant" ? "inside" : "outside"})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Group</Label>
          <select value={group} onChange={(e) => setGroup(e.target.value as ShiftGroup)} className={selectCls}>
            <option value="outside">Outside (rec aids)</option>
            <option value="inside">Inside (golf ops)</option>
          </select>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Start</Label>
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">End</Label>
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Note (optional)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. covering for Aniya" />
        </div>
        <div className="flex gap-2 pt-1">
          {editing && (
            <Button variant="outline" size="icon" onClick={remove} disabled={saving} aria-label="Delete shift">
              <Trash2 className="w-4 h-4 text-red-600" />
            </Button>
          )}
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1 bg-[#1B4332] hover:bg-[#2D6A4F]" onClick={save} disabled={saving || !staffId}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

function AddStaffSheet({
  onClose,
  addStaff,
}: {
  onClose: () => void;
  addStaff: (p: {
    full_name: string;
    position: "rec_aid" | "golf_ops_assistant";
    default_group: ShiftGroup;
    phone?: string | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState<"rec_aid" | "golf_ops_assistant">("rec_aid");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await addStaff({
        full_name: name.trim(),
        position,
        default_group: positionGroup(position),
        phone: phone.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay title="Add pro shop staff" onClose={onClose}>
      <div className="p-4 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Full name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="First Last" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Position</Label>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value as "rec_aid" | "golf_ops_assistant")}
            className={selectCls}
          >
            <option value="rec_aid">Rec Aid (outside)</option>
            <option value="golf_ops_assistant">Golf Ops Assistant (inside)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Phone (optional)</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          After adding, tap the person to set their weekly availability.
        </p>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1 bg-[#1B4332] hover:bg-[#2D6A4F]" onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
