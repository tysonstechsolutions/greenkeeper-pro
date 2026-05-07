"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  directSelectList,
  directInsertRow,
  directPatchRow,
} from "@/lib/supabase/rest";
import { useAuth } from "@/lib/hooks/useAuth";
import { todayLocal } from "@/lib/utils/date";
import type {
  EnvironmentalLog,
  BufferZoneRecord,
  ComplianceLogCategory,
  ComplianceSeverity,
} from "@/types/database";
import {
  ArrowLeft,
  Plus,
  Leaf,
  Droplets,
  ShieldAlert,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  FileText,
  Filter,
  ChevronDown,
  FileCheck,
  ChevronRight,
} from "lucide-react";

// ── Constants ──

const CATEGORIES: { value: ComplianceLogCategory; label: string; color: string }[] = [
  { value: "stormwater", label: "Stormwater", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  { value: "discharge", label: "Discharge", color: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400" },
  { value: "buffer_zone", label: "Buffer Zone", color: "bg-green-500/15 text-green-700 dark:text-green-400" },
  { value: "spill", label: "Spill", color: "bg-red-500/15 text-red-700 dark:text-red-400" },
  { value: "waste_disposal", label: "Waste Disposal", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  { value: "fuel_storage", label: "Fuel Storage", color: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
  { value: "wildlife", label: "Wildlife", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
];

const SEVERITIES: { value: ComplianceSeverity; label: string; dot: string }[] = [
  { value: "routine", label: "Routine", dot: "bg-slate-400" },
  { value: "minor", label: "Minor", dot: "bg-yellow-500" },
  { value: "major", label: "Major", dot: "bg-orange-500" },
  { value: "critical", label: "Critical", dot: "bg-red-500" },
];

const ZONE_STATUSES = [
  { value: "compliant" as const, label: "Compliant", color: "bg-green-500/15 text-green-700 dark:text-green-400" },
  { value: "non_compliant" as const, label: "Non-Compliant", color: "bg-red-500/15 text-red-700 dark:text-red-400" },
  { value: "needs_review" as const, label: "Needs Review", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
];

const DEFAULT_BUFFER_ZONES: Omit<BufferZoneRecord, "id" | "created_at" | "updated_at">[] = [
  { zone_name: "Pond #3 (Holes 3-4)", water_feature: "Pond", buffer_distance_ft: 50, last_inspected: null, inspected_by: null, status: "needs_review", vegetation_condition: null, notes: null },
  { zone_name: "Creek Crossing (Hole 7)", water_feature: "Creek", buffer_distance_ft: 25, last_inspected: null, inspected_by: null, status: "needs_review", vegetation_condition: null, notes: null },
  { zone_name: "Drainage Ditch (Holes 12-13)", water_feature: "Drainage Ditch", buffer_distance_ft: 25, last_inspected: null, inspected_by: null, status: "needs_review", vegetation_condition: null, notes: null },
  { zone_name: "Retention Basin (Maintenance Yard)", water_feature: "Retention Basin", buffer_distance_ft: 50, last_inspected: null, inspected_by: null, status: "needs_review", vegetation_condition: null, notes: null },
];

function today() {
  return todayLocal();
}

function categoryInfo(cat: ComplianceLogCategory) {
  return CATEGORIES.find((c) => c.value === cat) || CATEGORIES[0];
}

function severityInfo(sev: ComplianceSeverity) {
  return SEVERITIES.find((s) => s.value === sev) || SEVERITIES[0];
}

function zoneStatusInfo(status: BufferZoneRecord["status"]) {
  return ZONE_STATUSES.find((s) => s.value === status) || ZONE_STATUSES[2];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LOG TAB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LogTab({ userId }: { userId: string }) {
  const [logs, setLogs] = useState<EnvironmentalLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<ComplianceLogCategory | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formCategory, setFormCategory] = useState<ComplianceLogCategory>("stormwater");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSeverity, setFormSeverity] = useState<ComplianceSeverity>("routine");
  const [formDate, setFormDate] = useState(today());
  const [formLocation, setFormLocation] = useState("");
  const [formHoles, setFormHoles] = useState("");
  const [formCorrective, setFormCorrective] = useState("");
  const [formDeadline, setFormDeadline] = useState("");
  const [formNpdes, setFormNpdes] = useState(false);
  const [formNotes, setFormNotes] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const filters: string[] = [];
      if (filterCat !== "all") {
        filters.push(`category=eq.${encodeURIComponent(filterCat)}`);
      }
      const data = await directSelectList<EnvironmentalLog>(
        "environmental_logs",
        {
          columns: "*",
          filters,
          orderBy: [{ column: "date_observed", ascending: false }],
          label: "environmental.fetchLogs",
        },
      );
      setLogs(data);
    } catch (err) {
      console.error("[environmental] fetchLogs failed:", err);
    } finally {
      setLoading(false);
    }
  }, [filterCat]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const resetForm = () => {
    setFormCategory("stormwater");
    setFormTitle("");
    setFormDescription("");
    setFormSeverity("routine");
    setFormDate(today());
    setFormLocation("");
    setFormHoles("");
    setFormCorrective("");
    setFormDeadline("");
    setFormNpdes(false);
    setFormNotes("");
  };

  const handleSave = async () => {
    if (!formTitle.trim()) return;
    setSaving(true);

    const holeNums = formHoles
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0 && n <= 18);

    try {
      await directInsertRow(
        "environmental_logs",
        {
          category: formCategory,
          title: formTitle.trim(),
          description: formDescription.trim() || null,
          severity: formSeverity,
          date_observed: formDate,
          location: formLocation.trim() || null,
          hole_numbers: holeNums,
          corrective_action: formCorrective.trim() || null,
          corrective_deadline: formDeadline || null,
          npdes_reportable: formNpdes,
          notes: formNotes.trim() || null,
          reported_by: userId,
          photo_ids: [],
        },
        "environmental.insertLog",
      );
    } catch (err) {
      console.error("[environmental] insertLog failed:", err);
    }

    resetForm();
    setShowForm(false);
    setSaving(false);
    fetchLogs();
  };

  const handleResolve = async (logId: string) => {
    try {
      await directPatchRow(
        "environmental_logs",
        "id",
        logId,
        { resolved_at: new Date().toISOString(), resolved_by: userId },
        "environmental.resolveLog",
      );
      fetchLogs();
    } catch (err) {
      console.error("[environmental] resolve failed:", err);
    }
  };

  const filtered = logs;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { setShowForm(true); resetForm(); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" /> Add Entry
        </button>
        <div className="relative ml-auto">
          <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value as ComplianceLogCategory | "all")}
            className="pl-9 pr-8 py-2 rounded-xl border border-border bg-card text-sm appearance-none cursor-pointer"
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Add Entry Form */}
      {showForm && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">New Compliance Entry</h3>
            <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-muted">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Category *</label>
              <select value={formCategory} onChange={(e) => setFormCategory(e.target.value as ComplianceLogCategory)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm">
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Severity *</label>
              <select value={formSeverity} onChange={(e) => setFormSeverity(e.target.value as ComplianceSeverity)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm">
                {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
            <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Brief description of the event" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={2} placeholder="Detailed description..." className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date Observed *</label>
              <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Location</label>
              <input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="e.g. Hole 7 creek bank" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Hole Numbers (comma-separated)</label>
            <input value={formHoles} onChange={(e) => setFormHoles(e.target.value)} placeholder="e.g. 3, 4, 7" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Corrective Action</label>
            <textarea value={formCorrective} onChange={(e) => setFormCorrective(e.target.value)} rows={2} placeholder="Steps taken or planned..." className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Corrective Deadline</label>
              <input type="date" value={formDeadline} onChange={(e) => setFormDeadline(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <button
                type="button"
                onClick={() => setFormNpdes(!formNpdes)}
                className={`relative w-11 h-6 rounded-full transition-colors ${formNpdes ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${formNpdes ? "translate-x-5" : ""}`} />
              </button>
              <label className="text-sm font-medium">NPDES Reportable</label>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
            <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} placeholder="Additional notes..." className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none" />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || !formTitle.trim()}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {saving ? "Saving..." : "Save Entry"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Log List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Leaf className="w-10 h-10 mb-2 opacity-40" />
          <p className="text-sm">No compliance entries yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => {
            const cat = categoryInfo(log.category);
            const sev = severityInfo(log.severity);
            const isResolved = !!log.resolved_at;
            return (
              <div key={log.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${sev.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cat.color}`}>{cat.label}</span>
                      {log.npdes_reportable && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/15 text-red-700 dark:text-red-400">NPDES</span>
                      )}
                      {isResolved ? (
                        <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Resolved
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Open
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-sm">{log.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{log.date_observed}</span>
                      {log.location && <span>{log.location}</span>}
                      {log.hole_numbers.length > 0 && (
                        <span>Holes: {log.hole_numbers.join(", ")}</span>
                      )}
                    </div>
                    {log.corrective_action && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        Action: {log.corrective_action}
                      </p>
                    )}
                  </div>
                  {!isResolved && (
                    <button
                      onClick={() => handleResolve(log.id)}
                      className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-green-500/10 hover:border-green-500/30 text-muted-foreground hover:text-green-700 dark:hover:text-green-400 transition-colors"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BUFFER ZONES TAB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function BufferZonesTab({ userId }: { userId: string }) {
  const [zones, setZones] = useState<BufferZoneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formFeature, setFormFeature] = useState("");
  const [formDistance, setFormDistance] = useState("25");
  const [formStatus, setFormStatus] = useState<BufferZoneRecord["status"]>("needs_review");
  const [formVegetation, setFormVegetation] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const fetchZones = useCallback(async () => {
    setLoading(true);
    try {
      const data = await directSelectList<BufferZoneRecord>("buffer_zones", {
        columns: "*",
        orderBy: [{ column: "zone_name", ascending: true }],
        label: "environmental.fetchZones",
      });
      setZones(data);
    } catch (err) {
      console.error("[environmental] fetchZones failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  const seedDefaults = async () => {
    for (const zone of DEFAULT_BUFFER_ZONES) {
      try {
        await directInsertRow(
          "buffer_zones",
          {
            zone_name: zone.zone_name,
            water_feature: zone.water_feature,
            buffer_distance_ft: zone.buffer_distance_ft,
            status: zone.status,
          },
          "environmental.seedDefaults",
        );
      } catch (err) {
        console.error("[environmental] seed buffer zone failed:", err);
      }
    }
    fetchZones();
  };

  const resetForm = () => {
    setFormName("");
    setFormFeature("");
    setFormDistance("25");
    setFormStatus("needs_review");
    setFormVegetation("");
    setFormNotes("");
    setEditId(null);
  };

  const startEdit = (zone: BufferZoneRecord) => {
    setEditId(zone.id);
    setFormName(zone.zone_name);
    setFormFeature(zone.water_feature);
    setFormDistance(String(zone.buffer_distance_ft));
    setFormStatus(zone.status);
    setFormVegetation(zone.vegetation_condition || "");
    setFormNotes(zone.notes || "");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formFeature.trim()) return;
    setSaving(true);

    const payload = {
      zone_name: formName.trim(),
      water_feature: formFeature.trim(),
      buffer_distance_ft: parseInt(formDistance, 10) || 25,
      status: formStatus,
      vegetation_condition: formVegetation.trim() || null,
      notes: formNotes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    try {
      if (editId) {
        await directPatchRow(
          "buffer_zones",
          "id",
          editId,
          payload,
          "environmental.updateZone",
        );
      } else {
        await directInsertRow("buffer_zones", payload, "environmental.insertZone");
      }
      resetForm();
      setShowForm(false);
      fetchZones();
    } catch (err) {
      console.error("[environmental] zone save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusToggle = async (zone: BufferZoneRecord) => {
    const order: BufferZoneRecord["status"][] = ["compliant", "needs_review", "non_compliant"];
    const idx = order.indexOf(zone.status);
    const next = order[(idx + 1) % order.length];

    try {
      await directPatchRow(
        "buffer_zones",
        "id",
        zone.id,
        {
          status: next,
          last_inspected: today(),
          inspected_by: userId,
          updated_at: new Date().toISOString(),
        },
        "environmental.toggleStatus",
      );
      fetchZones();
    } catch (err) {
      console.error("[environmental] toggleStatus failed:", err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { setShowForm(true); resetForm(); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" /> Add Buffer Zone
        </button>
        {zones.length === 0 && !loading && (
          <button
            onClick={seedDefaults}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-all"
          >
            Load Default Zones
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{editId ? "Edit Buffer Zone" : "New Buffer Zone"}</h3>
            <button onClick={() => { setShowForm(false); resetForm(); }} className="p-1 rounded-lg hover:bg-muted">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Zone Name *</label>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Pond #3 (Holes 3-4)" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Water Feature *</label>
              <input value={formFeature} onChange={(e) => setFormFeature(e.target.value)} placeholder="e.g. Pond, Creek, Ditch" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Buffer Distance (ft)</label>
              <input type="number" value={formDistance} onChange={(e) => setFormDistance(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <select value={formStatus} onChange={(e) => setFormStatus(e.target.value as BufferZoneRecord["status"])} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm">
                {ZONE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Vegetation Condition</label>
            <input value={formVegetation} onChange={(e) => setFormVegetation(e.target.value)} placeholder="e.g. Healthy native grasses" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
            <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none" />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={handleSave} disabled={saving || !formName.trim() || !formFeature.trim()} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all">
              {saving ? "Saving..." : editId ? "Update Zone" : "Save Zone"}
            </button>
            <button onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Zone Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading...</div>
      ) : zones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Droplets className="w-10 h-10 mb-2 opacity-40" />
          <p className="text-sm">No buffer zones configured</p>
          <p className="text-xs mt-1">Click &quot;Load Default Zones&quot; to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {zones.map((zone) => {
            const st = zoneStatusInfo(zone.status);
            return (
              <div key={zone.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{zone.zone_name}</p>
                    <p className="text-xs text-muted-foreground">{zone.water_feature} &mdash; {zone.buffer_distance_ft}ft buffer</p>
                  </div>
                  <button
                    onClick={() => handleStatusToggle(zone)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${st.color}`}
                  >
                    {st.label}
                  </button>
                </div>
                {zone.last_inspected && (
                  <p className="text-xs text-muted-foreground">
                    Last inspected: {zone.last_inspected}
                  </p>
                )}
                {zone.vegetation_condition && (
                  <p className="text-xs text-muted-foreground">Vegetation: {zone.vegetation_condition}</p>
                )}
                <button
                  onClick={() => startEdit(zone)}
                  className="text-xs text-primary hover:underline"
                >
                  Edit details
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SUMMARY TAB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SummaryTab() {
  const [logs, setLogs] = useState<EnvironmentalLog[]>([]);
  const [zones, setZones] = useState<BufferZoneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState(today());
  const [showPrint, setShowPrint] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    // Direct REST avoids the supabase.from() wedge that has stuck other
    // pages on "Loading..." after navigation.
    try {
      const [logs, zones] = await Promise.all([
        directSelectList<EnvironmentalLog>("environmental_logs", {
          columns: "*",
          filters: [
            `date_observed=gte.${encodeURIComponent(dateFrom)}`,
            `date_observed=lte.${encodeURIComponent(dateTo)}`,
          ],
          orderBy: [{ column: "date_observed", ascending: false }],
          label: "environmental.fetchLogs",
        }),
        directSelectList<BufferZoneRecord>("buffer_zones", {
          columns: "*",
          label: "environmental.fetchZones",
        }),
      ]);
      setLogs(logs);
      setZones(zones);
    } catch (err) {
      console.error("[environmental] fetchData failed:", err);
      setLogs([]);
      setZones([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalEntries = logs.length;
  const openIssues = logs.filter((l) => !l.resolved_at).length;
  const npdesItems = logs.filter((l) => l.npdes_reportable).length;
  const compliantZones = zones.filter((z) => z.status === "compliant").length;

  const categoryCounts = CATEGORIES.map((cat) => ({
    ...cat,
    count: logs.filter((l) => l.category === cat.value).length,
  })).filter((c) => c.count > 0);

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Date Range */}
      <div className="flex items-center gap-2 flex-wrap">
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-card text-sm" />
        <span className="text-sm text-muted-foreground">to</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-card text-sm" />
        <button
          onClick={() => setShowPrint(true)}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-all"
        >
          <FileText className="w-4 h-4" /> Export Report
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold">{totalEntries}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Entries</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 text-center">
          <p className={`text-2xl font-bold ${openIssues > 0 ? "text-amber-600" : "text-green-600"}`}>{openIssues}</p>
          <p className="text-xs text-muted-foreground mt-1">Open Issues</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 text-center">
          <p className={`text-2xl font-bold ${npdesItems > 0 ? "text-red-600" : ""}`}>{npdesItems}</p>
          <p className="text-xs text-muted-foreground mt-1">NPDES Reportable</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{compliantZones}/{zones.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Zones Compliant</p>
        </div>
      </div>

      {/* Category Breakdown */}
      {categoryCounts.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">Category Breakdown</h3>
          <div className="space-y-2">
            {categoryCounts.map((cat) => (
              <div key={cat.value} className="flex items-center gap-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cat.color}`}>{cat.label}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/60 rounded-full"
                    style={{ width: `${totalEntries > 0 ? (cat.count / totalEntries) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums w-6 text-right">{cat.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buffer Zone Status */}
      {zones.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">Buffer Zone Status</h3>
          <div className="space-y-2">
            {zones.map((zone) => {
              const st = zoneStatusInfo(zone.status);
              return (
                <div key={zone.id} className="flex items-center justify-between text-sm">
                  <span>{zone.zone_name}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Print-Friendly Report Modal */}
      {showPrint && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto">
          <div className="bg-background rounded-2xl border border-border max-w-2xl w-full p-6 my-8 print:border-0 print:shadow-none print:p-0 print:m-0 print:rounded-none print:max-w-none">
            <div className="flex items-center justify-between mb-4 print:hidden">
              <h2 className="font-bold text-lg">Environmental Compliance Report</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
                  Print
                </button>
                <button onClick={() => setShowPrint(false)} className="p-2 rounded-lg hover:bg-muted">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <div className="text-center border-b border-border pb-4">
                <h1 className="text-xl font-bold">Environmental Compliance Report</h1>
                <p className="text-muted-foreground">VMGC &mdash; {dateFrom} to {dateTo}</p>
              </div>

              <div className="grid grid-cols-4 gap-4 text-center">
                <div><p className="font-bold text-lg">{totalEntries}</p><p className="text-xs text-muted-foreground">Total</p></div>
                <div><p className="font-bold text-lg">{openIssues}</p><p className="text-xs text-muted-foreground">Open</p></div>
                <div><p className="font-bold text-lg">{npdesItems}</p><p className="text-xs text-muted-foreground">NPDES</p></div>
                <div><p className="font-bold text-lg">{compliantZones}/{zones.length}</p><p className="text-xs text-muted-foreground">Zones OK</p></div>
              </div>

              {logs.length > 0 && (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1 pr-2">Date</th>
                      <th className="text-left py-1 pr-2">Category</th>
                      <th className="text-left py-1 pr-2">Title</th>
                      <th className="text-left py-1 pr-2">Severity</th>
                      <th className="text-left py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-border/50">
                        <td className="py-1 pr-2">{log.date_observed}</td>
                        <td className="py-1 pr-2">{categoryInfo(log.category).label}</td>
                        <td className="py-1 pr-2">{log.title}</td>
                        <td className="py-1 pr-2 capitalize">{log.severity}</td>
                        <td className="py-1">{log.resolved_at ? "Resolved" : "Open"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type Tab = "log" | "buffer" | "summary";

export default function EnvironmentalCompliancePage() {
  const { profile, user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("log");

  const isAllowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="p-4 pb-24 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/more" className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Environmental Compliance</h1>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium">Access Restricted</p>
          <p className="text-sm text-muted-foreground mt-1">
            Only superintendents, assistant superintendents, and directors can access environmental compliance records.
          </p>
        </div>
      </div>
    );
  }

  const userId = user?.id || "";

  const tabs: { key: Tab; label: string }[] = [
    { key: "log", label: "Log" },
    { key: "buffer", label: "Buffer Zones" },
    { key: "summary", label: "Summary" },
  ];

  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Link href="/more" className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Environmental Compliance</h1>
          <p className="text-xs text-muted-foreground">EPA/NPDES discharge monitoring &amp; buffer zones</p>
        </div>
      </div>

      {/* AST inspections shortcut — quick access to the SP001 monthly form */}
      <Link
        href="/ast-inspections"
        className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-muted/30 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <FileCheck className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">AST Monthly Inspections</p>
          <p className="text-xs text-muted-foreground">
            STI SP001 fuel &amp; cooking-oil tank checklist &middot; download PDF
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </Link>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mt-4 mb-4 p-1 rounded-xl bg-muted/50 border border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "log" && <LogTab userId={userId} />}
      {tab === "buffer" && <BufferZonesTab userId={userId} />}
      {tab === "summary" && <SummaryTab />}
    </div>
  );
}
