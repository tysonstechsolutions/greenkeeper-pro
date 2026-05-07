"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { directSelectList, directInsertRow } from "@/lib/supabase/rest";
import { useAuth } from "@/lib/hooks/useAuth";
import { PageHeader } from "@/components/ui/page-header";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Trophy,
  Plus,
  Calendar,
  Users,
  Clock,
  Phone,
  Mail,
  ChevronRight,
  Loader2,
  X,
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
  created_at: string;
  checklist_total: number;
  checklist_completed: number;
}

// ── Labels / Colors ──

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

// ── Component ──

export default function TournamentsPage() {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("upcoming");

  // Form state
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formType, setFormType] = useState("tournament");
  const [formFormat, setFormFormat] = useState("");
  const [formPlayers, setFormPlayers] = useState("");
  const [formShotgun, setFormShotgun] = useState(false);
  const [formTeeTime, setFormTeeTime] = useState("");
  const [formContactName, setFormContactName] = useState("");
  const [formContactPhone, setFormContactPhone] = useState("");
  const [formContactEmail, setFormContactEmail] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const fetchTournaments = useCallback(async () => {
    try {
      // Direct REST avoids the supabase-js auth-wrapper wedge that has
      // stuck other pages on "Loading…" after navigation.
      const tourns = await directSelectList<Record<string, unknown>>(
        "tournaments",
        {
          columns: "*",
          orderBy: [{ column: "event_date", ascending: true }],
          label: "tournaments.fetchList",
        },
      );

      if (tourns.length === 0) {
        setTournaments([]);
        setLoading(false);
        return;
      }

      // Per-tournament checklist counts. PostgREST `in.(...)` accepts
      // a comma-separated id list — encode each id so any commas inside
      // would be safe (uuid case never has them, but defensive).
      const tournIds = tourns.map((t) => t.id as string);
      const checklistCounts: Record<
        string,
        { total: number; completed: number }
      > = {};
      const items = await directSelectList<{
        tournament_id: string;
        status: string;
      }>("tournament_checklist_items", {
        columns: "tournament_id, status",
        filters: [
          `tournament_id=in.(${tournIds.map(encodeURIComponent).join(",")})`,
        ],
        label: "tournaments.fetchChecklists",
      });
      for (const item of items) {
        const tid = item.tournament_id;
        if (!checklistCounts[tid]) checklistCounts[tid] = { total: 0, completed: 0 };
        checklistCounts[tid].total++;
        if (item.status === "completed") checklistCounts[tid].completed++;
      }

      const mapped: Tournament[] = tourns.map((t) => ({
        ...t,
        checklist_total: checklistCounts[t.id as string]?.total ?? 0,
        checklist_completed: checklistCounts[t.id as string]?.completed ?? 0,
      })) as Tournament[];

      setTournaments(mapped);
    } catch (err) {
      console.error("[tournaments] fetch failed:", err);
      setTournaments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTournaments(); }, [fetchTournaments]);

  const resetForm = () => {
    setFormName("");
    setFormDate("");
    setFormEndDate("");
    setFormType("tournament");
    setFormFormat("");
    setFormPlayers("");
    setFormShotgun(false);
    setFormTeeTime("");
    setFormContactName("");
    setFormContactPhone("");
    setFormContactEmail("");
    setFormNotes("");
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formDate) return;
    setSaving(true);

    const payload: Record<string, unknown> = {
      name: formName.trim(),
      event_date: formDate,
      event_type: formType,
      status: "planning",
      created_by: user?.id ?? null,
    };
    if (formEndDate) payload.event_end_date = formEndDate;
    if (formFormat.trim()) payload.format = formFormat.trim();
    if (formPlayers) payload.expected_players = parseInt(formPlayers, 10);
    payload.shotgun_start = formShotgun;
    if (formTeeTime) payload.first_tee_time = formTeeTime;
    if (formContactName.trim()) payload.contact_name = formContactName.trim();
    if (formContactPhone.trim()) payload.contact_phone = formContactPhone.trim();
    if (formContactEmail.trim()) payload.contact_email = formContactEmail.trim();
    if (formNotes.trim()) payload.notes = formNotes.trim();

    try {
      await directInsertRow("tournaments", payload, "tournaments.insert");
      resetForm();
      setShowForm(false);
      fetchTournaments();
    } catch (err) {
      console.error("[tournaments] insert failed:", err);
    } finally {
      setSaving(false);
    }
  };

  // ── Filtered lists ──

  const upcomingStatuses = ["planning", "confirmed", "setup"];
  const activeStatuses = ["in_progress"];
  const pastStatuses = ["completed", "cancelled"];

  const upcoming = tournaments.filter((t) => upcomingStatuses.includes(t.status));
  const active = tournaments.filter((t) => activeStatuses.includes(t.status));
  const past = tournaments.filter((t) => pastStatuses.includes(t.status));

  const currentList =
    tab === "upcoming" ? upcoming : tab === "active" ? active : past;

  return (
    <div className="p-4 pb-28 max-w-2xl mx-auto">
      <PageHeader
        title="Tournaments & Events"
        icon={Trophy}
        description="Event prep & checklists"
      >
        <Button
          size="sm"
          onClick={() => {
            setShowForm(!showForm);
            if (showForm) resetForm();
          }}
          className="gap-1.5"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancel" : "New Event"}
        </Button>
      </PageHeader>

      {/* ── New Event Form ── */}
      {showForm && (
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="name">Event Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g. Spring Charity Classic"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="event_date">Start Date *</Label>
                <Input
                  id="event_date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="event_end_date">End Date (multi-day)</Label>
                <Input
                  id="event_end_date"
                  type="date"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                />
              </div>

              <div>
                <Label>Event Type</Label>
                <Select value={formType} onValueChange={setFormType}>
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
                <Label htmlFor="format">Format</Label>
                <Input
                  id="format"
                  placeholder="e.g. Scramble, Stroke Play"
                  value={formFormat}
                  onChange={(e) => setFormFormat(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="players">Expected Players</Label>
                <Input
                  id="players"
                  type="number"
                  min={1}
                  placeholder="e.g. 144"
                  value={formPlayers}
                  onChange={(e) => setFormPlayers(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="tee_time">First Tee Time</Label>
                <Input
                  id="tee_time"
                  type="time"
                  value={formTeeTime}
                  onChange={(e) => setFormTeeTime(e.target.value)}
                />
              </div>

              <div className="sm:col-span-2 flex items-center gap-3">
                <Switch
                  checked={formShotgun}
                  onCheckedChange={setFormShotgun}
                  id="shotgun"
                />
                <Label htmlFor="shotgun" className="cursor-pointer">
                  Shotgun Start
                </Label>
              </div>

              <div className="sm:col-span-2 border-t pt-4 mt-2">
                <p className="text-sm font-medium text-muted-foreground mb-3">Contact Info</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="contact_name">Name</Label>
                    <Input
                      id="contact_name"
                      placeholder="Contact name"
                      value={formContactName}
                      onChange={(e) => setFormContactName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="contact_phone">Phone</Label>
                    <Input
                      id="contact_phone"
                      type="tel"
                      placeholder="(555) 555-1234"
                      value={formContactPhone}
                      onChange={(e) => setFormContactPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="contact_email">Email</Label>
                    <Input
                      id="contact_email"
                      type="email"
                      placeholder="email@example.com"
                      value={formContactEmail}
                      onChange={(e) => setFormContactEmail(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  placeholder="Special requirements, sponsor info, etc."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleCreate} disabled={saving || !formName.trim() || !formDate}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Event
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="upcoming">
            Upcoming{upcoming.length > 0 && ` (${upcoming.length})`}
          </TabsTrigger>
          <TabsTrigger value="active">
            Active{active.length > 0 && ` (${active.length})`}
          </TabsTrigger>
          <TabsTrigger value="past">
            Past{past.length > 0 && ` (${past.length})`}
          </TabsTrigger>
        </TabsList>

        {/* All three share the same list view */}
        {["upcoming", "active", "past"].map((tabVal) => (
          <TabsContent key={tabVal} value={tabVal}>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : currentList.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No {tabVal} events</p>
                {tabVal === "upcoming" && (
                  <p className="text-sm mt-1">Create your first event to get started.</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {currentList.map((t) => (
                  <TournamentCard key={t.id} tournament={t} />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ── Tournament Card ──

function TournamentCard({ tournament: t }: { tournament: Tournament }) {
  const pct =
    t.checklist_total > 0
      ? Math.round((t.checklist_completed / t.checklist_total) * 100)
      : 0;

  return (
    <Link href={`/tournaments/view?id=${t.id}`}>
      <Card className="hover:border-primary/20 active:scale-[0.99] transition-all cursor-pointer">
        <CardContent className="pt-4 pb-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-base truncate">{t.name}</h3>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {formatDate(t.event_date)}
                  {t.event_end_date && ` - ${formatDate(t.event_end_date)}`}
                </span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground/40 shrink-0 mt-1" />
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5">
            <Badge className={eventTypeColors[t.event_type] ?? eventTypeColors.other}>
              {eventTypeLabels[t.event_type] ?? t.event_type}
            </Badge>
            <Badge className={statusColors[t.status] ?? statusColors.planning}>
              {statusLabels[t.status] ?? t.status}
            </Badge>
          </div>

          {/* Details row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {t.expected_players && (
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {t.expected_players} players
              </span>
            )}
            {t.format && <span>{t.format}</span>}
            {t.first_tee_time && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatTime(t.first_tee_time)}
                {t.shotgun_start && " (Shotgun)"}
              </span>
            )}
          </div>

          {/* Contact */}
          {(t.contact_name || t.contact_phone || t.contact_email) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground border-t pt-2">
              {t.contact_name && <span>{t.contact_name}</span>}
              {t.contact_phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {t.contact_phone}
                </span>
              )}
              {t.contact_email && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  {t.contact_email}
                </span>
              )}
            </div>
          )}

          {/* Progress bar */}
          {t.checklist_total > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Checklist</span>
                <span>
                  {t.checklist_completed}/{t.checklist_total} ({pct}%)
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
