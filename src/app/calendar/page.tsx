"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
} from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  ExternalLink,
  Loader2,
  Check,
  Ban,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCalendar } from "@/lib/calendar/use-calendar";
import { kindMeta, CALENDAR_CATEGORY_LABELS, type CalendarItem } from "@/lib/calendar/types";

const TODAY = format(new Date(), "yyyy-MM-dd");
const selectCls = "w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm";

function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hr = parseInt(h, 10);
  if (Number.isNaN(hr)) return "";
  const ap = hr >= 12 ? "PM" : "AM";
  return `${hr % 12 || 12}:${m} ${ap}`;
}
function fmtDay(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "EEE, MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

/** The "kind" choices in the Add form. */
const ADD_KINDS: { value: string; label: string }[] = [
  { value: "outing", label: "Golf outing" },
  { value: "one_on_one", label: "1:1 meeting" },
  { value: "fb_event", label: "F&B event" },
  { value: "appointment", label: "Appointment" },
  { value: "meeting", label: "Meeting" },
  { value: "deadline", label: "Deadline" },
  { value: "other", label: "Other" },
];

const EMPTY_FORM = {
  title: "",
  date: "",
  endDate: "",
  startTime: "",
  endTime: "",
  allDay: false,
  location: "",
  guests: "",
  contactName: "",
  contactPhone: "",
  notes: "",
  employeeId: "",
  players: "",
  teeTime: "",
};

export default function CalendarPage() {
  const cal = useCalendar();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [item, setItem] = useState<CalendarItem | null>(null);
  const [moveDate, setMoveDate] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState("appointment");
  const [f, setF] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof EMPTY_FORM, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [month]);

  const itemsOnDay = (dayStr: string) =>
    cal.items.filter((i) => i.date <= dayStr && dayStr <= (i.endDate || i.date));

  const upcoming = useMemo(
    () => [...cal.items].filter((i) => (i.endDate || i.date) >= TODAY).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12),
    [cal.items],
  );

  const employees = useMemo(
    () => Object.entries(cal.people).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    [cal.people],
  );

  function openAdd(date?: string) {
    setF({ ...EMPTY_FORM, date: date || "" });
    setAddKind("appointment");
    setErr(null);
    setAddOpen(true);
  }

  async function submitAdd() {
    setErr(null);
    if (!f.date) return setErr("Pick a date.");
    if (addKind === "one_on_one" && !f.employeeId) return setErr("Pick an employee.");
    if (addKind !== "one_on_one" && !f.title.trim()) return setErr("Add a title.");
    setBusy(true);
    try {
      if (addKind === "outing") {
        await cal.addOuting({
          name: f.title.trim(),
          event_date: f.date,
          expected_players: f.players ? parseInt(f.players, 10) : null,
          first_tee_time: f.teeTime || null,
          contact_name: f.contactName.trim() || null,
          contact_phone: f.contactPhone.trim() || null,
          notes: f.notes.trim() || null,
        });
      } else if (addKind === "one_on_one") {
        await cal.scheduleOneOnOne(f.employeeId, f.date, f.startTime || null, f.notes.trim() || null);
      } else {
        await cal.addCalendarEvent({
          title: f.title.trim(),
          category: addKind as "fb_event" | "appointment" | "meeting" | "deadline" | "other",
          event_date: f.date,
          end_date: f.endDate || null,
          all_day: f.allDay,
          start_time: f.allDay ? null : f.startTime || null,
          end_time: f.allDay ? null : f.endTime || null,
          location: f.location.trim() || null,
          expected_guests: addKind === "fb_event" && f.guests ? parseInt(f.guests, 10) : null,
          contact_name: f.contactName.trim() || null,
          contact_phone: f.contactPhone.trim() || null,
          notes: f.notes.trim() || null,
        });
      }
      setAddOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function doMove() {
    if (!item || !moveDate) return;
    setBusy(true);
    try {
      await cal.rescheduleItem(item, moveDate);
      setItem(null);
    } finally {
      setBusy(false);
    }
  }

  function Chip({ it, onClick }: { it: CalendarItem; onClick: () => void }) {
    const m = kindMeta(it.kind);
    return (
      <button
        onClick={onClick}
        className={`w-full text-left truncate text-[11px] leading-tight px-1.5 py-0.5 rounded border ${m.chip}`}
      >
        {it.time ? `${fmtTime(it.time)} ` : ""}
        {it.title}
      </button>
    );
  }

  return (
    <div className="p-3 md:p-6 pb-28 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">Calendar</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setMonth((mo) => subMonths(mo, 1))} aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <button onClick={() => setMonth(startOfMonth(new Date()))} className="px-3 py-1.5 text-sm font-medium rounded-lg border border-border hover:bg-muted min-w-[9rem] text-center">
            {format(month, "MMMM yyyy")}
          </button>
          <Button variant="outline" size="icon" onClick={() => setMonth((mo) => addMonths(mo, 1))} aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button className="gap-2 bg-[#1B4332] hover:bg-[#2D6A4F]" onClick={() => openAdd()}>
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      </div>

      {cal.error && (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{cal.error}</div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-2 text-xs text-muted-foreground">
        {["golf", "task", "one_on_one", "fb_event", "appointment", "deadline"].map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${kindMeta(k).dot}`} /> {kindMeta(k).label}
          </span>
        ))}
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 text-[11px] font-medium text-muted-foreground border-b border-border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-1 py-1 text-center">{d}</div>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-7 border-l border-t border-border">
        {days.map((day) => {
          const dayStr = format(day, "yyyy-MM-dd");
          const inMonth = isSameMonth(day, month);
          const isToday = dayStr === TODAY;
          const dayItems = itemsOnDay(dayStr);
          return (
            <div
              key={dayStr}
              className={`min-h-[5.5rem] border-r border-b border-border p-1 align-top ${inMonth ? "" : "bg-muted/30"}`}
            >
              <button
                onClick={() => setDayOpen(dayStr)}
                className={`text-[11px] w-6 h-6 flex items-center justify-center rounded-full mb-0.5 ${
                  isToday ? "bg-primary text-primary-foreground font-bold" : inMonth ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {format(day, "d")}
              </button>
              <div className="space-y-0.5">
                {dayItems.slice(0, 3).map((it) => (
                  <Chip key={`${it.source}-${it.sourceId}`} it={it} onClick={() => { setItem(it); setMoveDate(it.date); }} />
                ))}
                {dayItems.length > 3 && (
                  <button onClick={() => setDayOpen(dayStr)} className="text-[10px] text-muted-foreground px-1">
                    +{dayItems.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Upcoming */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold mb-2">Upcoming</h2>
        {cal.loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing scheduled. Tap <span className="font-medium">Add</span> to put something on the calendar.</p>
        ) : (
          <div className="space-y-1.5">
            {upcoming.map((it) => (
              <button
                key={`${it.source}-${it.sourceId}`}
                onClick={() => { setItem(it); setMoveDate(it.date); }}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted text-left"
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${kindMeta(it.kind).dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{it.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDay(it.date)}{it.endDate && it.endDate !== it.date ? ` – ${fmtDay(it.endDate)}` : ""}{it.time ? ` · ${fmtTime(it.time)}` : ""}
                  </p>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${kindMeta(it.kind).chip}`}>{kindMeta(it.kind).label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Day sheet */}
      {dayOpen && (
        <Overlay onClose={() => setDayOpen(null)} title={fmtDay(dayOpen)}>
          <div className="p-4 space-y-2">
            {itemsOnDay(dayOpen).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing on this day.</p>
            ) : (
              itemsOnDay(dayOpen).map((it) => (
                <button
                  key={`${it.source}-${it.sourceId}`}
                  onClick={() => { setDayOpen(null); setItem(it); setMoveDate(it.date); }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted text-left"
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${kindMeta(it.kind).dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{it.title}</p>
                    {(it.time || it.subtitle) && (
                      <p className="text-xs text-muted-foreground truncate">{[fmtTime(it.time), it.subtitle].filter(Boolean).join(" · ")}</p>
                    )}
                  </div>
                </button>
              ))
            )}
            <Button variant="outline" className="w-full gap-2 mt-2" onClick={() => { const d = dayOpen; setDayOpen(null); openAdd(d || undefined); }}>
              <Plus className="w-4 h-4" /> Add to this day
            </Button>
          </div>
        </Overlay>
      )}

      {/* Item detail / reschedule */}
      {item && (
        <Overlay onClose={() => setItem(null)} title={kindMeta(item.kind).label}>
          <div className="p-4 space-y-3">
            <div>
              <p className="text-base font-semibold">{item.title}</p>
              <p className="text-sm text-muted-foreground">
                {fmtDay(item.date)}{item.endDate && item.endDate !== item.date ? ` – ${fmtDay(item.endDate)}` : ""}{item.time ? ` · ${fmtTime(item.time)}` : ""}
              </p>
              {item.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Reschedule to</Label>
              <div className="flex gap-2">
                <Input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} className="flex-1" />
                <Button onClick={doMove} disabled={busy || !moveDate || moveDate === item.date}>Move</Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {item.href && (
                <Link href={item.href} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted">
                  <ExternalLink className="w-4 h-4" /> Open
                </Link>
              )}
              {item.source === "one_on_one" && (
                <>
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={async () => { setBusy(true); try { await cal.updateOneOnOne(item.sourceId, { status: "completed" }); setItem(null); } finally { setBusy(false); } }}>
                    <Check className="w-4 h-4" /> Mark done
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={async () => { setBusy(true); try { await cal.updateOneOnOne(item.sourceId, { status: "canceled" }); setItem(null); } finally { setBusy(false); } }}>
                    <Ban className="w-4 h-4" /> Cancel
                  </Button>
                </>
              )}
              {(item.source === "one_on_one" || item.source === "calendar_event") && (
                <Button variant="outline" size="sm" className="gap-1.5 text-red-600" disabled={busy} onClick={async () => { setBusy(true); try { await cal.deleteItem(item); setItem(null); } finally { setBusy(false); } }}>
                  <Trash2 className="w-4 h-4" /> Delete
                </Button>
              )}
            </div>
            {item.source === "tournament" && (
              <p className="text-[11px] text-muted-foreground">Golf events are managed in the Tournaments section — open to edit details or remove.</p>
            )}
          </div>
        </Overlay>
      )}

      {/* Add */}
      {addOpen && (
        <Overlay onClose={() => setAddOpen(false)} title="Add to calendar">
          <div className="p-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">What is it?</Label>
              <select value={addKind} onChange={(e) => setAddKind(e.target.value)} className={selectCls}>
                {ADD_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>

            {addKind === "one_on_one" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Employee</Label>
                <select value={f.employeeId} onChange={(e) => set("employeeId", e.target.value)} className={selectCls}>
                  <option value="">— Select —</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">{addKind === "outing" ? "Outing name" : "Title"}</Label>
                <Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder={addKind === "outing" ? "e.g. Smith Corp Outing" : "e.g. Board meeting"} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
              </div>
              {addKind !== "outing" && addKind !== "one_on_one" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">End date (optional)</Label>
                  <Input type="date" value={f.endDate} min={f.date} onChange={(e) => set("endDate", e.target.value)} />
                </div>
              )}
              {addKind === "outing" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">First tee time</Label>
                  <Input type="time" value={f.teeTime} onChange={(e) => set("teeTime", e.target.value)} />
                </div>
              )}
              {addKind === "one_on_one" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Time (optional)</Label>
                  <Input type="time" value={f.startTime} onChange={(e) => set("startTime", e.target.value)} />
                </div>
              )}
            </div>

            {/* category events: time + location */}
            {addKind !== "outing" && addKind !== "one_on_one" && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={f.allDay} onChange={(e) => set("allDay", e.target.checked)} /> All day
                </label>
                {!f.allDay && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label className="text-xs">Start time</Label><Input type="time" value={f.startTime} onChange={(e) => set("startTime", e.target.value)} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">End time</Label><Input type="time" value={f.endTime} onChange={(e) => set("endTime", e.target.value)} /></div>
                  </div>
                )}
                <div className="space-y-1.5"><Label className="text-xs">Location (optional)</Label><Input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Clubhouse banquet room" /></div>
              </>
            )}

            {/* F&B + outing extras */}
            {addKind === "fb_event" && (
              <div className="space-y-1.5"><Label className="text-xs">Expected guests</Label><Input type="number" value={f.guests} onChange={(e) => set("guests", e.target.value)} /></div>
            )}
            {addKind === "outing" && (
              <div className="space-y-1.5"><Label className="text-xs">Expected players</Label><Input type="number" value={f.players} onChange={(e) => set("players", e.target.value)} /></div>
            )}
            {(addKind === "outing" || addKind === "fb_event") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Contact name</Label><Input value={f.contactName} onChange={(e) => set("contactName", e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Contact phone</Label><Input value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} /></div>
              </div>
            )}

            <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>

            {err && <p className="text-sm text-red-600">{err}</p>}
            <Button className="w-full gap-2 bg-[#1B4332] hover:bg-[#2D6A4F]" disabled={busy} onClick={submitAdd}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add {addKind === "outing" ? "outing" : addKind === "one_on_one" ? "1:1" : CALENDAR_CATEGORY_LABELS[addKind as keyof typeof CALENDAR_CATEGORY_LABELS]?.toLowerCase()}
            </Button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-background border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <span className="font-semibold text-sm">{title}</span>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
