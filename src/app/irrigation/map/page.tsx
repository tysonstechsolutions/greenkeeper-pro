"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import Link from "next/link";
import {
  Droplets,
  MapPin,
  Search,
  Loader2,
  X,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Flag,
  Radio,
  Filter,
  AlertCircle,
  CheckCircle2,
  FileDown,
  Wrench,
  Plus,
  History,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  directSelectList,
  directInsertRow,
  directPatchRow,
  directDeleteRow,
} from "@/lib/supabase/rest";
import { generateSprinklerReport } from "@/lib/reports/sprinkler-report";

// ── Types ─────────────────────────────────────────────────────────────────

type AreaType = "green" | "tee" | "fairway";

type IssueType =
  | "low_pressure"
  | "one_side_only"
  | "no_spray"
  | "broken"
  | "leaking"
  | "clogged"
  | "stuck_on"
  | "stuck_off"
  | "other";

type IssueSeverity = "low" | "medium" | "high";

type IssueStatus = "open" | "resolved";

type StationStatus = "unused" | "broken" | "note_only";

interface Sprinkler {
  id: string;
  satellite_num: number;
  station_num: number;
  hole_number: number;
  area_type: AreaType;
  x_pct: number;
  y_pct: number;
  label: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface SprinklerIssue {
  id: string;
  sprinkler_id: string;
  issue_type: IssueType;
  severity: IssueSeverity;
  description: string | null;
  status: IssueStatus;
  reported_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface SatelliteStation {
  id: string;
  satellite_num: number;
  station_num: number;
  status: StationStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PendingPin {
  x: number;
  y: number;
}

interface FormState {
  satellite_num: string;
  station_num: string;
  area_type: AreaType;
  label: string;
  notes: string;
}

type ViewMode = "map" | "satellite" | "sprinkler";

// ── Constants ─────────────────────────────────────────────────────────────

const HOLE_NUMBERS = Array.from({ length: 18 }, (_, i) => i + 1);

const AREA_META: Record<
  AreaType,
  { label: string; pin: string; chipBg: string; chipText: string }
> = {
  green: {
    label: "Green",
    pin: "#16a34a", // emerald-600
    chipBg: "bg-green-100 dark:bg-green-900/40",
    chipText: "text-green-800 dark:text-green-300",
  },
  tee: {
    label: "Tee",
    pin: "#65a30d", // lime-600
    chipBg: "bg-lime-100 dark:bg-lime-900/40",
    chipText: "text-lime-800 dark:text-lime-300",
  },
  fairway: {
    label: "Fairway",
    pin: "#2563eb", // blue-600
    chipBg: "bg-blue-100 dark:bg-blue-900/40",
    chipText: "text-blue-800 dark:text-blue-300",
  },
};

const EMPTY_FORM: FormState = {
  satellite_num: "",
  station_num: "",
  area_type: "green",
  label: "",
  notes: "",
};

// Issue type labels and severity ordering (high > medium > low).
const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  low_pressure: "Low pressure",
  one_side_only: "One side only",
  no_spray: "No spray",
  broken: "Broken head",
  leaking: "Leaking",
  clogged: "Clogged",
  stuck_on: "Stuck on",
  stuck_off: "Stuck off",
  other: "Other",
};

const ISSUE_TYPES: IssueType[] = [
  "low_pressure",
  "one_side_only",
  "no_spray",
  "broken",
  "leaking",
  "clogged",
  "stuck_on",
  "stuck_off",
  "other",
];

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const SEVERITY_META: Record<
  IssueSeverity,
  { label: string; chipBg: string; chipText: string; dot: string }
> = {
  low: {
    label: "Low",
    chipBg: "bg-yellow-100 dark:bg-yellow-900/40",
    chipText: "text-yellow-800 dark:text-yellow-300",
    dot: "#eab308",
  },
  medium: {
    label: "Medium",
    chipBg: "bg-orange-100 dark:bg-orange-900/40",
    chipText: "text-orange-800 dark:text-orange-300",
    dot: "#f97316",
  },
  high: {
    label: "High",
    chipBg: "bg-red-100 dark:bg-red-900/40",
    chipText: "text-red-800 dark:text-red-300",
    dot: "#dc2626",
  },
};

const STATION_STATUS_META: Record<
  StationStatus,
  { label: string; chipBg: string; chipText: string; cellBg: string }
> = {
  unused: {
    label: "Unused (no head)",
    chipBg: "bg-gray-100 dark:bg-gray-800",
    chipText: "text-gray-700 dark:text-gray-300",
    cellBg: "bg-gray-200 dark:bg-gray-700",
  },
  broken: {
    label: "Broken station",
    chipBg: "bg-red-100 dark:bg-red-900/40",
    chipText: "text-red-800 dark:text-red-300",
    cellBg: "bg-red-200 dark:bg-red-900/60",
  },
  note_only: {
    label: "Note only",
    chipBg: "bg-amber-100 dark:bg-amber-900/40",
    chipText: "text-amber-800 dark:text-amber-300",
    cellBg: "bg-amber-100 dark:bg-amber-900/40",
  },
};

/**
 * For a given sprinkler, compute its current status from open issues.
 * Returns the highest-severity open issue, or null when 'ok'.
 */
function highestOpenIssue(
  sprinklerId: string,
  issues: SprinklerIssue[],
): SprinklerIssue | null {
  const open = issues.filter(
    (i) => i.sprinkler_id === sprinklerId && i.status === "open",
  );
  if (open.length === 0) return null;
  return open.reduce((best, cur) =>
    SEVERITY_RANK[cur.severity] > SEVERITY_RANK[best.severity] ? cur : best,
  );
}

/** Latest resolved_at across this sprinkler's resolved issues. */
function lastServicedAt(
  sprinklerId: string,
  issues: SprinklerIssue[],
): string | null {
  const resolved = issues
    .filter(
      (i) =>
        i.sprinkler_id === sprinklerId &&
        i.status === "resolved" &&
        i.resolved_at,
    )
    .map((i) => i.resolved_at as string);
  if (resolved.length === 0) return null;
  return resolved.reduce((a, b) => (a > b ? a : b));
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function SprinklerMapPage() {
  // Data
  const [sprinklers, setSprinklers] = useState<Sprinkler[]>([]);
  const [issues, setIssues] = useState<SprinklerIssue[]>([]);
  const [stationNotes, setStationNotes] = useState<SatelliteStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadingReport, setDownloadingReport] = useState(false);

  // Top-level view
  const [view, setView] = useState<ViewMode>("map");

  // Map view state
  const [holeNumber, setHoleNumber] = useState(1);
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [areaFilter, setAreaFilter] = useState<"all" | AreaType>("all");
  const [satelliteFilter, setSatelliteFilter] = useState<string>("all");
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Add/edit modal
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [editingPin, setEditingPin] = useState<Sprinkler | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // By Sprinkler view search
  const [searchQuery, setSearchQuery] = useState("");

  // By Satellite view: collapsed/expanded state. Stored as an array so React
  // re-renders identify changes correctly; the consumer treats it as a set.
  const [expandedSats, setExpandedSats] = useState<number[]>([]);

  // Issues UI state (lives inside the sprinkler edit dialog)
  const [showNewIssueForm, setShowNewIssueForm] = useState(false);
  const [newIssueForm, setNewIssueForm] = useState<{
    issue_type: IssueType;
    severity: IssueSeverity;
    description: string;
  }>({ issue_type: "low_pressure", severity: "medium", description: "" });
  const [issueActionLoading, setIssueActionLoading] = useState<string | null>(
    null,
  );
  const [showHistory, setShowHistory] = useState(false);

  // Station-set-status dialog state.
  const [stationDialog, setStationDialog] = useState<
    | { satellite_num: number; station_num: number; existing: SatelliteStation | null }
    | null
  >(null);
  const [stationForm, setStationForm] = useState<{
    status: StationStatus;
    notes: string;
  }>({ status: "unused", notes: "" });
  const [stationSaving, setStationSaving] = useState(false);
  const [stationError, setStationError] = useState<string | null>(null);

  // Image container — used to compute click coordinates relative to image.
  const imageRef = useRef<HTMLDivElement>(null);

  // ── Load ────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Three parallel reads. Issues and station notes are layered on top of
      // sprinklers but loaded independently so a slow query on one doesn't
      // block the others.
      const [sprinklersData, issuesData, stationsData] = await Promise.all([
        directSelectList<Sprinkler>("irrigation_sprinklers", {
          columns: "*",
          orderBy: [
            { column: "hole_number", ascending: true },
            { column: "satellite_num", ascending: true },
            { column: "station_num", ascending: true },
          ],
          label: "sprinkler-map.load.sprinklers",
        }),
        directSelectList<SprinklerIssue>("irrigation_sprinkler_issues", {
          columns: "*",
          orderBy: [{ column: "reported_at", ascending: false }],
          label: "sprinkler-map.load.issues",
        }),
        directSelectList<SatelliteStation>("irrigation_satellite_stations", {
          columns: "*",
          orderBy: [
            { column: "satellite_num", ascending: true },
            { column: "station_num", ascending: true },
          ],
          label: "sprinkler-map.load.stations",
        }),
      ]);
      setSprinklers(sprinklersData);
      setIssues(issuesData);
      setStationNotes(stationsData);
    } catch (err) {
      console.error("Failed to load sprinkler map data:", err);
      setLoadError(
        err instanceof Error ? err.message : "Failed to load sprinkler data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset img-loaded state when switching holes.
  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
  }, [holeNumber]);

  // ── Derived data ────────────────────────────────────────────────────────

  const sprinklersOnHole = useMemo(
    () => sprinklers.filter((s) => s.hole_number === holeNumber),
    [sprinklers, holeNumber],
  );

  const visiblePinsOnHole = useMemo(() => {
    return sprinklersOnHole.filter((s) => {
      if (areaFilter !== "all" && s.area_type !== areaFilter) return false;
      if (
        satelliteFilter !== "all" &&
        s.satellite_num.toString() !== satelliteFilter
      ) {
        return false;
      }
      return true;
    });
  }, [sprinklersOnHole, areaFilter, satelliteFilter]);

  const distinctSatellites = useMemo(() => {
    const set = new Set<number>();
    for (const s of sprinklers) set.add(s.satellite_num);
    return Array.from(set).sort((a, b) => a - b);
  }, [sprinklers]);

  // For By Satellite view: nested grouping. Includes satellites that only
  // have station notes (no sprinklers), so those notes remain editable.
  const satelliteGroups = useMemo(() => {
    const groups = new Map<number, Map<number, Sprinkler[]>>();
    for (const s of sprinklers) {
      if (!groups.has(s.satellite_num)) {
        groups.set(s.satellite_num, new Map());
      }
      const stations = groups.get(s.satellite_num)!;
      if (!stations.has(s.station_num)) stations.set(s.station_num, []);
      stations.get(s.station_num)!.push(s);
    }
    // Also make sure every satellite that has station notes appears.
    for (const n of stationNotes) {
      if (!groups.has(n.satellite_num)) groups.set(n.satellite_num, new Map());
    }
    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([sat, stations]) => ({
        satellite_num: sat,
        stations: Array.from(stations.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([sta, heads]) => ({ station_num: sta, heads })),
        totalHeads: Array.from(stations.values()).reduce(
          (acc, h) => acc + h.length,
          0,
        ),
        totalStations: stations.size,
      }));
  }, [sprinklers, stationNotes]);

  // For By Sprinkler view: search results.
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return sprinklers;
    const q = searchQuery.toLowerCase().trim();
    return sprinklers.filter((s) => {
      if (s.hole_number.toString() === q) return true;
      if (s.satellite_num.toString() === q) return true;
      if (s.station_num.toString() === q) return true;
      if (s.area_type.toLowerCase().includes(q)) return true;
      if (s.label?.toLowerCase().includes(q)) return true;
      if (s.notes?.toLowerCase().includes(q)) return true;
      // Also support combined search like "sat 3 sta 12" or "hole 5 green"
      const combined = [
        `sat ${s.satellite_num}`,
        `s${s.satellite_num}`,
        `station ${s.station_num}`,
        `sta ${s.station_num}`,
        `hole ${s.hole_number}`,
        s.area_type,
        s.label ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return combined.includes(q);
    });
  }, [sprinklers, searchQuery]);

  // For showing "other heads on the same station" when editing.
  const stationMates = useMemo(() => {
    if (!editingPin) return [];
    return sprinklers.filter(
      (s) =>
        s.id !== editingPin.id &&
        s.satellite_num === editingPin.satellite_num &&
        s.station_num === editingPin.station_num,
    );
  }, [editingPin, sprinklers]);

  // Issues for the currently editing sprinkler (newest first).
  const editingPinIssues = useMemo(() => {
    if (!editingPin) return [];
    return issues
      .filter((i) => i.sprinkler_id === editingPin.id)
      .sort((a, b) => (a.reported_at < b.reported_at ? 1 : -1));
  }, [editingPin, issues]);

  const editingPinOpenIssues = useMemo(
    () => editingPinIssues.filter((i) => i.status === "open"),
    [editingPinIssues],
  );
  const editingPinResolvedIssues = useMemo(
    () => editingPinIssues.filter((i) => i.status === "resolved"),
    [editingPinIssues],
  );

  const editingPinStatus = editingPin
    ? highestOpenIssue(editingPin.id, issues)
    : null;
  const editingPinLastService = editingPin
    ? lastServicedAt(editingPin.id, issues)
    : null;

  // ── Image tap handler ──────────────────────────────────────────────────

  const handleImageTap = useCallback(
    (
      e:
        | ReactMouseEvent<HTMLDivElement>
        | ReactTouchEvent<HTMLDivElement>,
    ) => {
      // Only respond to clicks on the wrapper itself, not on bubbled events
      // from pin buttons (those use stopPropagation).
      if (!imgLoaded) return;
      // Bail if any dialog is open — keeps Cancel/Save clicks near the image
      // edge from leaking through and opening a new add-pin dialog.
      if (
        typeof document !== "undefined" &&
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }
      const container = imageRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      let clientX: number;
      let clientY: number;
      if ("touches" in e || "changedTouches" in e) {
        const touch =
          (e as ReactTouchEvent<HTMLDivElement>).changedTouches?.[0] ??
          (e as ReactTouchEvent<HTMLDivElement>).touches?.[0];
        if (!touch) return;
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        const me = e as ReactMouseEvent<HTMLDivElement>;
        clientX = me.clientX;
        clientY = me.clientY;
      }

      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

      setPendingPin({ x, y });
      setEditingPin(null);
      // Preserve last satellite_num & area for fast sequential entry; clear
      // station_num + label which differ for each new head.
      setForm((prev) => ({
        ...EMPTY_FORM,
        satellite_num: prev.satellite_num,
        area_type: prev.area_type,
      }));
      setSaveError(null);
    },
    [imgLoaded],
  );

  // ── Open edit dialog when a pin is tapped ──────────────────────────────

  const handlePinTap = useCallback((sprinkler: Sprinkler) => {
    setEditingPin(sprinkler);
    setPendingPin(null);
    setForm({
      satellite_num: sprinkler.satellite_num.toString(),
      station_num: sprinkler.station_num.toString(),
      area_type: sprinkler.area_type,
      label: sprinkler.label ?? "",
      notes: sprinkler.notes ?? "",
    });
    setSaveError(null);
  }, []);

  // ── Save (insert or update) ────────────────────────────────────────────

  const closeDialog = useCallback(() => {
    setPendingPin(null);
    setEditingPin(null);
    setSaveError(null);
    setShowNewIssueForm(false);
    setShowHistory(false);
    setNewIssueForm({
      issue_type: "low_pressure",
      severity: "medium",
      description: "",
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    const sat = parseInt(form.satellite_num, 10);
    const sta = parseInt(form.station_num, 10);
    if (!Number.isFinite(sat) || sat < 0) {
      setSaveError("Satellite number is required (a whole number).");
      return;
    }
    if (!Number.isFinite(sta) || sta < 0) {
      setSaveError("Station number is required (a whole number).");
      return;
    }
    setSaving(true);
    try {
      if (editingPin) {
        await directPatchRow(
          "irrigation_sprinklers",
          "id",
          editingPin.id,
          {
            satellite_num: sat,
            station_num: sta,
            area_type: form.area_type,
            label: form.label.trim() || null,
            notes: form.notes.trim() || null,
            updated_at: new Date().toISOString(),
          },
          "sprinkler-map.update",
        );
        // Update locally without a full reload — keeps the page snappy.
        setSprinklers((prev) =>
          prev.map((s) =>
            s.id === editingPin.id
              ? {
                  ...s,
                  satellite_num: sat,
                  station_num: sta,
                  area_type: form.area_type,
                  label: form.label.trim() || null,
                  notes: form.notes.trim() || null,
                  updated_at: new Date().toISOString(),
                }
              : s,
          ),
        );
        closeDialog();
      } else if (pendingPin) {
        const inserted = await directInsertRow<Sprinkler>(
          "irrigation_sprinklers",
          {
            satellite_num: sat,
            station_num: sta,
            hole_number: holeNumber,
            area_type: form.area_type,
            x_pct: pendingPin.x,
            y_pct: pendingPin.y,
            label: form.label.trim() || null,
            notes: form.notes.trim() || null,
          },
          "sprinkler-map.insert",
        );
        setSprinklers((prev) => [...prev, inserted]);
        // Keep satellite_num + area_type for the next add; clear pin/station.
        setForm((prev) => ({
          ...EMPTY_FORM,
          satellite_num: prev.satellite_num,
          area_type: prev.area_type,
        }));
        setPendingPin(null);
      }
    } catch (err) {
      console.error("Failed to save sprinkler:", err);
      setSaveError(
        err instanceof Error ? err.message : "Failed to save sprinkler.",
      );
    } finally {
      setSaving(false);
    }
  }, [form, editingPin, pendingPin, holeNumber, closeDialog]);

  // ── Delete ─────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!editingPin) return;
    if (
      !window.confirm(
        `Delete sprinkler Sat ${editingPin.satellite_num} / Sta ${editingPin.station_num} on hole ${editingPin.hole_number}?`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await directDeleteRow(
        "irrigation_sprinklers",
        "id",
        editingPin.id,
        "sprinkler-map.delete",
      );
      setSprinklers((prev) => prev.filter((s) => s.id !== editingPin.id));
      closeDialog();
    } catch (err) {
      console.error("Failed to delete sprinkler:", err);
      setSaveError(
        err instanceof Error ? err.message : "Failed to delete sprinkler.",
      );
    } finally {
      setSaving(false);
    }
  }, [editingPin, closeDialog]);

  // ── Issue actions ───────────────────────────────────────────────────────

  const handleAddIssue = useCallback(async () => {
    if (!editingPin) return;
    setIssueActionLoading("new");
    try {
      const inserted = await directInsertRow<SprinklerIssue>(
        "irrigation_sprinkler_issues",
        {
          sprinkler_id: editingPin.id,
          issue_type: newIssueForm.issue_type,
          severity: newIssueForm.severity,
          description: newIssueForm.description.trim() || null,
          status: "open",
        },
        "sprinkler-map.addIssue",
      );
      setIssues((prev) => [inserted, ...prev]);
      setShowNewIssueForm(false);
      setNewIssueForm({
        issue_type: "low_pressure",
        severity: "medium",
        description: "",
      });
    } catch (err) {
      console.error("Failed to add issue:", err);
      setSaveError(
        err instanceof Error ? err.message : "Failed to report issue.",
      );
    } finally {
      setIssueActionLoading(null);
    }
  }, [editingPin, newIssueForm]);

  const handleResolveIssue = useCallback(
    async (issueId: string) => {
      setIssueActionLoading(issueId);
      const resolvedAt = new Date().toISOString();
      try {
        await directPatchRow(
          "irrigation_sprinkler_issues",
          "id",
          issueId,
          {
            status: "resolved",
            resolved_at: resolvedAt,
            updated_at: resolvedAt,
          },
          "sprinkler-map.resolveIssue",
        );
        setIssues((prev) =>
          prev.map((i) =>
            i.id === issueId
              ? {
                  ...i,
                  status: "resolved" as const,
                  resolved_at: resolvedAt,
                  updated_at: resolvedAt,
                }
              : i,
          ),
        );
      } catch (err) {
        console.error("Failed to resolve issue:", err);
        setSaveError(
          err instanceof Error ? err.message : "Failed to resolve issue.",
        );
      } finally {
        setIssueActionLoading(null);
      }
    },
    [],
  );

  const handleReopenIssue = useCallback(async (issueId: string) => {
    setIssueActionLoading(issueId);
    try {
      await directPatchRow(
        "irrigation_sprinkler_issues",
        "id",
        issueId,
        {
          status: "open",
          resolved_at: null,
          updated_at: new Date().toISOString(),
        },
        "sprinkler-map.reopenIssue",
      );
      setIssues((prev) =>
        prev.map((i) =>
          i.id === issueId
            ? { ...i, status: "open" as const, resolved_at: null }
            : i,
        ),
      );
    } catch (err) {
      console.error("Failed to reopen issue:", err);
      setSaveError(
        err instanceof Error ? err.message : "Failed to reopen issue.",
      );
    } finally {
      setIssueActionLoading(null);
    }
  }, []);

  // ── Station-status actions ──────────────────────────────────────────────

  const openSetStationDialog = useCallback(
    (sat: number, sta: number) => {
      const existing =
        stationNotes.find(
          (n) => n.satellite_num === sat && n.station_num === sta,
        ) ?? null;
      setStationDialog({
        satellite_num: sat,
        station_num: sta,
        existing,
      });
      setStationForm({
        status: existing?.status ?? "unused",
        notes: existing?.notes ?? "",
      });
      setStationError(null);
    },
    [stationNotes],
  );

  const closeStationDialog = useCallback(() => {
    setStationDialog(null);
    setStationError(null);
  }, []);

  const handleSaveStation = useCallback(async () => {
    if (!stationDialog) return;
    setStationSaving(true);
    setStationError(null);
    try {
      if (stationDialog.existing) {
        await directPatchRow(
          "irrigation_satellite_stations",
          "id",
          stationDialog.existing.id,
          {
            status: stationForm.status,
            notes: stationForm.notes.trim() || null,
            updated_at: new Date().toISOString(),
          },
          "sprinkler-map.updateStation",
        );
        setStationNotes((prev) =>
          prev.map((n) =>
            n.id === stationDialog.existing!.id
              ? {
                  ...n,
                  status: stationForm.status,
                  notes: stationForm.notes.trim() || null,
                }
              : n,
          ),
        );
      } else {
        const inserted = await directInsertRow<SatelliteStation>(
          "irrigation_satellite_stations",
          {
            satellite_num: stationDialog.satellite_num,
            station_num: stationDialog.station_num,
            status: stationForm.status,
            notes: stationForm.notes.trim() || null,
          },
          "sprinkler-map.insertStation",
        );
        setStationNotes((prev) => [...prev, inserted]);
      }
      closeStationDialog();
    } catch (err) {
      console.error("Failed to save station status:", err);
      setStationError(
        err instanceof Error ? err.message : "Failed to save station status.",
      );
    } finally {
      setStationSaving(false);
    }
  }, [stationDialog, stationForm, closeStationDialog]);

  const handleClearStation = useCallback(async () => {
    if (!stationDialog?.existing) return;
    setStationSaving(true);
    try {
      await directDeleteRow(
        "irrigation_satellite_stations",
        "id",
        stationDialog.existing.id,
        "sprinkler-map.clearStation",
      );
      setStationNotes((prev) =>
        prev.filter((n) => n.id !== stationDialog.existing!.id),
      );
      closeStationDialog();
    } catch (err) {
      console.error("Failed to clear station status:", err);
      setStationError(
        err instanceof Error ? err.message : "Failed to clear station status.",
      );
    } finally {
      setStationSaving(false);
    }
  }, [stationDialog, closeStationDialog]);

  // ── Jump-to-pin from other views ───────────────────────────────────────

  const jumpToPin = useCallback((sprinkler: Sprinkler) => {
    setView("map");
    setHoleNumber(sprinkler.hole_number);
    setAreaFilter("all");
    setSatelliteFilter("all");
    setHighlightId(sprinkler.id);
    // Clear highlight after the pulse completes (~2s).
    window.setTimeout(() => setHighlightId(null), 2200);
  }, []);

  // ── Download PDF report ─────────────────────────────────────────────────

  const handleDownloadReport = useCallback(async () => {
    setDownloadingReport(true);
    try {
      const { blob, filename } = await generateSprinklerReport();
      // Trigger download via a temporary <a> element.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Slight delay before revoking — Safari sometimes hasn't started the
      // download yet when the URL is freed.
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error("Failed to generate sprinkler report:", err);
      alert(
        `Failed to generate report: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      setDownloadingReport(false);
    }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────

  const dialogOpen = pendingPin !== null || editingPin !== null;

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <PageHeader
        title="Sprinkler Map"
        description="Which Rainbird satellite + station controls each head"
        icon={Droplets}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadReport}
          disabled={downloadingReport || loading}
          title="Download PDF report with open issues, full inventory, and station grids"
        >
          {downloadingReport ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileDown className="w-4 h-4" />
          )}
          <span className="hidden lg:inline">Download Report</span>
        </Button>
        <Link
          href="/irrigation"
          title="Back to Irrigation"
          className="inline-flex items-center justify-center gap-1.5 h-10 rounded-md px-4 text-sm font-medium border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden lg:inline">Back to Irrigation</span>
        </Link>
      </PageHeader>

      {/* View switcher — three big buttons rather than tabs for clearer
          mobile target size. */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <ViewButton
          active={view === "map"}
          onClick={() => setView("map")}
          icon={MapPin}
          label="Map"
        />
        <ViewButton
          active={view === "satellite"}
          onClick={() => setView("satellite")}
          icon={Radio}
          label="By Satellite"
        />
        <ViewButton
          active={view === "sprinkler"}
          onClick={() => setView("sprinkler")}
          icon={Search}
          label="By Sprinkler"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive font-medium mb-1">
              Couldn&apos;t load sprinkler data
            </p>
            <p className="text-xs text-muted-foreground mb-3">{loadError}</p>
            <p className="text-xs text-muted-foreground mb-3">
              If you just deployed migrations, give PostgREST a minute to
              reload schema. Otherwise check that{" "}
              <code>20260528_add_irrigation_sprinklers.sql</code> and{" "}
              <code>20260528_add_sprinkler_issues_and_stations.sql</code> are
              applied (<code>supabase db push</code>).
            </p>
            <Button size="sm" variant="outline" onClick={loadData}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {view === "map" && (
            <MapView
              holeNumber={holeNumber}
              setHoleNumber={setHoleNumber}
              sprinklersOnHole={sprinklersOnHole}
              visiblePins={visiblePinsOnHole}
              issues={issues}
              areaFilter={areaFilter}
              setAreaFilter={setAreaFilter}
              satelliteFilter={satelliteFilter}
              setSatelliteFilter={setSatelliteFilter}
              distinctSatellites={distinctSatellites}
              imageRef={imageRef}
              imgLoaded={imgLoaded}
              setImgLoaded={setImgLoaded}
              imgError={imgError}
              setImgError={setImgError}
              onImageTap={handleImageTap}
              onPinTap={handlePinTap}
              highlightId={highlightId}
            />
          )}
          {view === "satellite" && (
            <SatelliteView
              groups={satelliteGroups}
              issues={issues}
              stationNotes={stationNotes}
              expanded={expandedSats}
              setExpanded={setExpandedSats}
              onJumpToPin={jumpToPin}
              onSetStationStatus={openSetStationDialog}
            />
          )}
          {view === "sprinkler" && (
            <SprinklerSearchView
              results={searchResults}
              issues={issues}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onJumpToPin={jumpToPin}
            />
          )}
        </>
      )}

      {/* Add/Edit dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPin
                ? `Edit pin — hole ${editingPin.hole_number}`
                : `Add sprinkler — hole ${holeNumber}`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Satellite #
                </label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.satellite_num}
                  onChange={(e) =>
                    setForm({ ...form, satellite_num: e.target.value })
                  }
                  placeholder="e.g. 3"
                  autoFocus={!editingPin}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Station #
                </label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.station_num}
                  onChange={(e) =>
                    setForm({ ...form, station_num: e.target.value })
                  }
                  placeholder="e.g. 12"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Area
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["green", "tee", "fairway"] as AreaType[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setForm({ ...form, area_type: a })}
                    className={`h-10 rounded-md border text-sm font-medium transition-colors ${
                      form.area_type === a
                        ? "ring-2 ring-offset-1 ring-primary border-primary text-foreground"
                        : "border-input text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ background: AREA_META[a].pin }}
                      />
                      {AREA_META[a].label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Label{" "}
                <span className="text-muted-foreground/70">
                  (optional — e.g. &quot;back tee&quot;, &quot;front-left&quot;)
                </span>
              </label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="back tee"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Notes (optional)
              </label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>

            {/* Other heads on same station (when editing) */}
            {editingPin && stationMates.length > 0 && (
              <div className="text-xs text-muted-foreground border-t pt-2">
                Sat {editingPin.satellite_num} / Sta {editingPin.station_num}{" "}
                also fires {stationMates.length}{" "}
                {stationMates.length === 1 ? "other head" : "other heads"}:
                <div className="mt-1 flex flex-wrap gap-1">
                  {stationMates.map((sm) => (
                    <button
                      key={sm.id}
                      type="button"
                      onClick={() => jumpToPin(sm)}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-input hover:bg-accent"
                    >
                      Hole {sm.hole_number} · {sm.area_type}
                      {sm.label ? ` · ${sm.label}` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Status & Issues (only when editing an existing pin) ─── */}
            {editingPin && (
              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold">Status &amp; Issues</span>
                  </div>
                  <StatusPill openIssue={editingPinStatus} />
                </div>

                {editingPinLastService && (
                  <p className="text-[11px] text-muted-foreground">
                    Last serviced:{" "}
                    <span className="text-foreground">
                      {formatShortDate(editingPinLastService)}
                    </span>
                  </p>
                )}

                {/* Open issues */}
                {editingPinOpenIssues.length > 0 && (
                  <div className="space-y-1.5">
                    {editingPinOpenIssues.map((iss) => {
                      const sev = SEVERITY_META[iss.severity];
                      return (
                        <div
                          key={iss.id}
                          className="rounded-md border p-2 flex items-start gap-2"
                        >
                          <AlertCircle
                            className="w-3.5 h-3.5 mt-0.5 shrink-0"
                            style={{ color: sev.dot }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium">
                                {ISSUE_TYPE_LABELS[iss.issue_type]}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded ${sev.chipBg} ${sev.chipText}`}
                              >
                                {sev.label}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                Reported {formatShortDate(iss.reported_at)}
                              </span>
                            </div>
                            {iss.description && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 break-words">
                                {iss.description}
                              </p>
                            )}
                          </div>
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={issueActionLoading === iss.id}
                            onClick={() => handleResolveIssue(iss.id)}
                          >
                            {issueActionLoading === iss.id && (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            )}
                            <CheckCircle2 className="w-3 h-3" />
                            Resolve
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* New issue form */}
                {showNewIssueForm ? (
                  <div className="rounded-md border bg-muted/30 p-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-0.5 block">
                          Issue type
                        </label>
                        <Select
                          value={newIssueForm.issue_type}
                          onValueChange={(v) =>
                            setNewIssueForm({
                              ...newIssueForm,
                              issue_type: v as IssueType,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ISSUE_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {ISSUE_TYPE_LABELS[t]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-0.5 block">
                          Severity
                        </label>
                        <div className="grid grid-cols-3 gap-1">
                          {(["low", "medium", "high"] as IssueSeverity[]).map((s) => {
                            const meta = SEVERITY_META[s];
                            const active = newIssueForm.severity === s;
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() =>
                                  setNewIssueForm({ ...newIssueForm, severity: s })
                                }
                                className={`h-8 rounded border text-[11px] font-medium ${
                                  active
                                    ? `${meta.chipBg} ${meta.chipText} border-current`
                                    : "border-input text-muted-foreground hover:bg-accent"
                                }`}
                              >
                                {meta.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <Textarea
                      placeholder="Description (optional) — e.g. 'spraying weak since last Friday'"
                      value={newIssueForm.description}
                      onChange={(e) =>
                        setNewIssueForm({
                          ...newIssueForm,
                          description: e.target.value,
                        })
                      }
                      rows={2}
                      className="text-xs"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setShowNewIssueForm(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="xs"
                        onClick={handleAddIssue}
                        disabled={issueActionLoading === "new"}
                      >
                        {issueActionLoading === "new" && (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        )}
                        Save issue
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setShowNewIssueForm(true)}
                  >
                    <Plus className="w-3 h-3" />
                    Report issue
                  </Button>
                )}

                {/* History (resolved) */}
                {editingPinResolvedIssues.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowHistory(!showHistory)}
                      className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <History className="w-3 h-3" />
                      Past issues ({editingPinResolvedIssues.length})
                      <ChevronDown
                        className={`w-3 h-3 transition-transform ${
                          showHistory ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {showHistory && (
                      <div className="mt-1.5 space-y-1">
                        {editingPinResolvedIssues.map((iss) => (
                          <div
                            key={iss.id}
                            className="rounded border border-border/60 px-2 py-1 text-[11px] flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-medium">
                                {ISSUE_TYPE_LABELS[iss.issue_type]}
                              </span>{" "}
                              <span className="text-muted-foreground">
                                · reported {formatShortDate(iss.reported_at)}
                                {iss.resolved_at &&
                                  ` · resolved ${formatShortDate(iss.resolved_at)}`}
                              </span>
                              {iss.description && (
                                <p className="text-muted-foreground truncate">
                                  {iss.description}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleReopenIssue(iss.id)}
                              disabled={issueActionLoading === iss.id}
                              className="text-[10px] text-muted-foreground hover:text-foreground"
                              title="Reopen this issue"
                            >
                              {issueActionLoading === iss.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                "Reopen"
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {saveError && (
              <p className="text-xs text-destructive">{saveError}</p>
            )}
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
            {editingPin ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={saving}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2 sm:ml-auto">
              <Button variant="outline" size="sm" onClick={closeDialog}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingPin ? "Save" : "Save & add another"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Station-status dialog ─────────────────────────────────────── */}
      <Dialog
        open={stationDialog !== null}
        onOpenChange={(open) => {
          if (!open) closeStationDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {stationDialog
                ? `Set status — Sat ${stationDialog.satellite_num} / Sta ${stationDialog.station_num}`
                : "Set station status"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              This station doesn&apos;t control any mapped sprinklers. Use this
              when station #{stationDialog?.station_num} is intentionally
              unused, broken, or you just want to leave a note for later.
            </p>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Status
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["unused", "broken", "note_only"] as StationStatus[]).map(
                  (s) => {
                    const meta = STATION_STATUS_META[s];
                    const active = stationForm.status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setStationForm({ ...stationForm, status: s })
                        }
                        className={`h-12 rounded-md border text-xs font-medium px-2 ${
                          active
                            ? `${meta.chipBg} ${meta.chipText} ring-2 ring-offset-1 ring-current border-transparent`
                            : "border-input text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {meta.label}
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Notes (optional)
              </label>
              <Textarea
                value={stationForm.notes}
                onChange={(e) =>
                  setStationForm({ ...stationForm, notes: e.target.value })
                }
                rows={2}
                placeholder="e.g. 'wires were cut during 2025 trenching'"
              />
            </div>

            {stationError && (
              <p className="text-xs text-destructive">{stationError}</p>
            )}
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
            {stationDialog?.existing ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearStation}
                disabled={stationSaving}
              >
                <Trash2 className="w-4 h-4" />
                Clear status
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2 sm:ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={closeStationDialog}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveStation}
                disabled={stationSaving}
              >
                {stationSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── View switcher button ──────────────────────────────────────────────────

function ViewButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof MapPin;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 h-10 rounded-md border text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-background text-muted-foreground border-input hover:text-foreground hover:bg-accent"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// ── Map view ──────────────────────────────────────────────────────────────

interface MapViewProps {
  holeNumber: number;
  setHoleNumber: (n: number) => void;
  sprinklersOnHole: Sprinkler[];
  visiblePins: Sprinkler[];
  issues: SprinklerIssue[];
  areaFilter: "all" | AreaType;
  setAreaFilter: (v: "all" | AreaType) => void;
  satelliteFilter: string;
  setSatelliteFilter: (v: string) => void;
  distinctSatellites: number[];
  imageRef: React.RefObject<HTMLDivElement | null>;
  imgLoaded: boolean;
  setImgLoaded: (v: boolean) => void;
  imgError: boolean;
  setImgError: (v: boolean) => void;
  onImageTap: (
    e: ReactMouseEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>,
  ) => void;
  onPinTap: (s: Sprinkler) => void;
  highlightId: string | null;
}

function MapView({
  holeNumber,
  setHoleNumber,
  sprinklersOnHole,
  visiblePins,
  issues,
  areaFilter,
  setAreaFilter,
  satelliteFilter,
  setSatelliteFilter,
  distinctSatellites,
  imageRef,
  imgLoaded,
  setImgLoaded,
  imgError,
  setImgError,
  onImageTap,
  onPinTap,
  highlightId,
}: MapViewProps) {
  const goPrev = () => setHoleNumber(holeNumber === 1 ? 18 : holeNumber - 1);
  const goNext = () => setHoleNumber(holeNumber === 18 ? 1 : holeNumber + 1);

  return (
    <div className="space-y-3">
      {/* Hole selector */}
      <div className="flex items-center justify-between gap-2 bg-card border rounded-lg p-2">
        <Button variant="outline" size="icon-sm" onClick={goPrev} title="Previous hole">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2 flex-1 justify-center">
          <Flag className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Hole</span>
          <Select
            value={holeNumber.toString()}
            onValueChange={(v) => setHoleNumber(parseInt(v, 10))}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOLE_NUMBERS.map((n) => (
                <SelectItem key={n} value={n.toString()}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-[10px]">
            {sprinklersOnHole.length}{" "}
            {sprinklersOnHole.length === 1 ? "head" : "heads"}
          </Badge>
        </div>
        <Button variant="outline" size="icon-sm" onClick={goNext} title="Next hole">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        <FilterChip
          label="All areas"
          active={areaFilter === "all"}
          onClick={() => setAreaFilter("all")}
        />
        {(["green", "tee", "fairway"] as AreaType[]).map((a) => (
          <FilterChip
            key={a}
            label={AREA_META[a].label}
            active={areaFilter === a}
            onClick={() => setAreaFilter(a)}
            dotColor={AREA_META[a].pin}
          />
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Satellite:</span>
          <Select value={satelliteFilter} onValueChange={setSatelliteFilter}>
            <SelectTrigger className="w-[110px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {distinctSatellites.map((n) => (
                <SelectItem key={n} value={n.toString()}>
                  Sat {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Hole image with pins */}
      <Card className="overflow-hidden">
        <div
          ref={imageRef}
          className="relative bg-gradient-to-b from-green-50 to-green-100/40 dark:from-green-950/30 dark:to-green-900/20 cursor-crosshair select-none"
          // Touch devices: the synthetic click fires after touchend without
          // delay (viewport has width=device-width), so onClick alone covers
          // both mouse and touch. Adding onTouchEnd would double-fire.
          onClick={onImageTap}
        >
          {imgError ? (
            <div className="aspect-[2/1] flex items-center justify-center">
              <div className="text-center">
                <Flag className="w-12 h-12 text-muted-foreground/40 mx-auto mb-1" />
                <span className="text-4xl font-bold text-muted-foreground/30">
                  {holeNumber}
                </span>
              </div>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/holes/hole-${holeNumber}-landscape.png`}
              alt={`Hole ${holeNumber} layout`}
              className="block w-full h-auto"
              draggable={false}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          )}

          {/* Pins overlay */}
          {imgLoaded &&
            visiblePins.map((s) => (
              <PinDot
                key={s.id}
                sprinkler={s}
                highlight={s.id === highlightId}
                openIssue={highestOpenIssue(s.id, issues)}
                onTap={(e) => {
                  e.stopPropagation();
                  onPinTap(s);
                }}
              />
            ))}
        </div>

        {/* Bottom hint inside the card */}
        <div className="px-3 py-2 bg-muted/30 border-t text-[11px] text-muted-foreground flex items-center justify-between gap-2">
          <span>
            Tap an empty spot to add a sprinkler. Tap a pin to edit it.
          </span>
          <Legend />
        </div>
      </Card>

      {/* Sprinkler list for this hole */}
      <Card>
        <CardContent className="pt-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">
              Sprinklers on hole {holeNumber}
            </h3>
            <Badge variant="secondary" className="text-[10px]">
              {visiblePins.length} shown
            </Badge>
          </div>
          {sprinklersOnHole.length === 0 ? (
            <EmptyState
              icon={Droplets}
              variant="compact"
              title="No sprinklers mapped yet"
              description="Tap the hole image above to add your first sprinkler."
            />
          ) : visiblePins.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No sprinklers match the current filters.
            </p>
          ) : (
            <div className="space-y-1">
              {visiblePins.map((s) => (
                <SprinklerRow
                  key={s.id}
                  sprinkler={s}
                  openIssue={highestOpenIssue(s.id, issues)}
                  onClick={() => onPinTap(s)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  dotColor,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 h-7 rounded-full text-xs font-medium border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-input hover:text-foreground hover:bg-accent"
      }`}
    >
      {dotColor && (
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: dotColor }}
        />
      )}
      {label}
    </button>
  );
}

function Legend() {
  return (
    <span className="inline-flex items-center gap-2">
      {(["green", "tee", "fairway"] as AreaType[]).map((a) => (
        <span key={a} className="inline-flex items-center gap-1">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: AREA_META[a].pin }}
          />
          {AREA_META[a].label}
        </span>
      ))}
    </span>
  );
}

// ── Pin dot ──────────────────────────────────────────────────────────────

function PinDot({
  sprinkler,
  highlight,
  openIssue,
  onTap,
}: {
  sprinkler: Sprinkler;
  highlight: boolean;
  openIssue: SprinklerIssue | null;
  onTap: (e: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const meta = AREA_META[sprinkler.area_type];
  const sev = openIssue ? SEVERITY_META[openIssue.severity] : null;

  const baseShadow = "0 2px 4px rgba(0,0,0,0.3)";
  const issueRing = sev ? `0 0 0 3px ${sev.dot}` : "";
  const highlightRing = highlight ? `0 0 0 5px ${meta.pin}66` : "";
  const shadow = [issueRing, highlightRing, baseShadow].filter(Boolean).join(", ");

  return (
    <button
      type="button"
      onClick={onTap}
      className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 group focus:outline-none flex items-center justify-center ${
        highlight ? "animate-pulse" : ""
      }`}
      // Hit area is 36x36 (finger-friendly) while the visible pin stays 22px.
      style={{
        left: `${sprinkler.x_pct * 100}%`,
        top: `${sprinkler.y_pct * 100}%`,
        width: 36,
        height: 36,
      }}
      title={
        openIssue
          ? `Sat ${sprinkler.satellite_num} / Sta ${sprinkler.station_num}${
              sprinkler.label ? " — " + sprinkler.label : ""
            } — ${ISSUE_TYPE_LABELS[openIssue.issue_type]} (${openIssue.severity})`
          : `Sat ${sprinkler.satellite_num} / Sta ${sprinkler.station_num}${
              sprinkler.label ? " — " + sprinkler.label : ""
            }`
      }
    >
      <span
        className="relative flex items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white leading-none"
        style={{
          background: meta.pin,
          width: 22,
          height: 22,
          boxShadow: shadow,
        }}
      >
        {sprinkler.station_num}
        {openIssue && (
          <span
            className="absolute -top-1 -right-1 rounded-full border border-white flex items-center justify-center"
            style={{
              background: sev!.dot,
              width: 10,
              height: 10,
            }}
            aria-hidden
          >
            <span className="text-white text-[7px] font-extrabold leading-none">!</span>
          </span>
        )}
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 rounded bg-foreground text-background text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
        Sat {sprinkler.satellite_num} / Sta {sprinkler.station_num}
        {sprinkler.label ? ` · ${sprinkler.label}` : ""}
        {openIssue ? ` · ${ISSUE_TYPE_LABELS[openIssue.issue_type]}` : ""}
      </span>
    </button>
  );
}

/** Small status pill used in lists/tables. */
function StatusPill({ openIssue }: { openIssue: SprinklerIssue | null }) {
  if (!openIssue) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
        <CheckCircle2 className="w-2.5 h-2.5" />
        OK
      </span>
    );
  }
  const sev = SEVERITY_META[openIssue.severity];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${sev.chipBg} ${sev.chipText}`}
      title={`${ISSUE_TYPE_LABELS[openIssue.issue_type]} (${sev.label.toLowerCase()} severity)`}
    >
      <AlertCircle className="w-2.5 h-2.5" />
      {ISSUE_TYPE_LABELS[openIssue.issue_type]}
    </span>
  );
}

// ── Sprinkler row (used in lists) ────────────────────────────────────────

function SprinklerRow({
  sprinkler,
  openIssue,
  onClick,
}: {
  sprinkler: Sprinkler;
  openIssue: SprinklerIssue | null;
  onClick: () => void;
}) {
  const meta = AREA_META[sprinkler.area_type];
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
    >
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: meta.pin }}
      />
      <span className="text-xs font-medium w-16 shrink-0">
        Hole {sprinkler.hole_number}
      </span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded ${meta.chipBg} ${meta.chipText}`}>
        {meta.label}
      </span>
      <span className="text-xs font-mono shrink-0">
        S{sprinkler.satellite_num} · {sprinkler.station_num}
      </span>
      <span className="text-xs text-muted-foreground truncate flex-1">
        {sprinkler.label ?? ""}
      </span>
      <StatusPill openIssue={openIssue} />
    </button>
  );
}

// ── By Satellite view ─────────────────────────────────────────────────────

interface SatelliteGroup {
  satellite_num: number;
  stations: { station_num: number; heads: Sprinkler[] }[];
  totalHeads: number;
  totalStations: number;
}

function SatelliteView({
  groups,
  issues,
  stationNotes,
  expanded,
  setExpanded,
  onJumpToPin,
  onSetStationStatus,
}: {
  groups: SatelliteGroup[];
  issues: SprinklerIssue[];
  stationNotes: SatelliteStation[];
  expanded: number[];
  setExpanded: React.Dispatch<React.SetStateAction<number[]>>;
  onJumpToPin: (s: Sprinkler) => void;
  onSetStationStatus: (sat: number, sta: number) => void;
}) {
  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="pt-4">
          <EmptyState
            icon={Radio}
            title="No satellites yet"
            description="Add sprinklers from the Map view first and your satellites will appear here grouped by number."
          />
        </CardContent>
      </Card>
    );
  }

  // Functional update so rapid back-to-back clicks don't drop a toggle.
  const toggle = (sat: number) => {
    setExpanded((prev) =>
      prev.includes(sat) ? prev.filter((x) => x !== sat) : [...prev, sat],
    );
  };

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const isOpen = expanded.includes(g.satellite_num);
        return (
          <Card key={g.satellite_num} className="overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(g.satellite_num)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Radio className="w-4 h-4 text-muted-foreground" />
                <span className="font-semibold text-sm">
                  Satellite {g.satellite_num}
                </span>
                <span className="text-xs text-muted-foreground">
                  {g.totalStations}{" "}
                  {g.totalStations === 1 ? "station" : "stations"} ·{" "}
                  {g.totalHeads} {g.totalHeads === 1 ? "head" : "heads"}
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {isOpen && (
              <div className="border-t bg-muted/30">
                <StationInventoryGrid
                  satelliteNum={g.satellite_num}
                  sprinklers={g.stations.flatMap((st) => st.heads)}
                  stationNotes={stationNotes.filter(
                    (n) => n.satellite_num === g.satellite_num,
                  )}
                  issues={issues}
                  onJumpToPin={onJumpToPin}
                  onSetStationStatus={onSetStationStatus}
                />
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left px-4 py-1.5 font-medium w-16">
                        Station
                      </th>
                      <th className="text-left px-2 py-1.5 font-medium">
                        Area
                      </th>
                      <th className="text-left px-2 py-1.5 font-medium w-16">
                        Hole
                      </th>
                      <th className="text-left px-2 py-1.5 font-medium">
                        Label
                      </th>
                      <th className="text-left px-2 py-1.5 font-medium">
                        Status
                      </th>
                      <th className="text-right px-4 py-1.5 font-medium w-16">
                        Heads
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.stations.map((st) => {
                      // For multi-head stations, render one expandable row.
                      if (st.heads.length === 1) {
                        const s = st.heads[0];
                        const meta = AREA_META[s.area_type];
                        const openIssue = highestOpenIssue(s.id, issues);
                        return (
                          <tr
                            key={st.station_num}
                            className="border-t hover:bg-background cursor-pointer"
                            onClick={() => onJumpToPin(s)}
                          >
                            <td className="px-4 py-1.5 font-mono">
                              {st.station_num}
                            </td>
                            <td className="px-2 py-1.5">
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${meta.chipBg} ${meta.chipText}`}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ background: meta.pin }}
                                />
                                {meta.label}
                              </span>
                            </td>
                            <td className="px-2 py-1.5">{s.hole_number}</td>
                            <td className="px-2 py-1.5 text-muted-foreground truncate">
                              {s.label ?? "—"}
                            </td>
                            <td className="px-2 py-1.5">
                              <StatusPill openIssue={openIssue} />
                            </td>
                            <td className="px-4 py-1.5 text-right">1</td>
                          </tr>
                        );
                      }
                      // Multi-head: header row plus child rows.
                      return (
                        <MultiHeadStation
                          key={st.station_num}
                          stationNum={st.station_num}
                          heads={st.heads}
                          issues={issues}
                          onJumpToPin={onJumpToPin}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function MultiHeadStation({
  stationNum,
  heads,
  issues,
  onJumpToPin,
}: {
  stationNum: number;
  heads: Sprinkler[];
  issues: SprinklerIssue[];
  onJumpToPin: (s: Sprinkler) => void;
}) {
  return (
    <>
      <tr className="border-t bg-amber-50/40 dark:bg-amber-900/10">
        <td className="px-4 py-1.5 font-mono font-semibold">{stationNum}</td>
        <td className="px-2 py-1.5 text-[10px] text-muted-foreground italic">
          (fires {heads.length} heads)
        </td>
        <td className="px-2 py-1.5">—</td>
        <td className="px-2 py-1.5">—</td>
        <td className="px-2 py-1.5">—</td>
        <td className="px-4 py-1.5 text-right font-semibold">
          {heads.length}
        </td>
      </tr>
      {heads.map((s) => {
        const meta = AREA_META[s.area_type];
        const openIssue = highestOpenIssue(s.id, issues);
        return (
          <tr
            key={s.id}
            className="border-t hover:bg-background cursor-pointer"
            onClick={() => onJumpToPin(s)}
          >
            <td className="px-4 py-1.5 pl-8 text-muted-foreground">↳</td>
            <td className="px-2 py-1.5">
              <span
                className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${meta.chipBg} ${meta.chipText}`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: meta.pin }}
                />
                {meta.label}
              </span>
            </td>
            <td className="px-2 py-1.5">{s.hole_number}</td>
            <td className="px-2 py-1.5 text-muted-foreground truncate">
              {s.label ?? "—"}
            </td>
            <td className="px-2 py-1.5">
              <StatusPill openIssue={openIssue} />
            </td>
            <td className="px-4 py-1.5 text-right">—</td>
          </tr>
        );
      })}
    </>
  );
}

// ── Station Inventory grid (per satellite) ───────────────────────────────

function StationInventoryGrid({
  satelliteNum,
  sprinklers,
  stationNotes,
  issues,
  onJumpToPin,
  onSetStationStatus,
}: {
  satelliteNum: number;
  sprinklers: Sprinkler[];
  stationNotes: SatelliteStation[];
  issues: SprinklerIssue[];
  onJumpToPin: (s: Sprinkler) => void;
  onSetStationStatus: (sat: number, sta: number) => void;
}) {
  // Default range: 1..N rounded up to nearest 12, with a minimum of 24.
  const maxSeen = Math.max(
    24,
    ...sprinklers.map((s) => s.station_num),
    ...stationNotes.map((n) => n.station_num),
  );
  const [maxRange, setMaxRange] = useState(Math.ceil(maxSeen / 12) * 12);

  // Build a per-station status map for this satellite.
  const headsByStation = new Map<number, Sprinkler[]>();
  for (const s of sprinklers) {
    if (!headsByStation.has(s.station_num)) headsByStation.set(s.station_num, []);
    headsByStation.get(s.station_num)!.push(s);
  }
  const noteByStation = new Map<number, SatelliteStation>();
  for (const n of stationNotes) noteByStation.set(n.station_num, n);

  const cells = Array.from({ length: maxRange }, (_, i) => i + 1);

  return (
    <div className="p-3 border-b bg-background">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground">
          Station Inventory — 1 to {maxRange}
        </span>
        <button
          type="button"
          onClick={() => setMaxRange((r) => r + 12)}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          + 12 more
        </button>
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 sm:gap-1">
        {cells.map((sta) => {
          const heads = headsByStation.get(sta) ?? [];
          const note = noteByStation.get(sta);
          const hasHeads = heads.length > 0;
          const headWithOpenIssue = hasHeads
            ? heads.find((h) => highestOpenIssue(h.id, issues))
            : null;

          let bg = "bg-background";
          let textColor = "text-muted-foreground/60";
          let border = "border-input";
          let title = `Sat ${satelliteNum} / Sta ${sta} — no info`;

          if (hasHeads) {
            const area = heads[0].area_type;
            const meta = AREA_META[area];
            // Subtle tinted bg using AREA_META chipBg
            bg = meta.chipBg;
            textColor = meta.chipText;
            border = "border-transparent";
            title = `${heads.length} ${heads.length === 1 ? "head" : "heads"} (${meta.label.toLowerCase()})${
              headWithOpenIssue ? " — has open issue" : ""
            }`;
          } else if (note) {
            const meta = STATION_STATUS_META[note.status];
            bg = meta.cellBg;
            textColor = meta.chipText;
            border = "border-transparent";
            title = `${meta.label}${note.notes ? " — " + note.notes : ""}`;
          }

          return (
            <button
              key={sta}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (hasHeads) onJumpToPin(heads[0]);
                else onSetStationStatus(satelliteNum, sta);
              }}
              title={title}
              className={`relative aspect-square min-h-[44px] sm:min-h-0 rounded text-xs sm:text-[10px] font-mono border ${bg} ${textColor} ${border} hover:ring-2 hover:ring-primary hover:ring-offset-1 transition-shadow flex items-center justify-center`}
            >
              {sta}
              {headWithOpenIssue && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-600 border border-background"
                  aria-hidden
                />
              )}
              {note && (
                <span
                  className="absolute bottom-0.5 right-0.5 text-[8px] opacity-70"
                  aria-hidden
                >
                  {note.status === "broken" ? "✗" : note.status === "unused" ? "·" : "!"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <LegendDot color={AREA_META.green.pin} label="has heads" />
        <LegendDot color="#9ca3af" label="unused" />
        <LegendDot color="#dc2626" label="broken" />
        <LegendDot color="#f59e0b" label="note only" />
        <LegendDot color="#e5e7eb" label="unknown — tap to set" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="w-2 h-2 rounded-sm"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

// ── By Sprinkler view ─────────────────────────────────────────────────────

function SprinklerSearchView({
  results,
  issues,
  searchQuery,
  setSearchQuery,
  onJumpToPin,
}: {
  results: Sprinkler[];
  issues: SprinklerIssue[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  onJumpToPin: (s: Sprinkler) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by hole, satellite, station, area, or label…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <Card>
          <CardContent className="pt-4">
            <EmptyState
              icon={Search}
              variant="compact"
              title={searchQuery ? "No matches" : "No sprinklers yet"}
              description={
                searchQuery
                  ? "Try a different search term — search matches hole #, satellite #, station #, area name, or label text."
                  : "Add sprinklers from the Map view first."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr className="text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Hole</th>
                  <th className="text-left px-3 py-2 font-medium">Area</th>
                  <th className="text-left px-3 py-2 font-medium">Sat</th>
                  <th className="text-left px-3 py-2 font-medium">Sta</th>
                  <th className="text-left px-3 py-2 font-medium">Label</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((s) => {
                  const meta = AREA_META[s.area_type];
                  const openIssue = highestOpenIssue(s.id, issues);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => onJumpToPin(s)}
                      className="border-t hover:bg-accent cursor-pointer"
                    >
                      <td className="px-3 py-2 font-medium">{s.hole_number}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${meta.chipBg} ${meta.chipText}`}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: meta.pin }}
                          />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {s.satellite_num}
                      </td>
                      <td className="px-3 py-2 font-mono">{s.station_num}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {s.label ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill openIssue={openIssue} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
