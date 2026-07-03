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
  AlertCircle,
  CheckCircle2,
  FileDown,
  Printer,
  Wrench,
  Plus,
  History,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Ban,
  PowerOff,
  Check,
  CheckSquare,
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
import { generateSprinklerMapReport } from "@/lib/reports/sprinkler-map-report";
import { generateSprinklerIssuesReport } from "@/lib/reports/sprinkler-issues-report";
import { saveBlobToDevice } from "@/lib/utils/download-blob";

// ── Types ─────────────────────────────────────────────────────────────────

type AreaType = "green" | "tee" | "fairway";

type IssueType =
  // Original set (kept so previously-saved issues still render).
  | "low_pressure"
  | "one_side_only"
  | "no_spray"
  | "broken"
  | "leaking"
  | "clogged"
  | "stuck_on"
  | "stuck_off"
  | "other"
  // Added: more common sprinkler problems.
  | "wont_pop_up"
  | "stuck_up"
  | "not_rotating"
  | "misaligned"
  | "sunken"
  | "mower_damage"
  | "valve"
  | "wiring"
  | "no_comm";

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
  // The valve that was shut for this issue, if any. While the issue is open,
  // every head that valve feeds shows offline. Optional because the column is
  // absent until the 20260605 migration is applied.
  valve_id?: string | null;
}

/**
 * A reusable isolation valve: feeds a set of sprinkler heads. When an open
 * issue references it (issue.valve_id), those heads are offline until resolved.
 */
interface Valve {
  id: string;
  label: string;
  member_sprinkler_ids: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Why a head is offline: the valve that was shut and the head that caused it. */
interface OfflineInfo {
  valveLabel: string;
  byHeadLabel: string;
  issueId: string;
}
type OfflineMap = Map<string, OfflineInfo>;

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

/**
 * Per-part hole image. Each hole has three pictures (fairway / tees / green)
 * under /public/irrigation, named like "hole 7 fairway.png", "hole 7 tees.png"
 * and "hole 7.png" (green). Spaces are URL-encoded by the browser.
 */
function partImageSrc(hole: number, part: AreaType): string {
  const suffix = part === "tee" ? " tees" : part === "fairway" ? " fairway" : "";
  return `/irrigation/hole ${hole}${suffix}.png`;
}

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
  no_spray: "No spray",
  one_side_only: "One side only",
  not_rotating: "Not rotating",
  clogged: "Clogged nozzle",
  misaligned: "Misaligned / overspray",
  leaking: "Leaking",
  wont_pop_up: "Won't pop up",
  stuck_up: "Stuck up (won't retract)",
  stuck_on: "Stuck on (won't shut off)",
  stuck_off: "Stuck off (won't run)",
  sunken: "Sunken / low head",
  broken: "Broken head",
  mower_damage: "Mower / cart damage",
  valve: "Valve issue",
  wiring: "Wiring / solenoid",
  no_comm: "No communication",
  other: "Other (type it)",
};

// Dropdown order: coverage/spray problems, then mechanical, physical damage,
// electrical, and finally the free-text catch-all.
const ISSUE_TYPES: IssueType[] = [
  "low_pressure",
  "no_spray",
  "one_side_only",
  "not_rotating",
  "clogged",
  "misaligned",
  "leaking",
  "wont_pop_up",
  "stuck_up",
  "stuck_on",
  "stuck_off",
  "sunken",
  "broken",
  "mower_damage",
  "valve",
  "wiring",
  "no_comm",
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
    chipBg: "bg-muted",
    chipText: "text-muted-foreground",
    cellBg: "bg-muted",
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
  const [valves, setValves] = useState<Valve[]>([]);
  const [stationNotes, setStationNotes] = useState<SatelliteStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [downloadingMapReport, setDownloadingMapReport] = useState(false);
  const [downloadingIssuesReport, setDownloadingIssuesReport] = useState(false);

  // Top-level view
  const [view, setView] = useState<ViewMode>("map");

  // Map view state
  const [holeNumber, setHoleNumber] = useState(1);
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [areaFilter, setAreaFilter] = useState<AreaType>("green");
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
  // Valve-shutoff draft (part of the new-issue form). When `shutoff` is on, the
  // issue marks a valve's heads offline — either an existing valve
  // (mode 'existing' + valveId) or a freshly-created one (mode 'new').
  const [issueValve, setIssueValve] = useState<{
    shutoff: boolean;
    mode: "existing" | "new";
    valveId: string;
    newLabel: string;
    newHeadIds: string[];
  }>({ shutoff: false, mode: "new", valveId: "", newLabel: "", newHeadIds: [] });
  const [valveHeadFilter, setValveHeadFilter] = useState("");
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
  // Separate refs for inline and fullscreen modes so each has its own bounds.
  const imageRef = useRef<HTMLDivElement>(null);
  const fullscreenImageRef = useRef<HTMLDivElement>(null);

  // Fullscreen map editor state
  const [fullscreen, setFullscreen] = useState(false);

  // Multi-select + bulk actions (fullscreen map)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedHeadIds, setSelectedHeadIds] = useState<string[]>([]);
  const [massIssueOpen, setMassIssueOpen] = useState(false);
  const [massIssueForm, setMassIssueForm] = useState<{
    issue_type: IssueType;
    severity: IssueSeverity;
    description: string;
  }>({ issue_type: "low_pressure", severity: "medium", description: "" });
  const [massActionLoading, setMassActionLoading] = useState(false);
  const [massActionError, setMassActionError] = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Three parallel reads. Issues and station notes are layered on top of
      // sprinklers but loaded independently so a slow query on one doesn't
      // block the others.
      const [sprinklersData, issuesData, stationsData, valvesData] =
        await Promise.all([
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
          // Valves are loaded resiliently: the table doesn't exist until the
          // 20260605 migration is applied, and a missing table must not break
          // the whole page. Degrade to an empty list in that case.
          directSelectList<Valve>("irrigation_valves", {
            columns: "*",
            orderBy: [{ column: "label", ascending: true }],
            label: "sprinkler-map.load.valves",
          }).catch((e) => {
            console.warn(
              "irrigation_valves unavailable — apply the 20260605 migration to enable valve shutoffs.",
              e,
            );
            return [] as Valve[];
          }),
        ]);
      setSprinklers(sprinklersData);
      setIssues(issuesData);
      setStationNotes(stationsData);
      setValves(valvesData);
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

  // The map opens straight into the big fullscreen view. This fires whenever
  // the map view becomes active (initial mount, or switching back from the
  // By Satellite / By Sprinkler tabs). Manually closing it stays closed until
  // you leave and return, since `view` doesn't change on close.
  useEffect(() => {
    if (view === "map") setFullscreen(true);
  }, [view]);

  // Leaving select mode clears any pending selection.
  useEffect(() => {
    if (!selectMode) setSelectedHeadIds([]);
  }, [selectMode]);

  // Reset img-loaded/error state when switching holes OR parts (each part has
  // its own picture, so a fresh load/error must be tracked per part too —
  // otherwise one missing part image would stick the error placeholder on).
  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
  }, [holeNumber, areaFilter]);

  // ── Derived data ────────────────────────────────────────────────────────

  const sprinklersOnHole = useMemo(
    () => sprinklers.filter((s) => s.hole_number === holeNumber),
    [sprinklers, holeNumber],
  );

  const visiblePinsOnHole = useMemo(() => {
    return sprinklersOnHole.filter((s) => {
      if (s.area_type !== areaFilter) return false;
      if (
        satelliteFilter !== "all" &&
        s.satellite_num.toString() !== satelliteFilter
      ) {
        return false;
      }
      return true;
    });
  }, [sprinklersOnHole, areaFilter, satelliteFilter]);

  // All heads on the current hole + part (any satellite). Feeds the fullscreen
  // "place heads" panel so each station chip can show how many are placed.
  const partPins = useMemo(
    () => sprinklersOnHole.filter((s) => s.area_type === areaFilter),
    [sprinklersOnHole, areaFilter],
  );

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

  // ── Valve shutoffs → offline heads ──────────────────────────────────────
  // A head is "offline" when a valve that feeds it was shut for an OPEN issue.
  // Derived purely from open issues, so resolving the issue automatically
  // brings every affected head back online (no extra bookkeeping).
  const offlineMap = useMemo<OfflineMap>(() => {
    const m: OfflineMap = new Map();
    for (const iss of issues) {
      if (iss.status !== "open" || !iss.valve_id) continue;
      const valve = valves.find((v) => v.id === iss.valve_id);
      if (!valve) continue;
      const blocker = sprinklers.find((s) => s.id === iss.sprinkler_id);
      const byHeadLabel = blocker
        ? `${blocker.satellite_num}-${blocker.station_num}`
        : "another head";
      for (const hid of valve.member_sprinkler_ids) {
        // First open issue to claim a head wins the attribution.
        if (!m.has(hid)) {
          m.set(hid, { valveLabel: valve.label, byHeadLabel, issueId: iss.id });
        }
      }
    }
    return m;
  }, [issues, valves, sprinklers]);

  // One row per open valve-shutoff, for the summary banner.
  const activeShutoffs = useMemo(() => {
    const existing = new Set(sprinklers.map((s) => s.id));
    return issues
      .filter((i) => i.status === "open" && i.valve_id)
      .map((i) => {
        const valve = valves.find((v) => v.id === i.valve_id);
        if (!valve) return null;
        const blocker = sprinklers.find((s) => s.id === i.sprinkler_id) ?? null;
        return {
          issueId: i.id,
          issueType: i.issue_type,
          valveLabel: valve.label,
          headCount: valve.member_sprinkler_ids.filter((id) => existing.has(id))
            .length,
          blocker,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [issues, valves, sprinklers]);

  // Placed heads for the valve head-picker, in play order (hole → tee/fairway/
  // green → satellite → station).
  const valveHeadOptions = useMemo(() => {
    const areaRank: Record<AreaType, number> = { tee: 0, fairway: 1, green: 2 };
    return sprinklers
      .slice()
      .sort(
        (a, b) =>
          a.hole_number - b.hole_number ||
          areaRank[a.area_type] - areaRank[b.area_type] ||
          a.satellite_num - b.satellite_num ||
          a.station_num - b.station_num,
      );
  }, [sprinklers]);

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
      // Use currentTarget so the same handler works for both inline and
      // fullscreen wrappers — each has its own bounding rect.
      const container = e.currentTarget as HTMLDivElement;
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
        // Default the new pin's area to the part currently being viewed.
        area_type: areaFilter,
      }));
      setSaveError(null);
    },
    [imgLoaded, areaFilter],
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
    setIssueValve({
      shutoff: false,
      mode: "new",
      valveId: "",
      newLabel: "",
      newHeadIds: [],
    });
    setValveHeadFilter("");
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

  // ── Place a head from the fullscreen drag-and-drop panel ────────────────
  // Inserts a sprinkler directly (satellite + station come from the dragged
  // chip; position from the drop point; hole + area from the current view).
  const handlePlaceHead = useCallback(
    async (sat: number, sta: number, x: number, y: number) => {
      try {
        const inserted = await directInsertRow<Sprinkler>(
          "irrigation_sprinklers",
          {
            satellite_num: sat,
            station_num: sta,
            hole_number: holeNumber,
            area_type: areaFilter,
            x_pct: Math.max(0, Math.min(1, x)),
            y_pct: Math.max(0, Math.min(1, y)),
            label: null,
            notes: null,
          },
          "sprinkler-map.place",
        );
        setSprinklers((prev) => [...prev, inserted]);
      } catch (err) {
        console.error("Failed to place sprinkler head:", err);
        alert(
          `Couldn't place head: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    },
    [holeNumber, areaFilter],
  );

  // ── Move a head (drag-to-reposition in the fullscreen map) ──────────────
  // Optimistic: update locally immediately, then persist. On failure, resync
  // from the server so the on-screen position can't drift from the truth.
  const handleMoveHead = useCallback(
    async (id: string, x: number, y: number) => {
      const cx = Math.max(0, Math.min(1, x));
      const cy = Math.max(0, Math.min(1, y));
      setSprinklers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, x_pct: cx, y_pct: cy } : s)),
      );
      try {
        await directPatchRow(
          "irrigation_sprinklers",
          "id",
          id,
          { x_pct: cx, y_pct: cy, updated_at: new Date().toISOString() },
          "sprinkler-map.move",
        );
      } catch (err) {
        console.error("Failed to move head:", err);
        alert(
          `Couldn't save the new position: ${err instanceof Error ? err.message : "unknown error"}`,
        );
        loadData();
      }
    },
    [loadData],
  );

  // ── Multi-select + bulk actions ─────────────────────────────────────────
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedHeadIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleBulkDelete = useCallback(async () => {
    const ids = [...selectedHeadIds];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} selected ${ids.length === 1 ? "head" : "heads"}? This also removes their issue history.`,
      )
    ) {
      return;
    }
    setMassActionLoading(true);
    setMassActionError(null);
    try {
      await Promise.all(
        ids.map((id) =>
          directDeleteRow(
            "irrigation_sprinklers",
            "id",
            id,
            "sprinkler-map.bulkDelete",
          ),
        ),
      );
      const idSet = new Set(ids);
      setSprinklers((prev) => prev.filter((s) => !idSet.has(s.id)));
      // Their issues cascade server-side; drop them locally too.
      setIssues((prev) => prev.filter((i) => !idSet.has(i.sprinkler_id)));
      setSelectedHeadIds([]);
      setSelectMode(false);
    } catch (err) {
      console.error("Failed to delete heads:", err);
      setMassActionError(
        err instanceof Error ? err.message : "Failed to delete the selected heads.",
      );
      loadData();
    } finally {
      setMassActionLoading(false);
    }
  }, [selectedHeadIds, loadData]);

  const openMassIssue = useCallback(() => {
    if (selectedHeadIds.length === 0) return;
    setMassIssueForm({
      issue_type: "low_pressure",
      severity: "medium",
      description: "",
    });
    setMassActionError(null);
    setMassIssueOpen(true);
  }, [selectedHeadIds]);

  const handleMassAddIssue = useCallback(async () => {
    const ids = [...selectedHeadIds];
    if (ids.length === 0) return;
    const desc = massIssueForm.description.trim();
    if (massIssueForm.issue_type === "other" && !desc) {
      setMassActionError("Add a short description of what's wrong.");
      return;
    }
    setMassActionLoading(true);
    setMassActionError(null);
    try {
      const inserted = await Promise.all(
        ids.map((id) =>
          directInsertRow<SprinklerIssue>(
            "irrigation_sprinkler_issues",
            {
              sprinkler_id: id,
              issue_type: massIssueForm.issue_type,
              severity: massIssueForm.severity,
              description: desc || null,
              status: "open",
            },
            "sprinkler-map.bulkIssue",
          ),
        ),
      );
      setIssues((prev) => [...inserted, ...prev]);
      setMassIssueOpen(false);
      setSelectedHeadIds([]);
      setSelectMode(false);
    } catch (err) {
      console.error("Failed to report issues:", err);
      setMassActionError(
        err instanceof Error ? err.message : "Failed to report the issue.",
      );
    } finally {
      setMassActionLoading(false);
    }
  }, [selectedHeadIds, massIssueForm]);

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

    // ── Validate before touching the network ──
    const desc = newIssueForm.description.trim();
    if (newIssueForm.issue_type === "other" && !desc) {
      setSaveError("Add a short description of what's wrong.");
      return;
    }
    let valveId: string | null = null;
    if (issueValve.shutoff) {
      if (issueValve.mode === "existing") {
        if (!issueValve.valveId) {
          setSaveError("Pick the valve that was shut, or add a new one.");
          return;
        }
        valveId = issueValve.valveId;
      } else {
        if (!issueValve.newLabel.trim()) {
          setSaveError("Give the new valve a name.");
          return;
        }
        if (issueValve.newHeadIds.length === 0) {
          setSaveError("Pick at least one head this valve feeds.");
          return;
        }
      }
    }

    setSaveError(null);
    setIssueActionLoading("new");
    try {
      // Create the valve first when the user is defining a new one, and add it
      // to local state immediately so it's reusable even if the issue insert
      // hiccups.
      if (issueValve.shutoff && issueValve.mode === "new") {
        const created = await directInsertRow<Valve>(
          "irrigation_valves",
          {
            label: issueValve.newLabel.trim(),
            member_sprinkler_ids: issueValve.newHeadIds,
          },
          "sprinkler-map.addValve",
        );
        valveId = created.id;
        setValves((prev) => [...prev, created]);
      }

      const payload: Record<string, unknown> = {
        sprinkler_id: editingPin.id,
        issue_type: newIssueForm.issue_type,
        severity: newIssueForm.severity,
        description: desc || null,
        status: "open",
      };
      // Only send valve_id when there's a shutoff — keeps ordinary issues
      // working even before the 20260605 migration adds the column.
      if (valveId) payload.valve_id = valveId;

      const inserted = await directInsertRow<SprinklerIssue>(
        "irrigation_sprinkler_issues",
        payload,
        "sprinkler-map.addIssue",
      );
      setIssues((prev) => [inserted, ...prev]);
      setShowNewIssueForm(false);
      setNewIssueForm({
        issue_type: "low_pressure",
        severity: "medium",
        description: "",
      });
      setIssueValve({
        shutoff: false,
        mode: "new",
        valveId: "",
        newLabel: "",
        newHeadIds: [],
      });
      setValveHeadFilter("");
    } catch (err) {
      console.error("Failed to add issue:", err);
      setSaveError(
        err instanceof Error ? err.message : "Failed to report issue.",
      );
    } finally {
      setIssueActionLoading(null);
    }
  }, [editingPin, newIssueForm, issueValve]);

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
    setAreaFilter("green");
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

  // ── Download printable map report (one part per page, with pins) ─────────
  const handleDownloadMapReport = useCallback(async () => {
    setDownloadingMapReport(true);
    try {
      const { blob, filename } = await generateSprinklerMapReport();
      await saveBlobToDevice({
        blob,
        filename,
        shareTitle: "Irrigation Sprinkler Maps",
      });
    } catch (err) {
      console.error("Failed to generate sprinkler map report:", err);
      alert(
        `Failed to generate map report: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      setDownloadingMapReport(false);
    }
  }, []);

  // ── Download issues report (open issues + valve-shutoff affected heads) ──
  const handleDownloadIssuesReport = useCallback(async () => {
    setDownloadingIssuesReport(true);
    try {
      const { blob, filename } = await generateSprinklerIssuesReport();
      await saveBlobToDevice({
        blob,
        filename,
        shareTitle: "Sprinkler Issues Report",
      });
    } catch (err) {
      console.error("Failed to generate issues report:", err);
      alert(
        `Failed to generate issues report: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      setDownloadingIssuesReport(false);
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
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadMapReport}
          disabled={downloadingMapReport || loading}
          title="Print-ready maps: every hole's tee, fairway & green with sprinkler placements"
        >
          {downloadingMapReport ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Printer className="w-4 h-4" />
          )}
          <span className="hidden lg:inline">Map Report</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadIssuesReport}
          disabled={downloadingIssuesReport || loading}
          title="Export open issues — including every head a shut valve takes offline"
        >
          {downloadingIssuesReport ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span className="hidden lg:inline">Issues</span>
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
          {/* Active valve shutoffs — heads offline until the issue is fixed */}
          {activeShutoffs.length > 0 && (
            <div className="mb-3 rounded-lg border border-border bg-muted p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <PowerOff className="w-4 h-4 shrink-0" />
                {activeShutoffs.length === 1
                  ? "1 valve shut off"
                  : `${activeShutoffs.length} valves shut off`}
                <span className="font-normal text-muted-foreground">
                  — heads offline until fixed
                </span>
              </div>
              <div className="space-y-1">
                {activeShutoffs.map((so) => (
                  <div
                    key={so.issueId}
                    className="flex items-center gap-2 text-[11px]"
                  >
                    <Ban className="w-3 h-3 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{so.valveLabel}</span>
                    <span className="text-muted-foreground truncate">
                      — {so.headCount} {so.headCount === 1 ? "head" : "heads"}{" "}
                      offline
                      {so.blocker
                        ? ` · ${so.blocker.satellite_num}-${so.blocker.station_num} ${ISSUE_TYPE_LABELS[so.issueType]}`
                        : ""}
                    </span>
                    {so.blocker && (
                      <button
                        type="button"
                        onClick={() => jumpToPin(so.blocker!)}
                        className="ml-auto shrink-0 text-[10px] underline text-muted-foreground hover:text-foreground"
                      >
                        View head
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {view === "map" && !fullscreen && (
            <MapView
              holeNumber={holeNumber}
              setHoleNumber={setHoleNumber}
              sprinklersOnHole={sprinklersOnHole}
              visiblePins={visiblePinsOnHole}
              issues={issues}
              offlineMap={offlineMap}
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
              onExpand={() => setFullscreen(true)}
            />
          )}
          {view === "satellite" && (
            <SatelliteView
              groups={satelliteGroups}
              issues={issues}
              offlineMap={offlineMap}
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
              offlineMap={offlineMap}
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
        {/* z-[70] keeps this above the fullscreen map editor (z-[60]) so
            tapping to add a sprinkler works in Expand mode. */}
        <DialogContent className="z-[70]">
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
                {(["tee", "fairway", "green"] as AreaType[]).map((a) => (
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
                  <StatusPill
                    openIssue={editingPinStatus}
                    offline={
                      editingPin ? offlineMap.get(editingPin.id) ?? null : null
                    }
                  />
                </div>

                {/* This head is knocked out by another head's valve shutoff */}
                {editingPin &&
                  !editingPinStatus &&
                  offlineMap.has(editingPin.id) && (
                    <div className="rounded-md border border-border bg-muted p-2 text-[11px] flex items-start gap-2">
                      <Ban className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      <span>
                        <span className="font-medium">Offline.</span> Valve{" "}
                        <span className="font-medium">
                          {offlineMap.get(editingPin.id)!.valveLabel}
                        </span>{" "}
                        was shut for head{" "}
                        {offlineMap.get(editingPin.id)!.byHeadLabel}. It works
                        again once that issue is resolved.
                      </span>
                    </div>
                  )}

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
                      const shutoffValve = iss.valve_id
                        ? valves.find((v) => v.id === iss.valve_id)
                        : null;
                      const shutoffCount = shutoffValve
                        ? shutoffValve.member_sprinkler_ids.filter((id) =>
                            sprinklers.some((s) => s.id === id),
                          ).length
                        : 0;
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
                            {shutoffValve && (
                              <p className="text-[11px] mt-0.5 inline-flex items-center gap-1 text-muted-foreground">
                                <Ban className="w-3 h-3 shrink-0" />
                                Shut valve{" "}
                                <span className="font-medium">
                                  {shutoffValve.label}
                                </span>{" "}
                                — {shutoffCount}{" "}
                                {shutoffCount === 1 ? "head" : "heads"} offline
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
                        {/* Native select — the browser draws the option list on
                            top of everything, so it can't get trapped behind the
                            dialog the way the portal-based Select did. */}
                        <select
                          value={newIssueForm.issue_type}
                          onChange={(e) =>
                            setNewIssueForm({
                              ...newIssueForm,
                              issue_type: e.target.value as IssueType,
                            })
                          }
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {ISSUE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {ISSUE_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
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
                    <div>
                      {newIssueForm.issue_type === "other" && (
                        <label className="text-[10px] text-muted-foreground mb-0.5 block">
                          What&apos;s wrong?{" "}
                          <span className="text-destructive">(required)</span>
                        </label>
                      )}
                      <Textarea
                        placeholder={
                          newIssueForm.issue_type === "other"
                            ? "Describe the problem…"
                            : "Description (optional) — e.g. 'spraying weak since last Friday'"
                        }
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
                    </div>

                    {/* Valve shutoff — this issue is knocking out other heads */}
                    <div className="rounded border border-input bg-background p-2 space-y-2">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={issueValve.shutoff}
                          onChange={(e) =>
                            setIssueValve((prev) => ({
                              ...prev,
                              shutoff: e.target.checked,
                              mode: valves.length === 0 ? "new" : prev.mode,
                              newHeadIds:
                                e.target.checked &&
                                prev.newHeadIds.length === 0 &&
                                editingPin
                                  ? [editingPin.id]
                                  : prev.newHeadIds,
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span className="text-[11px] leading-tight">
                          <span className="font-medium">
                            This issue shut off a valve
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            — mark the heads it feeds offline until it&apos;s
                            fixed.
                          </span>
                        </span>
                      </label>

                      {issueValve.shutoff && (
                        <div className="space-y-2 pl-1">
                          {valves.length > 0 && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setIssueValve((p) => ({
                                    ...p,
                                    mode: "existing",
                                  }))
                                }
                                className={`h-7 px-2 rounded border text-[11px] font-medium ${
                                  issueValve.mode === "existing"
                                    ? "bg-accent border-current"
                                    : "border-input text-muted-foreground hover:bg-accent"
                                }`}
                              >
                                Pick a valve
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setIssueValve((p) => ({
                                    ...p,
                                    mode: "new",
                                    newHeadIds:
                                      p.newHeadIds.length === 0 && editingPin
                                        ? [editingPin.id]
                                        : p.newHeadIds,
                                  }))
                                }
                                className={`h-7 px-2 rounded border text-[11px] font-medium ${
                                  issueValve.mode === "new"
                                    ? "bg-accent border-current"
                                    : "border-input text-muted-foreground hover:bg-accent"
                                }`}
                              >
                                + New valve
                              </button>
                            </div>
                          )}

                          {/* Existing valve */}
                          {issueValve.mode === "existing" && valves.length > 0 && (
                            <div>
                              <select
                                value={issueValve.valveId}
                                onChange={(e) =>
                                  setIssueValve((p) => ({
                                    ...p,
                                    valveId: e.target.value,
                                  }))
                                }
                                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                              >
                                <option value="">— pick a valve —</option>
                                {valves.map((v) => {
                                  const n = v.member_sprinkler_ids.filter((id) =>
                                    sprinklers.some((s) => s.id === id),
                                  ).length;
                                  return (
                                    <option key={v.id} value={v.id}>
                                      {v.label} ({n} {n === 1 ? "head" : "heads"})
                                    </option>
                                  );
                                })}
                              </select>
                              {(() => {
                                const v = valves.find(
                                  (x) => x.id === issueValve.valveId,
                                );
                                if (!v) return null;
                                const n = v.member_sprinkler_ids.filter((id) =>
                                  sprinklers.some((s) => s.id === id),
                                ).length;
                                return (
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    {n} {n === 1 ? "head" : "heads"} will show
                                    offline until this is resolved.
                                  </p>
                                );
                              })()}
                            </div>
                          )}

                          {/* New valve — name + head checklist */}
                          {issueValve.mode === "new" && (
                            <div className="space-y-1.5">
                              <input
                                type="text"
                                value={issueValve.newLabel}
                                onChange={(e) =>
                                  setIssueValve((p) => ({
                                    ...p,
                                    newLabel: e.target.value,
                                  }))
                                }
                                placeholder="Valve name — e.g. 'Fairway 1 isolation'"
                                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] text-muted-foreground">
                                  Heads this valve feeds (
                                  {issueValve.newHeadIds.length} selected)
                                </span>
                                {issueValve.newHeadIds.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setIssueValve((p) => ({
                                        ...p,
                                        newHeadIds: [],
                                      }))
                                    }
                                    className="text-[10px] text-muted-foreground hover:text-foreground underline"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                              {valveHeadOptions.length > 8 && (
                                <input
                                  type="text"
                                  value={valveHeadFilter}
                                  onChange={(e) =>
                                    setValveHeadFilter(e.target.value)
                                  }
                                  placeholder="Filter heads… (e.g. '1-12' or 'hole 1')"
                                  className="h-7 w-full rounded-md border border-input bg-background px-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                              )}
                              <div className="max-h-40 overflow-y-auto overscroll-contain rounded border border-input divide-y divide-border/60">
                                {valveHeadOptions
                                  .filter((s) => {
                                    const q = valveHeadFilter
                                      .trim()
                                      .toLowerCase();
                                    if (!q) return true;
                                    const hay =
                                      `${s.satellite_num}-${s.station_num} hole ${s.hole_number} ${AREA_META[s.area_type].label} ${s.label ?? ""}`.toLowerCase();
                                    return hay.includes(q);
                                  })
                                  .map((s) => {
                                    const checked =
                                      issueValve.newHeadIds.includes(s.id);
                                    const isCurrent = editingPin?.id === s.id;
                                    return (
                                      <label
                                        key={s.id}
                                        className="flex items-center gap-2 px-2 py-1 text-[11px] cursor-pointer hover:bg-accent"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(e) =>
                                            setIssueValve((p) => ({
                                              ...p,
                                              newHeadIds: e.target.checked
                                                ? [...p.newHeadIds, s.id]
                                                : p.newHeadIds.filter(
                                                    (id) => id !== s.id,
                                                  ),
                                            }))
                                          }
                                        />
                                        <span
                                          className="w-2 h-2 rounded-full shrink-0"
                                          style={{
                                            background: AREA_META[s.area_type].pin,
                                          }}
                                        />
                                        <span className="font-mono font-medium">
                                          {s.satellite_num}-{s.station_num}
                                        </span>
                                        <span className="text-muted-foreground truncate">
                                          Hole {s.hole_number} ·{" "}
                                          {AREA_META[s.area_type].label}
                                          {isCurrent ? " · this head" : ""}
                                        </span>
                                      </label>
                                    );
                                  })}
                                {valveHeadOptions.length === 0 && (
                                  <p className="px-2 py-2 text-[11px] text-muted-foreground">
                                    No heads placed yet.
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

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
                    onClick={() => {
                      setShowNewIssueForm(true);
                      setSaveError(null);
                      setIssueValve({
                        shutoff: false,
                        mode: valves.length > 0 ? "existing" : "new",
                        valveId: "",
                        newLabel: "",
                        newHeadIds: editingPin ? [editingPin.id] : [],
                      });
                      setValveHeadFilter("");
                    }}
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

      {/* ── Mass report-issue dialog (bulk select) ───────────────────── */}
      <Dialog
        open={massIssueOpen}
        onOpenChange={(open) => {
          if (!open) setMassIssueOpen(false);
        }}
      >
        {/* z-[70] keeps it above the fullscreen map (z-[60]). */}
        <DialogContent className="z-[70]">
          <DialogHeader>
            <DialogTitle>
              Report issue on {selectedHeadIds.length}{" "}
              {selectedHeadIds.length === 1 ? "head" : "heads"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground mb-0.5 block">
                  Issue type
                </label>
                <select
                  value={massIssueForm.issue_type}
                  onChange={(e) =>
                    setMassIssueForm({
                      ...massIssueForm,
                      issue_type: e.target.value as IssueType,
                    })
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {ISSUE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ISSUE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-0.5 block">
                  Severity
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {(["low", "medium", "high"] as IssueSeverity[]).map((s) => {
                    const m = SEVERITY_META[s];
                    const active = massIssueForm.severity === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setMassIssueForm({ ...massIssueForm, severity: s })
                        }
                        className={`h-9 rounded border text-[11px] font-medium ${
                          active
                            ? `${m.chipBg} ${m.chipText} border-current`
                            : "border-input text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div>
              {massIssueForm.issue_type === "other" && (
                <label className="text-[10px] text-muted-foreground mb-0.5 block">
                  What&apos;s wrong?{" "}
                  <span className="text-destructive">(required)</span>
                </label>
              )}
              <Textarea
                placeholder={
                  massIssueForm.issue_type === "other"
                    ? "Describe the problem…"
                    : "Description (optional)"
                }
                value={massIssueForm.description}
                onChange={(e) =>
                  setMassIssueForm({
                    ...massIssueForm,
                    description: e.target.value,
                  })
                }
                rows={2}
                className="text-sm"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Opens the same issue on all {selectedHeadIds.length} selected{" "}
              {selectedHeadIds.length === 1 ? "head" : "heads"}.
            </p>
            {massActionError && (
              <p className="text-xs text-destructive">{massActionError}</p>
            )}
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMassIssueOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleMassAddIssue}
              disabled={massActionLoading}
            >
              {massActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Report on {selectedHeadIds.length}{" "}
              {selectedHeadIds.length === 1 ? "head" : "heads"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Fullscreen map editor ──────────────────────────────────── */}
      {fullscreen && view === "map" && !loading && !loadError && (
        <FullscreenMapEditor
          // Key resets zoom/pan when the hole OR part changes (new image).
          key={`${holeNumber}-${areaFilter}`}
          holeNumber={holeNumber}
          setHoleNumber={setHoleNumber}
          visiblePins={visiblePinsOnHole}
          issues={issues}
          offlineMap={offlineMap}
          areaFilter={areaFilter}
          setAreaFilter={setAreaFilter}
          satelliteFilter={satelliteFilter}
          setSatelliteFilter={setSatelliteFilter}
          distinctSatellites={distinctSatellites}
          imageRef={fullscreenImageRef}
          onImageTap={handleImageTap}
          onPinTap={handlePinTap}
          onPlaceHead={handlePlaceHead}
          onMoveHead={handleMoveHead}
          partPins={partPins}
          highlightId={highlightId}
          onClose={() => setFullscreen(false)}
          selectMode={selectMode}
          selectedHeadIds={selectedHeadIds}
          onToggleSelectMode={() => setSelectMode((v) => !v)}
          onToggleSelect={handleToggleSelect}
          onClearSelection={() => setSelectedHeadIds([])}
          onBulkDelete={handleBulkDelete}
          onMassIssue={openMassIssue}
          bulkBusy={massActionLoading}
        />
      )}
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
  offlineMap: OfflineMap;
  areaFilter: AreaType;
  setAreaFilter: (v: AreaType) => void;
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
  onExpand: () => void;
}

function MapView({
  holeNumber,
  setHoleNumber,
  sprinklersOnHole,
  visiblePins,
  issues,
  offlineMap,
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
  onExpand,
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
        <span className="text-xs font-semibold text-muted-foreground mr-1">Part:</span>
        {(["tee", "fairway", "green"] as AreaType[]).map((a) => (
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
            <div className="aspect-[1/2] flex items-center justify-center">
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
              src={partImageSrc(holeNumber, areaFilter)}
              alt={`Hole ${holeNumber} layout`}
              // Display in the source's natural orientation (hole number
              // upright at top). The prior 180° rotation flipped the artwork
              // upside down.
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
                offline={offlineMap.get(s.id) ?? null}
                onTap={(e) => {
                  e.stopPropagation();
                  onPinTap(s);
                }}
              />
            ))}

          {/* Expand-to-fullscreen overlay button */}
          {imgLoaded && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExpand();
              }}
              title="Open fullscreen map with zoom and pan"
              className="absolute top-2 right-2 z-20 inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-foreground/85 text-background text-xs font-medium shadow-lg backdrop-blur-sm hover:bg-foreground active:scale-95 transition-transform"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Expand
            </button>
          )}
        </div>

        {/* Bottom hint inside the card */}
        <div className="px-3 py-2 bg-muted/30 border-t text-[11px] text-muted-foreground flex items-center justify-between gap-2">
          <span>
            Tap <span className="font-semibold">Expand</span> for a bigger
            zoomable view. Tap a pin to edit.
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
                  offline={offlineMap.get(s.id) ?? null}
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
      {(["tee", "fairway", "green"] as AreaType[]).map((a) => (
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

// ── Fullscreen map viewer with pinch-zoom and pan ────────────────────────
//
// Mobile-first map editor. Image fills the viewport. Two-finger pinch zooms
// (1x..5x), single-finger drag pans when zoomed. Tap (no drag) on empty
// space adds a new pin; tap on a pin opens edit. The same handleImageTap
// and pin-tap callbacks from the inline view are reused so adds/edits go
// through one code path.

interface PointerSample {
  x: number;
  y: number;
}

interface PinchStart {
  distance: number;
  scale: number;
  /** Centroid in screen coords at pinch start. */
  centroidX: number;
  centroidY: number;
  /** Translation at pinch start. */
  tx: number;
  ty: number;
}

interface DragStart {
  x: number;
  y: number;
  tx: number;
  ty: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const TAP_MOVEMENT_THRESHOLD = 8; // px

function FullscreenMapEditor({
  holeNumber,
  setHoleNumber,
  visiblePins,
  issues,
  offlineMap,
  areaFilter,
  setAreaFilter,
  satelliteFilter,
  setSatelliteFilter,
  distinctSatellites,
  imageRef,
  onImageTap,
  onPinTap,
  onPlaceHead,
  onMoveHead,
  partPins,
  highlightId,
  onClose,
  selectMode,
  selectedHeadIds,
  onToggleSelectMode,
  onToggleSelect,
  onClearSelection,
  onBulkDelete,
  onMassIssue,
  bulkBusy,
}: {
  holeNumber: number;
  setHoleNumber: (n: number) => void;
  visiblePins: Sprinkler[];
  issues: SprinklerIssue[];
  offlineMap: OfflineMap;
  areaFilter: AreaType;
  setAreaFilter: (v: AreaType) => void;
  satelliteFilter: string;
  setSatelliteFilter: (v: string) => void;
  distinctSatellites: number[];
  imageRef: React.RefObject<HTMLDivElement | null>;
  onImageTap: (
    e: ReactMouseEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>,
  ) => void;
  onPinTap: (s: Sprinkler) => void;
  onPlaceHead: (sat: number, sta: number, x: number, y: number) => void;
  onMoveHead: (id: string, x: number, y: number) => void;
  partPins: Sprinkler[];
  highlightId: string | null;
  onClose: () => void;
  selectMode: boolean;
  selectedHeadIds: string[];
  onToggleSelectMode: () => void;
  onToggleSelect: (id: string) => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onMassIssue: () => void;
  bulkBusy: boolean;
}) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Active pointers tracked by id so two-finger pinch works regardless of
  // which finger went down first.
  const pointers = useRef<Map<number, PointerSample>>(new Map());
  const pinchStart = useRef<PinchStart | null>(null);
  const dragStart = useRef<DragStart | null>(null);
  const wasDrag = useRef(false);
  // Canvas (parent of the transformed image) — used to compute initial
  // centering offset once the image natural size is known.
  const canvasRef = useRef<HTMLDivElement>(null);

  // Hole-change reset is handled by a `key` prop on this component at the
  // render site — when the key changes, the component remounts and all
  // useState values start over. Cleaner than chasing dependency arrays.

  // ESC to close (desktop convenience).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reset = scale 1 + re-center on the canvas (same math as image onLoad).
  const resetZoom = useCallback(() => {
    setScale(1);
    const canvas = canvasRef.current;
    const wrapper = imageRef.current;
    if (canvas && wrapper) {
      const canvasRect = canvas.getBoundingClientRect();
      const img = wrapper.querySelector("img");
      if (img && img.naturalWidth > 0) {
        const naturalRatio = img.naturalWidth / img.naturalHeight;
        const canvasRatio = canvasRect.width / canvasRect.height;
        let fitW: number;
        let fitH: number;
        if (naturalRatio > canvasRatio) {
          fitW = canvasRect.width;
          fitH = fitW / naturalRatio;
        } else {
          fitH = canvasRect.height;
          fitW = fitH * naturalRatio;
        }
        setTx((canvasRect.width - fitW) / 2);
        setTy((canvasRect.height - fitH) / 2);
        return;
      }
    }
    setTx(0);
    setTy(0);
  }, [imageRef]);

  // Zoom buttons anchor at the *visible image center* so the image stays
  // on screen as it scales. Falls back to viewport center if the ref isn't
  // mounted yet.
  const zoomBy = useCallback(
    (factor: number) => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
      if (newScale === scale) return;
      let cx = window.innerWidth / 2;
      let cy = window.innerHeight / 2;
      const wrapper = imageRef.current;
      if (wrapper) {
        const rect = wrapper.getBoundingClientRect();
        cx = rect.left + rect.width / 2;
        cy = rect.top + rect.height / 2;
      }
      // Scale around (cx, cy): the additional translation needed equals
      // (1 - factor) * (cx - currentTranslate).
      const ratio = newScale / scale;
      const newTx = cx - (cx - tx) * ratio;
      const newTy = cy - (cy - ty) * ratio;
      setScale(newScale);
      setTx(newTx);
      setTy(newTy);
    },
    [scale, tx, ty, imageRef],
  );

  // ── Pointer event handlers ────────────────────────────────────────────

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Don't capture pointer events that started on a pin button — let
      // those bubble to the pin's own onClick.
      const target = e.target as HTMLElement;
      if (target.closest("[data-pin]")) return;

      (e.target as Element).setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      wasDrag.current = false;

      if (pointers.current.size === 2) {
        const samples = Array.from(pointers.current.values());
        const a = samples[0];
        const b = samples[1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        pinchStart.current = {
          distance: Math.hypot(dx, dy),
          scale,
          centroidX: (a.x + b.x) / 2,
          centroidY: (a.y + b.y) / 2,
          tx,
          ty,
        };
        dragStart.current = null;
      } else if (pointers.current.size === 1) {
        dragStart.current = { x: e.clientX, y: e.clientY, tx, ty };
      }
    },
    [scale, tx, ty],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Two-finger pinch: scale + reposition centroid.
      if (pointers.current.size === 2 && pinchStart.current) {
        const samples = Array.from(pointers.current.values());
        const a = samples[0];
        const b = samples[1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const ratio = distance / pinchStart.current.distance;
        const newScale = Math.max(
          MIN_SCALE,
          Math.min(MAX_SCALE, pinchStart.current.scale * ratio),
        );
        const currentCx = (a.x + b.x) / 2;
        const currentCy = (a.y + b.y) / 2;
        // Keep the image-space point under the initial centroid pinned to
        // the current centroid.
        const imageCx =
          (pinchStart.current.centroidX - pinchStart.current.tx) /
          pinchStart.current.scale;
        const imageCy =
          (pinchStart.current.centroidY - pinchStart.current.ty) /
          pinchStart.current.scale;
        setScale(newScale);
        setTx(currentCx - imageCx * newScale);
        setTy(currentCy - imageCy * newScale);
        wasDrag.current = true;
        return;
      }

      // Single-finger pan — only when zoomed in.
      if (pointers.current.size === 1 && dragStart.current && scale > 1) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setTx(dragStart.current.tx + dx);
        setTy(dragStart.current.ty + dy);
        if (
          Math.abs(dx) > TAP_MOVEMENT_THRESHOLD ||
          Math.abs(dy) > TAP_MOVEMENT_THRESHOLD
        ) {
          wasDrag.current = true;
        }
        return;
      }

      // Single finger at zoom=1 — just track whether it moved enough to be
      // a drag so the impending click doesn't trigger an add.
      if (pointers.current.size === 1 && dragStart.current) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        if (
          Math.abs(dx) > TAP_MOVEMENT_THRESHOLD ||
          Math.abs(dy) > TAP_MOVEMENT_THRESHOLD
        ) {
          wasDrag.current = true;
        }
      }
    },
    [scale],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) pinchStart.current = null;
      if (pointers.current.size === 0) dragStart.current = null;
    },
    [],
  );

  // Wrapper click — fires after a clean tap (pointerdown→pointerup with no
  // significant movement). If wasDrag is set we ate the gesture for pan/pinch.
  const handleWrapperClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (wasDrag.current) {
        wasDrag.current = false;
        return;
      }
      // In select mode, tapping empty space shouldn't add a head.
      if (selectMode) return;
      onImageTap(e);
    },
    [onImageTap, selectMode],
  );

  const goPrev = () => setHoleNumber(holeNumber === 1 ? 18 : holeNumber - 1);
  const goNext = () => setHoleNumber(holeNumber === 18 ? 1 : holeNumber + 1);

  // ── Place-heads panel: pick a satellite (1-11) → 60 draggable head chips ──
  const [placeSatText, setPlaceSatText] = useState("");
  const placeSat = parseInt(placeSatText, 10);
  // Satellites are numbered 1-11 and every satellite has 60 stations.
  const SATELLITE_COUNT = 11;
  const STATIONS_PER_SAT = 60;
  const stations =
    Number.isFinite(placeSat) && placeSat >= 1
      ? Array.from({ length: STATIONS_PER_SAT }, (_, i) => i + 1)
      : [];
  const placedCount = (sta: number) =>
    partPins.filter(
      (p) => p.satellite_num === placeSat && p.station_num === sta,
    ).length;

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/x-sprinkler-head");
      if (!raw) return;
      let parsed: { sat: number; sta: number };
      try {
        parsed = JSON.parse(raw) as { sat: number; sta: number };
      } catch {
        return;
      }
      const el = imageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      onPlaceHead(parsed.sat, parsed.sta, x, y);
    },
    [imageRef, onPlaceHead],
  );

  return (
    <div
      // Full-screen overlay above the bottom nav and other UI.
      className="fixed inset-0 z-[60] flex flex-col bg-black text-white select-none"
      // Block native browser gestures so our pinch handler owns them.
      style={{ touchAction: "none" }}
    >
      {/* Top control bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-black/80 backdrop-blur-sm border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            title="Previous hole"
            className="p-2 rounded hover:bg-white/10 active:bg-white/20"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 px-2 min-w-[90px] justify-center">
            <Flag className="w-4 h-4 opacity-70" />
            <span className="text-sm font-semibold">Hole {holeNumber}</span>
          </div>
          <button
            type="button"
            onClick={goNext}
            title="Next hole"
            className="p-2 rounded hover:bg-white/10 active:bg-white/20"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onToggleSelectMode}
            title={
              selectMode
                ? "Exit select mode"
                : "Select heads to delete or report in bulk"
            }
            className={`ml-1 px-2.5 py-1.5 rounded inline-flex items-center gap-1.5 text-xs font-medium ${
              selectMode
                ? "bg-blue-600 text-white"
                : "hover:bg-white/10 active:bg-white/20"
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            {selectMode ? "Done" : "Select"}
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.4)}
            disabled={scale <= MIN_SCALE + 0.01}
            title="Zoom out"
            className="p-2 rounded hover:bg-white/10 active:bg-white/20 disabled:opacity-30 disabled:pointer-events-none"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <span className="text-xs font-mono w-12 text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomBy(1.4)}
            disabled={scale >= MAX_SCALE - 0.01}
            title="Zoom in"
            className="p-2 rounded hover:bg-white/10 active:bg-white/20 disabled:opacity-30 disabled:pointer-events-none"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={resetZoom}
            disabled={scale === 1 && tx === 0 && ty === 0}
            title="Reset zoom"
            className="p-2 rounded hover:bg-white/10 active:bg-white/20 disabled:opacity-30 disabled:pointer-events-none"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close fullscreen"
            className="p-2 rounded hover:bg-white/10 active:bg-white/20 ml-1"
          >
            <Minimize2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filter chips bar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/60 border-b border-white/10 overflow-x-auto shrink-0">
        <span className="text-[10px] font-semibold opacity-60 shrink-0 mr-0.5">Part:</span>
        {(["tee", "fairway", "green"] as AreaType[]).map((a) => (
          <FullscreenChip
            key={a}
            label={AREA_META[a].label}
            active={areaFilter === a}
            onClick={() => setAreaFilter(a)}
            dotColor={AREA_META[a].pin}
          />
        ))}
        {distinctSatellites.length > 0 && (
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <span className="text-[10px] opacity-60">Sat:</span>
            <select
              value={satelliteFilter}
              onChange={(e) => setSatelliteFilter(e.target.value)}
              className="bg-white/10 text-white text-xs rounded px-2 h-7 border border-white/20"
            >
              <option value="all">All</option>
              {distinctSatellites.map((n) => (
                <option key={n} value={n.toString()}>
                  Sat {n}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Place-heads panel (left) + image canvas (right), side by side */}
      <div className="flex flex-1 min-h-0">
        {/* Left: pick a satellite, then drag its head chips onto the map */}
        <aside className="w-[150px] shrink-0 bg-black/70 border-r border-white/10 flex flex-col">
          <div className="p-2 border-b border-white/10 space-y-1.5 shrink-0">
            <p className="text-[11px] font-semibold opacity-80">Place heads</p>
            <label className="flex items-center gap-1.5">
              <span className="text-[10px] opacity-60 w-[52px] shrink-0">Satellite</span>
              <select
                value={placeSatText}
                onChange={(e) => setPlaceSatText(e.target.value)}
                className="w-full bg-white/10 rounded px-1.5 py-1 text-xs text-white outline-none focus:bg-white/20"
              >
                <option value="" className="text-black">
                  Select…
                </option>
                {Array.from({ length: SATELLITE_COUNT }, (_, i) => i + 1).map(
                  (n) => (
                    <option key={n} value={n} className="text-black">
                      Satellite {n}
                    </option>
                  ),
                )}
              </select>
            </label>
            <p className="text-[10px] opacity-50">60 stations each.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
            {stations.length === 0 ? (
              <p className="text-[10px] opacity-50 leading-snug px-0.5">
                Pick a satellite to get its 60 draggable heads.
              </p>
            ) : (
              stations.map((sta) => {
                const cnt = placedCount(sta);
                return (
                  <div
                    key={sta}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/x-sprinkler-head",
                        JSON.stringify({ sat: placeSat, sta }),
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="flex items-center justify-between gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 cursor-grab active:cursor-grabbing text-xs select-none"
                    style={{ borderLeft: `3px solid ${AREA_META[areaFilter].pin}` }}
                    title={`Drag ${placeSat}-${sta} onto the map`}
                  >
                    <span className="font-semibold">
                      {placeSat}-{sta}
                    </span>
                    {cnt > 0 && (
                      <span className="text-[10px] px-1 rounded bg-emerald-500/30 text-emerald-200 font-semibold">
                        x{cnt}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Image canvas (drop target). Wrapper inside is absolutely positioned
            and translated; centering is computed once the image loads. */}
        <div
          ref={canvasRef}
          className="relative flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
        {/* Transformed image + pins layer. The wrapper holds the click
            handler because its bounding rect (post-transform) is what
            handleImageTap needs to compute x_pct/y_pct correctly. */}
        <div
          ref={imageRef}
          onClick={handleWrapperClick}
          className="absolute top-0 left-0 origin-top-left"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            cursor: "crosshair",
          }}
        >
          {imgError ? (
            <div className="w-screen h-[60vh] flex items-center justify-center bg-neutral-900">
              <div className="text-center">
                <Flag className="w-12 h-12 text-white/40 mx-auto mb-1" />
                <span className="text-5xl font-bold text-white/30">
                  {holeNumber}
                </span>
              </div>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={partImageSrc(holeNumber, areaFilter)}
              alt={`Hole ${holeNumber} layout`}
              // Natural orientation (hole number upright at top). At scale=1
              // we fit the image to the canvas.
              className="block pointer-events-none"
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                const canvas = canvasRef.current;
                if (canvas) {
                  const canvasRect = canvas.getBoundingClientRect();
                  // Fit image to the canvas while preserving aspect ratio.
                  const naturalRatio = img.naturalWidth / img.naturalHeight;
                  const canvasRatio = canvasRect.width / canvasRect.height;
                  let fitW: number;
                  let fitH: number;
                  if (naturalRatio > canvasRatio) {
                    fitW = canvasRect.width;
                    fitH = fitW / naturalRatio;
                  } else {
                    fitH = canvasRect.height;
                    fitW = fitH * naturalRatio;
                  }
                  // Set explicit dimensions so the transform math is stable.
                  img.style.width = `${fitW}px`;
                  img.style.height = `${fitH}px`;
                  // Center the wrapper inside the canvas.
                  setTx((canvasRect.width - fitW) / 2);
                  setTy((canvasRect.height - fitH) / 2);
                }
                setImgLoaded(true);
              }}
              onError={() => setImgError(true)}
            />
          )}

          {imgLoaded &&
            visiblePins.map((s) => (
              <PinDot
                key={s.id}
                sprinkler={s}
                highlight={s.id === highlightId}
                openIssue={highestOpenIssue(s.id, issues)}
                offline={offlineMap.get(s.id) ?? null}
                onTap={(e) => {
                  e.stopPropagation();
                  onPinTap(s);
                }}
                dragWrapperRef={imageRef}
                onMoveCommit={onMoveHead}
                selectMode={selectMode}
                selected={selectedHeadIds.includes(s.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
        </div>
      </div>
      </div>

      {/* Select-mode action bar */}
      {selectMode && (
        <div className="absolute bottom-0 left-0 right-0 z-10 bg-black/85 backdrop-blur-sm border-t border-white/10 px-3 py-2.5 flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold">
            {selectedHeadIds.length}{" "}
            {selectedHeadIds.length === 1 ? "head" : "heads"} selected
          </span>
          {selectedHeadIds.length > 0 && (
            <button
              type="button"
              onClick={onClearSelection}
              className="text-xs text-white/60 hover:text-white underline"
            >
              Clear
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onMassIssue}
              disabled={selectedHeadIds.length === 0 || bulkBusy}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-white/15 hover:bg-white/25 text-sm font-medium disabled:opacity-40 disabled:pointer-events-none"
            >
              <AlertCircle className="w-4 h-4" />
              Report issue
            </button>
            <button
              type="button"
              onClick={onBulkDelete}
              disabled={selectedHeadIds.length === 0 || bulkBusy}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-red-600 hover:bg-red-500 text-sm font-medium disabled:opacity-40 disabled:pointer-events-none"
            >
              {bulkBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FullscreenChip({
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
      className={`inline-flex items-center gap-1 px-2.5 h-7 rounded-full text-xs font-medium border whitespace-nowrap transition-colors shrink-0 ${
        active
          ? "bg-white text-black border-white"
          : "bg-white/5 text-white/80 border-white/20 hover:bg-white/10"
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

// ── Pin dot ──────────────────────────────────────────────────────────────

function PinDot({
  sprinkler,
  highlight,
  openIssue,
  offline,
  onTap,
  // Fullscreen-only extras (omitted by the inline/list views):
  dragWrapperRef,
  onMoveCommit,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  sprinkler: Sprinkler;
  highlight: boolean;
  openIssue: SprinklerIssue | null;
  offline?: OfflineInfo | null;
  onTap: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  /** Image wrapper used to convert a pointer position into x/y percentages. */
  dragWrapperRef?: React.RefObject<HTMLDivElement | null>;
  /** Persist a new position after a drag. Enables drag-to-move when provided. */
  onMoveCommit?: (id: string, x_pct: number, y_pct: number) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const meta = AREA_META[sprinkler.area_type];
  const sev = openIssue ? SEVERITY_META[openIssue.severity] : null;
  // A head's own issue takes visual precedence; "offline" only styles heads
  // that are knocked out by another head's valve shutoff.
  const isOffline = !!offline && !openIssue;

  // Drag-to-move: live position while dragging, committed on release.
  const canDrag = !!dragWrapperRef && !!onMoveCommit && !selectMode;
  const [dragPct, setDragPct] = useState<{ x: number; y: number } | null>(null);
  const dragInfo = useRef<{ startX: number; startY: number; moved: boolean } | null>(
    null,
  );
  const justDragged = useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!canDrag) return;
    e.stopPropagation();
    justDragged.current = false; // fresh interaction
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragInfo.current = { startX: e.clientX, startY: e.clientY, moved: false };
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const info = dragInfo.current;
    if (!canDrag || !info) return;
    const dx = e.clientX - info.startX;
    const dy = e.clientY - info.startY;
    if (!info.moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    info.moved = true;
    const rect = dragWrapperRef!.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setDragPct({ x, y });
  };
  const handlePointerUp = () => {
    const info = dragInfo.current;
    dragInfo.current = null;
    if (canDrag && info?.moved && dragPct) {
      justDragged.current = true; // swallow the click that follows a drag
      onMoveCommit!(sprinkler.id, dragPct.x, dragPct.y);
    }
    setDragPct(null);
  };

  const handleClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
    // Never let a pin click bubble to the canvas (which would add a head).
    e.stopPropagation();
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    if (selectMode) {
      onToggleSelect?.(sprinkler.id);
      return;
    }
    onTap(e);
  };

  const pinBg = isOffline ? "#64748b" : meta.pin; // slate-500 when offline
  const baseShadow = "0 2px 4px rgba(0,0,0,0.3)";
  const selectRing = selected ? "0 0 0 4px #2563eb" : ""; // blue-600
  const issueRing = sev ? `0 0 0 3px ${sev.dot}` : "";
  const offlineRing = isOffline ? "0 0 0 3px #475569" : ""; // slate-600
  const highlightRing = highlight ? `0 0 0 5px ${meta.pin}66` : "";
  const shadow = [selectRing, issueRing, offlineRing, highlightRing, baseShadow]
    .filter(Boolean)
    .join(", ");

  const baseTitle = `Sat ${sprinkler.satellite_num} / Sta ${sprinkler.station_num}${
    sprinkler.label ? " — " + sprinkler.label : ""
  }`;
  const title = selectMode
    ? `${baseTitle} — tap to ${selected ? "deselect" : "select"}`
    : openIssue
      ? `${baseTitle} — ${ISSUE_TYPE_LABELS[openIssue.issue_type]} (${openIssue.severity})`
      : isOffline
        ? `${baseTitle} — OFFLINE: ${offline!.valveLabel} shut for ${offline!.byHeadLabel}`
        : baseTitle;

  const left = dragPct ? dragPct.x : sprinkler.x_pct;
  const top = dragPct ? dragPct.y : sprinkler.y_pct;

  return (
    <button
      type="button"
      data-pin="1"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        dragInfo.current = null;
        setDragPct(null);
      }}
      className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 group focus:outline-none flex items-center justify-center ${
        highlight && !dragPct ? "animate-pulse" : ""
      }`}
      // Hit area sized generously around the larger visible pill.
      style={{
        left: `${left * 100}%`,
        top: `${top * 100}%`,
        width: 56,
        height: 56,
        cursor: canDrag ? "grab" : selectMode ? "pointer" : undefined,
        touchAction: canDrag ? "none" : undefined,
        zIndex: dragPct ? 30 : undefined,
      }}
      title={title}
    >
      <span
        className="relative flex items-center justify-center rounded-full border-2 border-white text-[14px] font-bold text-white leading-none px-1.5"
        style={{
          background: pinBg,
          minWidth: 38,
          height: 34,
          boxShadow: shadow,
          opacity: selectMode && !selected ? 0.8 : 1,
        }}
      >
        {sprinkler.satellite_num}-{sprinkler.station_num}
        {selectMode ? (
          selected ? (
            <span
              className="absolute -top-1 -left-1 rounded-full border border-white flex items-center justify-center bg-blue-600"
              style={{ width: 15, height: 15 }}
              aria-hidden
            >
              <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
            </span>
          ) : null
        ) : openIssue ? (
          <span
            className="absolute -top-1 -right-1 rounded-full border border-white flex items-center justify-center"
            style={{
              background: sev!.dot,
              width: 14,
              height: 14,
            }}
            aria-hidden
          >
            <span className="text-white text-[9px] font-extrabold leading-none">
              !
            </span>
          </span>
        ) : isOffline ? (
          <span
            className="absolute -top-1 -right-1 rounded-full border border-white flex items-center justify-center bg-slate-700"
            style={{ width: 14, height: 14 }}
            aria-hidden
          >
            <Ban className="w-2.5 h-2.5 text-white" />
          </span>
        ) : null}
      </span>
      {!selectMode && (
        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 rounded bg-foreground text-background text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
          Sat {sprinkler.satellite_num} / Sta {sprinkler.station_num}
          {sprinkler.label ? ` · ${sprinkler.label}` : ""}
          {openIssue
            ? ` · ${ISSUE_TYPE_LABELS[openIssue.issue_type]}`
            : isOffline
              ? ` · Offline (valve ${offline!.valveLabel})`
              : ""}
        </span>
      )}
    </button>
  );
}

/** Small status pill used in lists/tables. */
function StatusPill({
  openIssue,
  offline,
}: {
  openIssue: SprinklerIssue | null;
  offline?: OfflineInfo | null;
}) {
  if (openIssue) {
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
  if (offline) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
        title={`Offline — valve ${offline.valveLabel} shut for ${offline.byHeadLabel}`}
      >
        <Ban className="w-2.5 h-2.5" />
        Offline
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
      <CheckCircle2 className="w-2.5 h-2.5" />
      OK
    </span>
  );
}

// ── Sprinkler row (used in lists) ────────────────────────────────────────

function SprinklerRow({
  sprinkler,
  openIssue,
  offline,
  onClick,
}: {
  sprinkler: Sprinkler;
  openIssue: SprinklerIssue | null;
  offline?: OfflineInfo | null;
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
      <StatusPill openIssue={openIssue} offline={offline} />
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
  offlineMap,
  stationNotes,
  expanded,
  setExpanded,
  onJumpToPin,
  onSetStationStatus,
}: {
  groups: SatelliteGroup[];
  issues: SprinklerIssue[];
  offlineMap: OfflineMap;
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
                  offlineMap={offlineMap}
                  onJumpToPin={onJumpToPin}
                  onSetStationStatus={onSetStationStatus}
                />
                <div className="overflow-x-auto">
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
                              <StatusPill
                                openIssue={openIssue}
                                offline={offlineMap.get(s.id) ?? null}
                              />
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
                          offlineMap={offlineMap}
                          onJumpToPin={onJumpToPin}
                        />
                      );
                    })}
                  </tbody>
                </table>
                </div>
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
  offlineMap,
  onJumpToPin,
}: {
  stationNum: number;
  heads: Sprinkler[];
  issues: SprinklerIssue[];
  offlineMap: OfflineMap;
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
              <StatusPill
                openIssue={openIssue}
                offline={offlineMap.get(s.id) ?? null}
              />
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
  offlineMap,
  onJumpToPin,
  onSetStationStatus,
}: {
  satelliteNum: number;
  sprinklers: Sprinkler[];
  stationNotes: SatelliteStation[];
  issues: SprinklerIssue[];
  offlineMap: OfflineMap;
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
          // A head here that's offline from a valve shutoff (and isn't already
          // flagged for its own open issue).
          const headOffline =
            hasHeads && !headWithOpenIssue
              ? heads.find((h) => offlineMap.has(h.id))
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
              {headOffline && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-slate-500 border border-background"
                  title="Offline — valve shut"
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
  offlineMap,
  searchQuery,
  setSearchQuery,
  onJumpToPin,
}: {
  results: Sprinkler[];
  issues: SprinklerIssue[];
  offlineMap: OfflineMap;
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
                        <StatusPill
                          openIssue={openIssue}
                          offline={offlineMap.get(s.id) ?? null}
                        />
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
