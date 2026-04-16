"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import type {
  InspectionChecklist,
  InspectionItem,
  InspectionCategory,
  InspectionItemStatus,
} from "@/types/database";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Plus,
  Camera,
  CheckCircle2,
  Circle,
  AlertTriangle,
  MinusCircle,
  Loader2,
  Calendar,
  User,
  Trash2,
  Archive,
} from "lucide-react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Default checklist items per category
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DefaultItem {
  category: InspectionCategory;
  title: string;
  description: string | null;
}

const DEFAULT_ITEMS: DefaultItem[] = [
  // Course Conditions
  { category: "course_conditions", title: "Greens mowing height within USGA spec", description: null },
  { category: "course_conditions", title: "Greens speed measured and documented (stimpmeter)", description: null },
  { category: "course_conditions", title: "Fairway conditions acceptable (no bare spots >1 sq ft)", description: null },
  { category: "course_conditions", title: "Bunkers raked and edged", description: null },
  { category: "course_conditions", title: "Tee markers aligned and in good repair", description: null },
  { category: "course_conditions", title: "Cart paths clear of debris and damage", description: null },
  { category: "course_conditions", title: "Rough heights consistent across holes", description: null },
  { category: "course_conditions", title: "Practice facility in playable condition", description: null },
  // Safety
  { category: "safety", title: "Lightning detection/warning system operational", description: null },
  { category: "safety", title: "First aid kits stocked at maintenance facility and clubhouse", description: null },
  { category: "safety", title: "MSDS/SDS sheets accessible and current", description: null },
  { category: "safety", title: "Chemical storage properly secured and ventilated", description: null },
  { category: "safety", title: "PPE available and in good condition", description: null },
  { category: "safety", title: "Emergency action plan posted and current", description: null },
  { category: "safety", title: "Fire extinguishers inspected and tagged", description: null },
  // Environmental
  { category: "environmental", title: "Pesticide application records complete (link to IL RUP)", description: null },
  { category: "environmental", title: "Buffer zones marked around water features", description: null },
  { category: "environmental", title: "Stormwater BMPs in place and maintained", description: null },
  { category: "environmental", title: "Fuel/oil storage has secondary containment", description: null },
  { category: "environmental", title: "Waste disposal documented", description: null },
  { category: "environmental", title: "IPM plan current and documented", description: null },
  { category: "environmental", title: "Wildlife habitat areas identified and protected", description: null },
  // Equipment
  { category: "equipment", title: "All equipment has current service records", description: null },
  { category: "equipment", title: "Pre-operation inspection forms being used", description: null },
  { category: "equipment", title: "Fuel storage area clean and compliant", description: null },
  { category: "equipment", title: "Equipment storage area organized", description: null },
  { category: "equipment", title: "Safety guards/shields in place on all equipment", description: null },
  // Facilities
  { category: "facilities", title: "Maintenance building clean and organized", description: null },
  { category: "facilities", title: "Restrooms on course clean and stocked", description: null },
  { category: "facilities", title: "Signage in good condition", description: null },
  { category: "facilities", title: "Irrigation system controllers accessible", description: null },
  { category: "facilities", title: "Pump station operational and documented", description: null },
  // Documentation
  { category: "documentation", title: "Annual maintenance plan on file", description: null },
  { category: "documentation", title: "Budget vs actual expenses current", description: null },
  { category: "documentation", title: "Staff certifications and licenses current", description: null },
  { category: "documentation", title: "Training records documented", description: null },
  { category: "documentation", title: "Irrigation as-built drawings available", description: null },
];

const CATEGORY_META: Record<InspectionCategory, { label: string; accent: string }> = {
  course_conditions: { label: "Course Conditions", accent: "bg-emerald-500" },
  safety: { label: "Safety", accent: "bg-red-500" },
  environmental: { label: "Environmental", accent: "bg-teal-500" },
  equipment: { label: "Equipment", accent: "bg-orange-500" },
  facilities: { label: "Facilities", accent: "bg-blue-500" },
  documentation: { label: "Documentation", accent: "bg-violet-500" },
};

const CATEGORY_ORDER: InspectionCategory[] = [
  "course_conditions",
  "safety",
  "environmental",
  "equipment",
  "facilities",
  "documentation",
];

const STATUS_CYCLE: InspectionItemStatus[] = [
  "not_started",
  "in_progress",
  "compliant",
  "non_compliant",
  "na",
];

function statusIcon(status: InspectionItemStatus) {
  switch (status) {
    case "compliant":
      return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    case "in_progress":
      return <Loader2 className="w-5 h-5 text-amber-500" />;
    case "non_compliant":
      return <AlertTriangle className="w-5 h-5 text-red-500" />;
    case "na":
      return <MinusCircle className="w-5 h-5 text-muted-foreground/50" />;
    default:
      return <Circle className="w-5 h-5 text-muted-foreground/40" />;
  }
}

function statusLabel(status: InspectionItemStatus) {
  switch (status) {
    case "compliant":
      return "Compliant";
    case "in_progress":
      return "In Progress";
    case "non_compliant":
      return "Non-Compliant";
    case "na":
      return "N/A";
    default:
      return "Not Started";
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Score Ring
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ScoreRing({ score }: { score: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 80
      ? "text-emerald-500"
      : score >= 60
        ? "text-amber-500"
        : "text-red-500";

  return (
    <div className="relative w-32 h-32 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted-foreground/10"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${color} transition-all duration-500`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold ${color}`}>{score}%</span>
        <span className="text-xs text-muted-foreground">Ready</span>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Loading skeleton
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LoadingSkeleton() {
  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto animate-pulse space-y-4">
      <div className="h-6 w-48 bg-muted rounded" />
      <div className="h-4 w-64 bg-muted rounded" />
      <div className="h-32 w-32 mx-auto bg-muted rounded-full" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="h-5 w-40 bg-muted rounded" />
          <div className="h-4 w-full bg-muted rounded" />
          <div className="h-4 w-3/4 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category Section
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CategorySection({
  category,
  items,
  onToggleStatus,
  onUpdateNotes,
}: {
  category: InspectionCategory;
  items: InspectionItem[];
  onToggleStatus: (item: InspectionItem) => void;
  onUpdateNotes: (itemId: string, notes: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const meta = CATEGORY_META[category];
  const compliant = items.filter(
    (i) => i.status === "compliant" || i.status === "na"
  ).length;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className={`w-1.5 h-4 rounded-full ${meta.accent}`} />
        <h3 className="text-sm font-semibold flex-1 text-left">{meta.label}</h3>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            compliant === items.length
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {compliant}/{items.length}
        </span>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <div className="divide-y divide-border/50">
          {items.map((item) => (
            <ChecklistItem
              key={item.id}
              item={item}
              onToggleStatus={onToggleStatus}
              onUpdateNotes={onUpdateNotes}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Checklist Item
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ChecklistItem({
  item,
  onToggleStatus,
  onUpdateNotes,
}: {
  item: InspectionItem;
  onToggleStatus: (item: InspectionItem) => void;
  onUpdateNotes: (itemId: string, notes: string) => void;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const [localNotes, setLocalNotes] = useState(item.notes || "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNotesChange = (value: string) => {
    setLocalNotes(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdateNotes(item.id, value);
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggleStatus(item)}
          className="mt-0.5 shrink-0 active:scale-90 transition-transform"
          title={`Status: ${statusLabel(item.status)}. Tap to cycle.`}
        >
          {statusIcon(item.status)}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">{item.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {statusLabel(item.status)}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            title="Add notes"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
          <button
            className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            title="Attach photo"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>
      </div>
      {showNotes && (
        <div className="mt-2 ml-8">
          <textarea
            value={localNotes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Add notes..."
            rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          />
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Page
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function InspectionsPage() {
  const { profile, user, loading: authLoading } = useAuth();
  const [checklist, setChecklist] = useState<InspectionChecklist | null>(null);
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAllowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  // ── Fetch active checklist ──
  const fetchChecklist = useCallback(async () => {
    const supabase = createClient();
    const { data: checklists } = await supabase
      .from("inspection_checklists")
      .select("*")
      .in("status", ["draft", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(1);

    const active = checklists?.[0] as InspectionChecklist | undefined;
    if (active) {
      setChecklist(active);
      const { data: itemsData } = await supabase
        .from("inspection_items")
        .select("*")
        .eq("checklist_id", active.id)
        .order("sort_order", { ascending: true });
      setItems((itemsData || []) as InspectionItem[]);
    } else {
      setChecklist(null);
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading) fetchChecklist(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [authLoading, fetchChecklist]);

  // ── Create new inspection ──
  const createInspection = async () => {
    if (!user) return;
    setCreating(true);
    const supabase = createClient();

    const { data: newChecklist, error: clErr } = await supabase
      .from("inspection_checklists")
      .insert({
        name: "Command Inspection",
        status: "draft",
        created_by: user.id,
      })
      .select()
      .single();

    if (clErr || !newChecklist) {
      setCreating(false);
      return;
    }

    const cl = newChecklist as InspectionChecklist;

    const itemRows = DEFAULT_ITEMS.map((d, idx) => ({
      checklist_id: cl.id,
      category: d.category,
      title: d.title,
      description: d.description,
      status: "not_started" as const,
      notes: null,
      photo_ids: [],
      sort_order: idx,
    }));

    const { data: insertedItems } = await supabase
      .from("inspection_items")
      .insert(itemRows)
      .select();

    setChecklist(cl);
    setItems((insertedItems || []) as InspectionItem[]);
    setCreating(false);
  };

  // ── Delete checklist ──
  const deleteChecklist = async () => {
    if (!checklist) return;
    setDeleting(true);
    const supabase = createClient();
    await supabase.from("inspection_checklists").delete().eq("id", checklist.id);
    setChecklist(null);
    setItems([]);
    setDeleting(false);
  };

  // ── Toggle item status (optimistic) ──
  const toggleStatus = useCallback(
    (item: InspectionItem) => {
      const currentIdx = STATUS_CYCLE.indexOf(item.status);
      const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];

      // Optimistic update
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: nextStatus } : i))
      );

      // Persist
      const supabase = createClient();
      supabase
        .from("inspection_items")
        .update({ status: nextStatus })
        .eq("id", item.id)
        .then();
    },
    []
  );

  // ── Update item notes ──
  const updateNotes = useCallback((itemId: string, notes: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, notes } : i))
    );
    const supabase = createClient();
    supabase
      .from("inspection_items")
      .update({ notes })
      .eq("id", itemId)
      .then();
  }, []);

  // ── Update checklist fields ──
  const updateChecklistField = useCallback(
    (field: "inspection_date" | "inspector_name", value: string) => {
      if (!checklist) return;
      setChecklist((prev) => (prev ? { ...prev, [field]: value || null } : prev));
      const supabase = createClient();
      supabase
        .from("inspection_checklists")
        .update({ [field]: value || null })
        .eq("id", checklist.id)
        .then();
    },
    [checklist]
  );

  // ── Calculate score ──
  const score = (() => {
    const scorable = items.filter((i) => i.status !== "na");
    if (scorable.length === 0) return 0;
    const compliant = scorable.filter((i) => i.status === "compliant").length;
    return Math.round((compliant / scorable.length) * 100);
  })();

  // Persist score when it changes
  useEffect(() => {
    if (!checklist || score === checklist.score) return;
    const supabase = createClient();
    supabase
      .from("inspection_checklists")
      .update({ score })
      .eq("id", checklist.id)
      .then();
  }, [score, checklist]);

  // ── Group items by category ──
  const grouped = CATEGORY_ORDER.reduce(
    (acc, cat) => {
      acc[cat] = items.filter((i) => i.category === cat);
      return acc;
    },
    {} as Record<InspectionCategory, InspectionItem[]>
  );

  // ── Auth guard ──
  if (authLoading || loading) return <LoadingSkeleton />;

  if (!isAllowed) {
    return (
      <div className="p-4 pb-24 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/more"
            className="p-2 -ml-2 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Inspection Readiness</h1>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <ClipboardCheck className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">
            Only superintendents, assistant superintendents, and directors can
            access inspection checklists.
          </p>
        </div>
      </div>
    );
  }

  // ── No active checklist ──
  if (!checklist) {
    return (
      <div className="p-4 pb-24 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/more"
            className="p-2 -ml-2 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Inspection Readiness</h1>
            <p className="text-xs text-muted-foreground">
              Command inspection preparation checklist
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
          <ClipboardCheck className="w-16 h-16 mx-auto text-indigo-500/40" />
          <div>
            <h2 className="text-lg font-semibold">No Active Inspection</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Start a new inspection checklist to prepare for a command
              inspection.
            </p>
          </div>
          <button
            onClick={createInspection}
            disabled={creating}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Create New Inspection
          </button>
        </div>

        {/* Asset Inventory link */}
        <Link
          href="/inspections/asset-inventory"
          className="mt-4 block rounded-2xl border border-border bg-card p-5 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Archive className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold">FY26 Asset Inventory</h3>
              <p className="text-xs text-muted-foreground">Link barcodes, verify assets, document condition</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground/40" />
          </div>
        </Link>
      </div>
    );
  }

  // ── Active checklist view ──
  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/more"
          className="p-2 -ml-2 rounded-xl hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Inspection Readiness</h1>
          <p className="text-xs text-muted-foreground">
            Command inspection preparation checklist
          </p>
        </div>
        <button
          onClick={deleteChecklist}
          disabled={deleting}
          className="p-2 rounded-xl hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
          title="Delete this inspection"
        >
          {deleting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Trash2 className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Score + Meta card */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <ScoreRing score={score} />

        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
            <label className="text-sm text-muted-foreground shrink-0 w-28">
              Inspection Date
            </label>
            <input
              type="date"
              value={checklist.inspection_date || ""}
              onChange={(e) =>
                updateChecklistField("inspection_date", e.target.value)
              }
              className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-3">
            <User className="w-4 h-4 text-muted-foreground shrink-0" />
            <label className="text-sm text-muted-foreground shrink-0 w-28">
              Inspector
            </label>
            <input
              type="text"
              value={checklist.inspector_name || ""}
              onChange={(e) =>
                updateChecklistField("inspector_name", e.target.value)
              }
              placeholder="Name or unit"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      </div>

      {/* Asset Inventory link */}
      <Link
        href="/inspections/asset-inventory"
        className="block rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4 hover:shadow-md transition-shadow"
      >
        <div className="flex items-center gap-3">
          <Archive className="w-5 h-5 text-amber-600" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold">FY26 Asset Inventory</h3>
            <p className="text-[11px] text-muted-foreground">Link barcodes & verify all assets</p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground/40" />
        </div>
      </Link>

      {/* Status legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Circle className="w-3.5 h-3.5 text-muted-foreground/40" /> Not Started
        </span>
        <span className="flex items-center gap-1">
          <Loader2 className="w-3.5 h-3.5 text-amber-500" /> In Progress
        </span>
        <span className="flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Compliant
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Non-Compliant
        </span>
        <span className="flex items-center gap-1">
          <MinusCircle className="w-3.5 h-3.5 text-muted-foreground/50" /> N/A
        </span>
      </div>

      {/* Category sections */}
      {CATEGORY_ORDER.map((cat) => {
        const catItems = grouped[cat];
        if (!catItems || catItems.length === 0) return null;
        return (
          <CategorySection
            key={cat}
            category={cat}
            items={catItems}
            onToggleStatus={toggleStatus}
            onUpdateNotes={updateNotes}
          />
        );
      })}
    </div>
  );
}
