"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { DetailPageHeader } from "@/components/ui/back-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trophy,
  Calendar,
  Users,
  Clock,
  Phone,
  Mail,
  User,
  Edit2,
  Check,
  X,
  Plus,
  Loader2,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Clipboard,
} from "lucide-react";

// ── Types ──

interface Tournament {
  id: string;
  name: string;
  event_date: string;
  event_end_date: string | null;
  event_type: string;
  status: string;
  expected_players: number | null;
  format: string | null;
  shotgun_start: boolean;
  first_tee_time: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  created_by: string | null;
}

interface ChecklistItem {
  id: string;
  tournament_id: string;
  category: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  due_date: string | null;
  status: string;
  sort_order: number;
  completed_at: string | null;
  completed_by: string | null;
}

interface StaffMember {
  id: string;
  full_name: string | null;
}

// ── Constants ──

type CategoryKey =
  | "course_setup"
  | "equipment"
  | "signage"
  | "food_beverage"
  | "staffing"
  | "communication"
  | "post_event";

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: "course_setup", label: "Course Setup" },
  { key: "equipment", label: "Equipment" },
  { key: "signage", label: "Signage" },
  { key: "food_beverage", label: "Food & Beverage" },
  { key: "staffing", label: "Staffing" },
  { key: "communication", label: "Communication" },
  { key: "post_event", label: "Post Event" },
];

const eventTypeLabels: Record<string, string> = {
  tournament: "Tournament",
  outing: "Outing",
  league: "League",
  charity: "Charity",
  military: "Military",
  practice_round: "Practice Round",
  other: "Other",
};

const eventTypeColors: Record<string, string> = {
  tournament: "bg-amber-500/15 text-amber-700 border-amber-200",
  outing: "bg-blue-500/15 text-blue-700 border-blue-200",
  league: "bg-green-500/15 text-green-700 border-green-200",
  charity: "bg-pink-500/15 text-pink-700 border-pink-200",
  military: "bg-slate-500/15 text-slate-700 border-slate-200",
  practice_round: "bg-cyan-500/15 text-cyan-700 border-cyan-200",
  other: "bg-gray-500/15 text-gray-700 border-gray-200",
};

const statusLabels: Record<string, string> = {
  planning: "Planning",
  confirmed: "Confirmed",
  setup: "Setup",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const statusColors: Record<string, string> = {
  planning: "bg-blue-500/15 text-blue-700 border-blue-200",
  confirmed: "bg-green-500/15 text-green-700 border-green-200",
  setup: "bg-orange-500/15 text-orange-700 border-orange-200",
  in_progress: "bg-purple-500/15 text-purple-700 border-purple-200",
  completed: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-500/15 text-red-700 border-red-200",
};

const STATUS_FLOW: string[] = [
  "planning",
  "confirmed",
  "setup",
  "in_progress",
  "completed",
];

const STANDARD_CHECKLIST: { category: CategoryKey; title: string }[] = [
  // Course Setup
  { category: "course_setup", title: "Set pin positions" },
  { category: "course_setup", title: "Mow greens (tournament cut)" },
  { category: "course_setup", title: "Edge bunkers" },
  { category: "course_setup", title: "Fill divots on tees" },
  { category: "course_setup", title: "Set tee markers" },
  { category: "course_setup", title: "Mark GUR/hazards" },
  { category: "course_setup", title: "Check ball washers" },
  // Equipment
  { category: "equipment", title: "Fuel all carts" },
  { category: "equipment", title: "Check beverage cart" },
  { category: "equipment", title: "Stage range balls" },
  { category: "equipment", title: "Set up scoring tent" },
  // Signage
  { category: "signage", title: "Hole signs/sponsors" },
  { category: "signage", title: "Direction signs" },
  { category: "signage", title: "Rule sheets on carts" },
  // Staffing
  { category: "staffing", title: "Confirm starters" },
  { category: "staffing", title: "Cart staging crew" },
  { category: "staffing", title: "Beverage cart driver" },
  { category: "staffing", title: "Marshals assigned" },
  // Communication
  { category: "communication", title: "Send confirmations" },
  { category: "communication", title: "Brief crew morning-of" },
  // Post Event
  { category: "post_event", title: "Remove signage" },
  { category: "post_event", title: "Extra green cleanup" },
  { category: "post_event", title: "Report any course damage" },
];

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatTime = (timeStr: string) => {
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
};

// ── Page Component ──

function PageContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const tournamentId = searchParams.get("id") ?? "";

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Inline add-item state
  const [addingCategory, setAddingCategory] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newDueDate, setNewDueDate] = useState("");

  // Collapsed categories
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const [{ data: t }, { data: ci }, { data: s }] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", tournamentId).single(),
      supabase
        .from("tournament_checklist_items")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase.from("profiles").select("id, full_name").order("full_name"),
    ]);

    if (t) setTournament(t as Tournament);
    if (ci) setItems(ci as ChecklistItem[]);
    if (s) setStaff(s as StaffMember[]);
    setLoading(false);
  }, [tournamentId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Handlers ──

  const toggleItem = async (item: ChecklistItem) => {
    const supabase = createClient();
    const newStatus = item.status === "completed" ? "pending" : "completed";
    const update: Record<string, unknown> = { status: newStatus };
    if (newStatus === "completed") {
      update.completed_at = new Date().toISOString();
      update.completed_by = user?.id ?? null;
    } else {
      update.completed_at = null;
      update.completed_by = null;
    }
    await supabase
      .from("tournament_checklist_items")
      .update(update)
      .eq("id", item.id);

    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, ...update } as ChecklistItem : i
      )
    );
  };

  const addItem = async () => {
    if (!newTitle.trim() || !addingCategory) return;
    const supabase = createClient();
    const payload: Record<string, unknown> = {
      tournament_id: tournamentId,
      category: addingCategory,
      title: newTitle.trim(),
      status: "pending",
      sort_order: items.filter((i) => i.category === addingCategory).length,
    };
    if (newDesc.trim()) payload.description = newDesc.trim();
    if (newAssignee) payload.assigned_to = newAssignee;
    if (newDueDate) payload.due_date = newDueDate;

    const { data } = await supabase
      .from("tournament_checklist_items")
      .insert(payload)
      .select()
      .single();

    if (data) setItems((prev) => [...prev, data as ChecklistItem]);
    setNewTitle("");
    setNewDesc("");
    setNewAssignee("");
    setNewDueDate("");
    setAddingCategory(null);
  };

  const addStandardChecklist = async () => {
    setSaving(true);
    const supabase = createClient();
    const existingTitles = new Set(items.map((i) => `${i.category}:${i.title}`));
    const newItems = STANDARD_CHECKLIST.filter(
      (s) => !existingTitles.has(`${s.category}:${s.title}`)
    ).map((s, idx) => ({
      tournament_id: tournamentId,
      category: s.category,
      title: s.title,
      status: "pending" as const,
      sort_order: idx,
    }));

    if (newItems.length > 0) {
      await supabase.from("tournament_checklist_items").insert(newItems);
    }
    await fetchData();
    setSaving(false);
  };

  const advanceStatus = async (newStatus: string) => {
    const supabase = createClient();
    await supabase
      .from("tournaments")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", tournamentId);
    setTournament((prev) => (prev ? { ...prev, status: newStatus } : prev));
  };

  const staffName = (id: string | null) => {
    if (!id) return null;
    const found = staff.find((s) => s.id === id);
    return found?.full_name ?? "Unknown";
  };

  // ── Loading / Not found ──

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <DetailPageHeader
          backHref="/tournaments"
          backLabel="Tournaments"
          title="Event Not Found"
        />
        <p className="text-muted-foreground">
          This tournament may have been deleted.
        </p>
      </div>
    );
  }

  // ── Status flow ──

  const currentIdx = STATUS_FLOW.indexOf(tournament.status);
  const nextStatus = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1
    ? STATUS_FLOW[currentIdx + 1]
    : null;

  // Group items by category
  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category === cat.key),
  }));

  const totalItems = items.length;
  const completedItems = items.filter((i) => i.status === "completed").length;

  return (
    <div className="p-4 pb-28 max-w-2xl mx-auto">
      <DetailPageHeader
        backHref="/tournaments"
        backLabel="Tournaments"
        title={tournament.name}
        subtitle={
          <div className="flex flex-wrap gap-1.5 mt-1">
            <Badge className={eventTypeColors[tournament.event_type] ?? eventTypeColors.other}>
              {eventTypeLabels[tournament.event_type] ?? tournament.event_type}
            </Badge>
            <Badge className={statusColors[tournament.status] ?? statusColors.planning}>
              {statusLabels[tournament.status] ?? tournament.status}
            </Badge>
          </div>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(!editing)}
            className="gap-1.5"
          >
            {editing ? <X className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
            {editing ? "Cancel" : "Edit"}
          </Button>
        }
      />

      {/* ── Edit Form / Info Card ── */}
      {editing ? (
        <EditForm
          tournament={tournament}
          onSave={async (data) => {
            const supabase = createClient();
            await supabase
              .from("tournaments")
              .update({ ...data, updated_at: new Date().toISOString() })
              .eq("id", tournamentId);
            setTournament((prev) => (prev ? { ...prev, ...data } : prev));
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <EventInfoCard tournament={tournament} />
      )}

      {/* ── Status Controls ── */}
      {tournament.status !== "completed" && tournament.status !== "cancelled" && (
        <div className="flex flex-wrap gap-2 mb-6">
          {nextStatus && (
            <Button
              size="sm"
              onClick={() => advanceStatus(nextStatus)}
              className="gap-1.5"
            >
              <ChevronRight className="w-4 h-4" />
              Move to {statusLabels[nextStatus]}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => advanceStatus("cancelled")}
            className="gap-1.5 text-red-600 hover:text-red-700"
          >
            <X className="w-4 h-4" />
            Cancel Event
          </Button>
        </div>
      )}
      {tournament.status === "cancelled" && (
        <div className="flex gap-2 mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => advanceStatus("planning")}
            className="gap-1.5"
          >
            Reopen as Planning
          </Button>
        </div>
      )}

      {/* ── Checklist Section ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Checklist</h2>
          {totalItems > 0 && (
            <span className="text-sm text-muted-foreground">
              ({completedItems}/{totalItems})
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={addStandardChecklist}
          disabled={saving}
          className="gap-1.5"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Clipboard className="w-4 h-4" />
          )}
          Add Standard Checklist
        </Button>
      </div>

      {/* Overall progress */}
      {totalItems > 0 && (
        <div className="mb-4">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{
                width: `${Math.round((completedItems / totalItems) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* ── Categories ── */}
      <div className="space-y-3">
        {grouped.map((cat) => {
          const catCompleted = cat.items.filter(
            (i) => i.status === "completed"
          ).length;
          const isCollapsed = collapsed[cat.key] ?? false;

          return (
            <Card key={cat.key}>
              <button
                onClick={() =>
                  setCollapsed((p) => ({ ...p, [cat.key]: !isCollapsed }))
                }
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="font-medium">{cat.label}</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {catCompleted}/{cat.items.length}
                </span>
              </button>

              {!isCollapsed && (
                <CardContent className="pt-0 pb-3">
                  {cat.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground pl-6 py-2">
                      No items yet
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {cat.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-muted/30 transition-colors group"
                        >
                          <button
                            onClick={() => toggleItem(item)}
                            className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                              item.status === "completed"
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-muted-foreground/30 hover:border-primary"
                            }`}
                          >
                            {item.status === "completed" && (
                              <Check className="w-3 h-3" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm font-medium ${
                                item.status === "completed"
                                  ? "line-through text-muted-foreground"
                                  : ""
                              }`}
                            >
                              {item.title}
                            </p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {item.description}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                              {item.assigned_to && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {staffName(item.assigned_to)}
                                </span>
                              )}
                              {item.due_date && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {formatDate(item.due_date)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add item inline */}
                  {addingCategory === cat.key ? (
                    <div className="mt-3 border rounded-lg p-3 space-y-3">
                      <div>
                        <Label htmlFor="new-title">Title *</Label>
                        <Input
                          id="new-title"
                          placeholder="Item title"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div>
                        <Label htmlFor="new-desc">Description</Label>
                        <Input
                          id="new-desc"
                          placeholder="Optional description"
                          value={newDesc}
                          onChange={(e) => setNewDesc(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Assign To</Label>
                          <Select
                            value={newAssignee}
                            onValueChange={setNewAssignee}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select staff" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Unassigned</SelectItem>
                              {staff.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.full_name ?? "Unnamed"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="new-due">Due Date</Label>
                          <Input
                            id="new-due"
                            type="date"
                            value={newDueDate}
                            onChange={(e) => setNewDueDate(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAddingCategory(null);
                            setNewTitle("");
                            setNewDesc("");
                            setNewAssignee("");
                            setNewDueDate("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={addItem}
                          disabled={!newTitle.trim()}
                        >
                          Add Item
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAddingCategory(cat.key)}
                      className="mt-2 ml-2 gap-1.5 text-muted-foreground"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Item
                    </Button>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Event Info Card ──

function EventInfoCard({ tournament: t }: { tournament: Tournament }) {
  return (
    <Card className="mb-6">
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>
              {formatDate(t.event_date)}
              {t.event_end_date && ` - ${formatDate(t.event_end_date)}`}
            </span>
          </div>
          {t.expected_players && (
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>{t.expected_players} expected players</span>
            </div>
          )}
          {t.format && (
            <div className="flex items-center gap-2 text-sm">
              <Trophy className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>{t.format}</span>
            </div>
          )}
          {t.first_tee_time && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>
                {formatTime(t.first_tee_time)}
                {t.shotgun_start && " (Shotgun Start)"}
              </span>
            </div>
          )}
        </div>

        {(t.contact_name || t.contact_phone || t.contact_email) && (
          <div className="border-t pt-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Contact
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {t.contact_name && (
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  {t.contact_name}
                </span>
              )}
              {t.contact_phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                  {t.contact_phone}
                </span>
              )}
              {t.contact_email && (
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                  {t.contact_email}
                </span>
              )}
            </div>
          </div>
        )}

        {t.notes && (
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Notes
            </p>
            <p className="text-sm whitespace-pre-wrap">{t.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Edit Form ──

function EditForm({
  tournament,
  onSave,
  onCancel,
}: {
  tournament: Tournament;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tournament.name);
  const [eventDate, setEventDate] = useState(tournament.event_date);
  const [endDate, setEndDate] = useState(tournament.event_end_date ?? "");
  const [eventType, setEventType] = useState(tournament.event_type);
  const [format, setFormat] = useState(tournament.format ?? "");
  const [players, setPlayers] = useState(
    tournament.expected_players?.toString() ?? ""
  );
  const [shotgun, setShotgun] = useState(tournament.shotgun_start);
  const [teeTime, setTeeTime] = useState(tournament.first_tee_time ?? "");
  const [contactName, setContactName] = useState(tournament.contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(tournament.contact_phone ?? "");
  const [contactEmail, setContactEmail] = useState(tournament.contact_email ?? "");
  const [notes, setNotes] = useState(tournament.notes ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !eventDate) return;
    setSaving(true);
    const data: Record<string, unknown> = {
      name: name.trim(),
      event_date: eventDate,
      event_end_date: endDate || null,
      event_type: eventType,
      format: format.trim() || null,
      expected_players: players ? parseInt(players, 10) : null,
      shotgun_start: shotgun,
      first_tee_time: teeTime || null,
      contact_name: contactName.trim() || null,
      contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null,
      notes: notes.trim() || null,
    };
    await onSave(data);
    setSaving(false);
  };

  return (
    <Card className="mb-6">
      <CardContent className="pt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="edit-name">Event Name *</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-date">Start Date *</Label>
            <Input
              id="edit-date"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-end-date">End Date</Label>
            <Input
              id="edit-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Event Type</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(eventTypeLabels).map(([val, label]) => (
                  <SelectItem key={val} value={val}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="edit-format">Format</Label>
            <Input
              id="edit-format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-players">Expected Players</Label>
            <Input
              id="edit-players"
              type="number"
              min={1}
              value={players}
              onChange={(e) => setPlayers(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-tee">First Tee Time</Label>
            <Input
              id="edit-tee"
              type="time"
              value={teeTime}
              onChange={(e) => setTeeTime(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <Switch
              checked={shotgun}
              onCheckedChange={setShotgun}
              id="edit-shotgun"
            />
            <Label htmlFor="edit-shotgun" className="cursor-pointer">
              Shotgun Start
            </Label>
          </div>
          <div className="sm:col-span-2 border-t pt-4">
            <p className="text-sm font-medium text-muted-foreground mb-3">
              Contact Info
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="edit-cname">Name</Label>
                <Input
                  id="edit-cname"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="edit-cphone">Phone</Label>
                <Input
                  id="edit-cphone"
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="edit-cemail">Email</Label>
                <Input
                  id="edit-cemail"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim() || !eventDate}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="text-sm text-muted-foreground animate-pulse">Loading…</div></div>}>
      <PageContent />
    </Suspense>
  );
}
