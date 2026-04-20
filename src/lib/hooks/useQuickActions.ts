"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  Plus,
  Camera,
  Map,
  FlaskConical,
  Wrench,
  FileText,
  Archive,
  Scan,
  Flag,
  Lightbulb,
  Users,
  ClipboardList,
  Calendar,
  Droplets,
  ShoppingCart,
  Building,
  Car,
  Cloud,
  MessageSquare,
  Bot,
  Vote,
  MapPin,
  ClipboardCheck,
  Trophy,
  Leaf,
  BookOpen,
  Mic,
  ShieldCheck,
} from "lucide-react";

export interface QuickActionDef {
  id: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

// Master catalogue of every quick action a user can pin to their dashboard.
// Stable `id` values (NOT the label) are what get persisted, so labels can
// change later without orphaning anyone's saved selection.
export const QUICK_ACTION_CATALOGUE: QuickActionDef[] = [
  { id: "new-task", href: "/tasks/new", label: "New Task", icon: Plus, color: "from-blue-500 to-blue-600" },
  { id: "take-photo", href: "/photos", label: "Take Photo", icon: Camera, color: "from-emerald-500 to-emerald-600" },
  { id: "course-map", href: "/course-map", label: "Course Map", icon: Map, color: "from-teal-500 to-teal-600" },
  { id: "log-chemical", href: "/chemicals/apply", label: "Log Chemical", icon: FlaskConical, color: "from-amber-500 to-amber-600" },
  { id: "equipment", href: "/equipment", label: "Equipment", icon: Wrench, color: "from-orange-500 to-orange-600" },
  { id: "reports", href: "/reports", label: "Reports", icon: FileText, color: "from-[#1B4332] to-[#2D6A4F]" },
  { id: "assets", href: "/assets", label: "Assets", icon: Archive, color: "from-amber-600 to-amber-700" },
  { id: "scan-asset", href: "/assets/scan", label: "Scan Asset", icon: Scan, color: "from-cyan-500 to-cyan-600" },
  { id: "report-issue", href: "/report-issue", label: "Report Issue", icon: Flag, color: "from-red-500 to-red-600" },
  { id: "feedback", href: "/feedback", label: "Feedback", icon: Lightbulb, color: "from-yellow-500 to-yellow-600" },
  { id: "staff", href: "/staff", label: "Staff", icon: Users, color: "from-indigo-500 to-indigo-600" },
  { id: "tasks", href: "/tasks", label: "All Tasks", icon: ClipboardList, color: "from-blue-600 to-blue-700" },
  { id: "schedule", href: "/schedule", label: "Schedule", icon: Calendar, color: "from-purple-500 to-purple-600" },
  { id: "irrigation", href: "/irrigation", label: "Irrigation", icon: Droplets, color: "from-sky-500 to-sky-600" },
  { id: "order-list", href: "/order-list", label: "Order List", icon: ShoppingCart, color: "from-emerald-600 to-green-600" },
  { id: "clubhouse", href: "/clubhouse", label: "Clubhouse", icon: Building, color: "from-amber-600 to-orange-600" },
  { id: "parking-lot", href: "/parking-lot", label: "Parking & Paths", icon: Car, color: "from-slate-500 to-slate-600" },
  { id: "weather", href: "/weather", label: "Weather", icon: Cloud, color: "from-blue-500 to-sky-600" },
  { id: "messages", href: "/messages", label: "Messages", icon: MessageSquare, color: "from-violet-500 to-purple-600" },
  { id: "assistant", href: "/assistant", label: "AI Assistant", icon: Bot, color: "from-violet-600 to-purple-700" },
  { id: "polls", href: "/polls", label: "Polls", icon: Vote, color: "from-pink-500 to-pink-600" },
  { id: "pin-sheet", href: "/settings/pin-sheet", label: "Pin Sheet", icon: MapPin, color: "from-red-600 to-rose-600" },
  { id: "inspections", href: "/inspections", label: "Inspections", icon: ClipboardCheck, color: "from-indigo-600 to-indigo-700" },
  { id: "tournaments", href: "/tournaments", label: "Tournaments", icon: Trophy, color: "from-amber-500 to-yellow-600" },
  { id: "environmental", href: "/environmental", label: "Environmental", icon: Leaf, color: "from-green-500 to-green-600" },
  { id: "knowledge", href: "/knowledge", label: "Knowledge Base", icon: BookOpen, color: "from-orange-500 to-orange-600" },
  { id: "voice-log", href: "/voice-log", label: "Voice Log", icon: Mic, color: "from-violet-500 to-purple-600" },
  { id: "compliance", href: "/compliance", label: "IL RUP", icon: ShieldCheck, color: "from-teal-500 to-teal-600" },
];

const STORAGE_KEY = "vmgc:dashboard-quick-actions:v1";
const EVENT_NAME = "vmgc:quick-actions-changed";
const DEFAULT_IDS = ["new-task", "take-photo", "assets", "scan-asset", "course-map", "equipment"];
const MIN_ACTIONS = 2;
const MAX_ACTIONS = 8;

// ── Module-level singleton store ────────────────────────────────────────────
// useSyncExternalStore lets every mounted hook subscribe to the SAME backing
// store (localStorage + an in-memory cache). Without this, each hook call had
// its own useState copy, and saving in the CustomizeSheet wouldn't refresh the
// Dashboard grid in the same render.

let cachedIds: string[] | null = null;

function readFromStorage(): string[] {
  if (typeof window === "undefined") return DEFAULT_IDS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_IDS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string")) {
      return DEFAULT_IDS;
    }
    const validIds = new Set(QUICK_ACTION_CATALOGUE.map((a) => a.id));
    const filtered = parsed.filter((id) => validIds.has(id));
    return filtered.length >= MIN_ACTIONS ? filtered : DEFAULT_IDS;
  } catch {
    return DEFAULT_IDS;
  }
}

function writeToStorage(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage can throw in private mode / over quota; selection still
    // applies in-memory for this session.
  }
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

function getSnapshot(): string[] {
  if (cachedIds === null) cachedIds = readFromStorage();
  return cachedIds;
}

function getServerSnapshot(): string[] {
  return DEFAULT_IDS;
}

function broadcast(ids: string[]) {
  cachedIds = ids;
  writeToStorage(ids);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
}

/**
 * React hook that returns the user's saved dashboard quick-action list and a
 * setter. Selections are stored in localStorage under a single key so a user
 * who clears data sees the defaults on next visit. All mounted instances of
 * this hook share the same store via useSyncExternalStore + a custom event,
 * so saving from the CustomizeSheet immediately refreshes the Dashboard grid.
 */
export function useQuickActions() {
  const selectedIds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // After hydration, fresh-read storage in case it changed while SSR default
  // was being used. This also bumps cachedIds + notifies listeners.
  useEffect(() => {
    const fresh = readFromStorage();
    if (JSON.stringify(fresh) !== JSON.stringify(cachedIds)) {
      broadcast(fresh);
    }
  }, []);

  const save = useCallback((ids: string[]) => {
    const clamped = ids.slice(0, MAX_ACTIONS);
    if (clamped.length < MIN_ACTIONS) return;
    broadcast(clamped);
  }, []);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    broadcast(DEFAULT_IDS);
  }, []);

  const actions = selectedIds
    .map((id) => QUICK_ACTION_CATALOGUE.find((a) => a.id === id))
    .filter((a): a is QuickActionDef => !!a);

  return {
    actions,
    selectedIds,
    save,
    reset,
    minActions: MIN_ACTIONS,
    maxActions: MAX_ACTIONS,
  };
}
