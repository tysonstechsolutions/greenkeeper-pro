"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  ArrowUpFromLine,
  ArrowDownToLine,
  Clock,
  User,
  AlertTriangle,
  Check,
  RefreshCw,
  Loader2,
  Search,
  Wrench,
  Timer,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/hooks/useAuth";
import { useProfiles, getDisplayName, getInitials } from "@/lib/hooks/useProfiles";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/utils/resilient-fetch";

// Types
type TabType = "active" | "available" | "my-gear" | "history";

interface Equipment {
  id: string;
  name: string;
  equipment_type: string;
  make: string | null;
  model: string | null;
  status: string;
  current_hours: number | null;
  location: string | null;
  photo_url: string | null;
}

interface EquipmentCheckout {
  id: string;
  equipment_id: string;
  checked_out_by: string;
  checked_out_at: string;
  expected_return: string;
  returned_at: string | null;
  condition_out: "good" | "fair" | "needs_attention";
  condition_in: "good" | "fair" | "needs_attention" | "damaged" | null;
  notes_out: string;
  notes_in: string | null;
  created_at: string;
  equipment?: Equipment;
  profile?: {
    full_name: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

// Condition badge colors
const conditionColors: Record<string, string> = {
  good: "bg-green-500/10 text-green-600",
  fair: "bg-amber-500/10 text-amber-600",
  needs_attention: "bg-orange-500/10 text-orange-600",
  damaged: "bg-red-500/10 text-red-600",
};

const conditionLabels: Record<string, string> = {
  good: "Good",
  fair: "Fair",
  needs_attention: "Needs Attention",
  damaged: "Damaged",
};

// Helper: Check if checkout is overdue
function isOverdue(expectedReturn: string): boolean {
  return new Date(expectedReturn) < new Date();
}

// Helper: Time ago formatter
function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const secondsAgo = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (secondsAgo < 60) return "just now";
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
  return `${Math.floor(secondsAgo / 86400)}d ago`;
}

// Helper: Format time remaining
function timeRemaining(expectedReturn: string): string {
  const date = new Date(expectedReturn);
  const now = new Date();
  const secondsRemaining = Math.floor((date.getTime() - now.getTime()) / 1000);

  if (secondsRemaining < 0) return "OVERDUE";
  if (secondsRemaining < 60) return "< 1 min";
  if (secondsRemaining < 3600) return `${Math.floor(secondsRemaining / 60)}m`;
  if (secondsRemaining < 86400) return `${Math.floor(secondsRemaining / 3600)}h`;
  return `${Math.floor(secondsRemaining / 86400)}d`;
}

// Avatar component
function Avatar({ initials, size = "md" }: { initials: string; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "w-6 h-6 text-xs",
    md: "w-8 h-8 text-sm",
    lg: "w-10 h-10 text-base",
  };

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-primary/20 text-primary font-semibold flex items-center justify-center flex-shrink-0`}
    >
      {initials}
    </div>
  );
}

// Check Out Modal
function CheckOutModal({
  equipment,
  currentUserId,
  onClose,
  onSubmit,
}: {
  equipment: Equipment;
  currentUserId: string;
  onClose: () => void;
  onSubmit: (data: {
    expectedReturn: string;
    conditionOut: "good" | "fair" | "needs_attention";
    notesOut: string;
  }) => Promise<void>;
}) {
  const [expectedReturn, setExpectedReturn] = useState<string>(() => {
    const now = new Date();
    now.setHours(now.getHours() + 8);
    return now.toISOString().slice(0, 16);
  });
  const [conditionOut, setConditionOut] = useState<"good" | "fair" | "needs_attention">("good");
  const [notesOut, setNotesOut] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        expectedReturn,
        conditionOut,
        notesOut,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check out equipment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="bg-white w-full rounded-t-lg p-6 animate-in slide-in-from-bottom max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Check Out Equipment</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-muted-foreground mb-2">Equipment</p>
          <p className="font-semibold">{equipment.name}</p>
          {equipment.make && equipment.model && (
            <p className="text-sm text-muted-foreground">
              {equipment.make} {equipment.model}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 text-red-600 text-sm rounded border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="text-sm font-semibold block mb-2">Expected Return</label>
            <input
              type="datetime-local"
              value={expectedReturn}
              onChange={(e) => setExpectedReturn(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">When you plan to return this equipment</p>
          </div>

          <div>
            <label className="text-sm font-semibold block mb-2">Condition (on checkout)</label>
            <select
              value={conditionOut}
              onChange={(e) => setConditionOut(e.target.value as any)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="needs_attention">Needs Attention</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold block mb-2">Notes (optional)</label>
            <textarea
              value={notesOut}
              onChange={(e) => setNotesOut(e.target.value)}
              placeholder="Any notes about the equipment condition..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Check Out
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Return Modal
function ReturnModal({
  checkout,
  onClose,
  onSubmit,
}: {
  checkout: EquipmentCheckout;
  onClose: () => void;
  onSubmit: (data: {
    conditionIn: "good" | "fair" | "needs_attention" | "damaged";
    notesIn: string;
  }) => Promise<void>;
}) {
  const [conditionIn, setConditionIn] = useState<"good" | "fair" | "needs_attention" | "damaged">("good");
  const [notesIn, setNotesIn] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        conditionIn,
        notesIn,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to return equipment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="bg-white w-full rounded-t-lg p-6 animate-in slide-in-from-bottom max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Return Equipment</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-muted-foreground mb-2">Equipment</p>
          <p className="font-semibold">{checkout.equipment?.name}</p>
          {checkout.equipment?.make && checkout.equipment?.model && (
            <p className="text-sm text-muted-foreground">
              {checkout.equipment.make} {checkout.equipment.model}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Checked out {timeAgo(checkout.checked_out_at)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 text-red-600 text-sm rounded border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="text-sm font-semibold block mb-2">Condition (on return)</label>
            <select
              value={conditionIn}
              onChange={(e) => setConditionIn(e.target.value as any)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="needs_attention">Needs Attention</option>
              <option value="damaged">Damaged</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold block mb-2">Notes (optional)</label>
            <textarea
              value={notesIn}
              onChange={(e) => setNotesIn(e.target.value)}
              placeholder="Any issues or damage to report..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Return Equipment
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Active Checkout Card
function ActiveCheckoutCard({
  checkout,
  isManager,
  onReturn,
}: {
  checkout: EquipmentCheckout;
  isManager: boolean;
  onReturn: () => void;
}) {
  const overdue = isOverdue(checkout.expected_return);
  const displayName = getDisplayName({
    display_name: checkout.profile?.display_name,
    full_name: checkout.profile?.full_name,
  });
  const initials = getInitials(displayName);

  return (
    <Card className={`${overdue ? "border-red-300 bg-red-50/50" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-sm">{checkout.equipment?.name}</h3>
            {checkout.equipment?.make && checkout.equipment?.model && (
              <p className="text-xs text-muted-foreground">
                {checkout.equipment.make} {checkout.equipment.model}
              </p>
            )}
          </div>
          <Badge className={conditionColors[checkout.condition_out]}>
            {conditionLabels[checkout.condition_out]}
          </Badge>
        </div>

        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-2 text-xs">
            <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="flex items-center gap-2 min-w-0">
              <Avatar initials={initials} size="sm" />
              <span className="truncate">{displayName}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span>Checked out {timeAgo(checkout.checked_out_at)}</span>
          </div>

          <div className={`flex items-center gap-2 text-xs ${overdue ? "text-red-600" : ""}`}>
            <Timer className="w-4 h-4 flex-shrink-0" />
            <span className={overdue ? "font-semibold" : ""}>
              {overdue ? "OVERDUE - " : ""}
              Return in {timeRemaining(checkout.expected_return)}
            </span>
          </div>
        </div>

        {checkout.notes_out && (
          <p className="text-xs text-muted-foreground mb-3 p-2 bg-gray-50 rounded">
            {checkout.notes_out}
          </p>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={onReturn}
          className="w-full"
        >
          <ArrowUpFromLine className="w-4 h-4 mr-2" />
          Return Equipment
        </Button>
      </CardContent>
    </Card>
  );
}

// Available Equipment Card
function AvailableEquipmentCard({
  equipment,
  onCheckOut,
}: {
  equipment: Equipment;
  onCheckOut: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-sm">{equipment.name}</h3>
            {equipment.make && equipment.model && (
              <p className="text-xs text-muted-foreground">
                {equipment.make} {equipment.model}
              </p>
            )}
          </div>
          <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
            Available
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <Wrench className="w-4 h-4" />
          <span className="capitalize">
            {equipment.equipment_type.replace(/_/g, " ")}
          </span>
        </div>

        {equipment.location && (
          <p className="text-xs text-muted-foreground mb-3">
            <strong>Location:</strong> {equipment.location}
          </p>
        )}

        <Button
          size="sm"
          onClick={onCheckOut}
          className="w-full"
        >
          <ArrowDownToLine className="w-4 h-4 mr-2" />
          Check Out
        </Button>
      </CardContent>
    </Card>
  );
}

// Main Page Component
export default function EquipmentCheckoutPage() {
  const router = useRouter();
  const { profile: currentUser, loading: authLoading, isSuper, isAsstSuper } = useAuth();
  const isManager = isSuper || isAsstSuper;

  const [activeTab, setActiveTab] = useState<TabType>("active");
  const [activeCheckouts, setActiveCheckouts] = useState<EquipmentCheckout[]>([]);
  const [availableEquipment, setAvailableEquipment] = useState<Equipment[]>([]);
  const [history, setHistory] = useState<EquipmentCheckout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [showCheckOutModal, setShowCheckOutModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [selectedCheckout, setSelectedCheckout] = useState<EquipmentCheckout | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [activeResult, historyResult, allEquipmentResult] = await Promise.all([
        withTimeout(
          (supabase.from("equipment_checkouts") as any)
            .select(
              "*, equipment:equipment_id(id, name, equipment_type, make, model, status, current_hours, location, photo_url), profile:checked_out_by(full_name, display_name, avatar_url)"
            )
            .is("returned_at", null)
            .order("checked_out_at", { ascending: false }),
          8000,
          { data: null, error: null }
        ),
        withTimeout(
          (supabase.from("equipment_checkouts") as any)
            .select(
              "*, equipment:equipment_id(id, name, equipment_type, make, model), profile:checked_out_by(full_name, display_name, avatar_url)"
            )
            .not("returned_at", "is", null)
            .order("returned_at", { ascending: false })
            .limit(50),
          8000,
          { data: null, error: null }
        ),
        withTimeout(
          (supabase.from("equipment") as any)
            .select("id, name, equipment_type, make, model, status, current_hours, location, photo_url")
            .eq("status", "operational"),
          8000,
          { data: null, error: null }
        ),
      ]);

      if (activeResult.error) {
        throw activeResult.error;
      }
      if (historyResult.error) {
        throw historyResult.error;
      }
      if (allEquipmentResult.error) {
        throw allEquipmentResult.error;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const active = (activeResult.data as any) || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hist = (historyResult.data as any) || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allEquip = (allEquipmentResult.data as any) || [];

      setActiveCheckouts(active);
      setHistory(hist);

      // Filter to only available equipment (not currently checked out)
      const checkedOutIds = new Set(active.map((c: EquipmentCheckout) => c.equipment_id));
      setAvailableEquipment(allEquip.filter((e: Equipment) => !checkedOutIds.has(e.id)));
    } catch (err) {
      console.error("Error fetching equipment data:", err);
      setError(err instanceof Error ? err.message : "Failed to load equipment data");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Initial fetch
  useEffect(() => {
    if (!authLoading) {
      fetchData();
    }
  }, [authLoading, fetchData]);

  // Handle check out
  const handleCheckOut = useCallback(
    async (data: {
      expectedReturn: string;
      conditionOut: "good" | "fair" | "needs_attention";
      notesOut: string;
    }) => {
      if (!selectedEquipment || !currentUser) return;

      setSubmitting(true);
      try {
        const { error: insertError } = await supabase.from("equipment_checkouts").insert({
          equipment_id: selectedEquipment.id,
          checked_out_by: currentUser.id,
          expected_return: data.expectedReturn,
          condition_out: data.conditionOut,
          notes_out: data.notesOut,
        });

        if (insertError) throw insertError;

        setSelectedEquipment(null);
        setShowCheckOutModal(false);
        await fetchData();
      } catch (err) {
        throw err instanceof Error ? err : new Error("Failed to check out equipment");
      } finally {
        setSubmitting(false);
      }
    },
    [selectedEquipment, currentUser, supabase, fetchData]
  );

  // Handle return
  const handleReturn = useCallback(
    async (data: {
      conditionIn: "good" | "fair" | "needs_attention" | "damaged";
      notesIn: string;
    }) => {
      if (!selectedCheckout) return;

      setSubmitting(true);
      try {
        const { error: updateError } = await supabase
          .from("equipment_checkouts")
          .update({
            returned_at: new Date().toISOString(),
            condition_in: data.conditionIn,
            notes_in: data.notesIn,
          })
          .eq("id", selectedCheckout.id);

        if (updateError) throw updateError;

        setSelectedCheckout(null);
        setShowReturnModal(false);
        await fetchData();
      } catch (err) {
        throw err instanceof Error ? err : new Error("Failed to return equipment");
      } finally {
        setSubmitting(false);
      }
    },
    [selectedCheckout, supabase, fetchData]
  );

  // Filter available equipment by search
  const filteredAvailable = useMemo(() => {
    if (!searchQuery) return availableEquipment;
    const query = searchQuery.toLowerCase();
    return availableEquipment.filter(
      (e) =>
        e.name.toLowerCase().includes(query) ||
        e.make?.toLowerCase().includes(query) ||
        e.model?.toLowerCase().includes(query) ||
        e.equipment_type.toLowerCase().includes(query)
    );
  }, [availableEquipment, searchQuery]);

  // Get user's active checkouts
  const myCheckouts = useMemo(() => {
    if (!currentUser) return [];
    return activeCheckouts.filter((c) => c.checked_out_by === currentUser.id);
  }, [activeCheckouts, currentUser]);

  // Calculate stats
  const overdueCount = useMemo(
    () => activeCheckouts.filter((c) => isOverdue(c.expected_return)).length,
    [activeCheckouts]
  );

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold flex items-center gap-2 mb-4">
            <Package className="w-6 h-6 text-primary" />
            Equipment Checkout
          </h1>

          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <p className="text-xs text-blue-600 font-semibold">OUT</p>
              <p className="text-2xl font-bold text-blue-700">{activeCheckouts.length}</p>
            </div>
            <div className={`${overdueCount > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"} rounded-lg p-3 border`}>
              <p className={`text-xs font-semibold ${overdueCount > 0 ? "text-red-600" : "text-green-600"}`}>
                OVERDUE
              </p>
              <p className={`text-2xl font-bold ${overdueCount > 0 ? "text-red-700" : "text-green-700"}`}>
                {overdueCount}
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
              <p className="text-xs text-green-600 font-semibold">AVAILABLE</p>
              <p className="text-2xl font-bold text-green-700">{availableEquipment.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Error loading equipment</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b overflow-x-auto">
          {[
            { id: "active" as TabType, label: "Active", icon: ArrowDownToLine },
            { id: "available" as TabType, label: "Available", icon: Package },
            { id: "my-gear" as TabType, label: "My Gear", icon: User },
            { id: "history" as TabType, label: "History", icon: Clock },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 font-semibold text-sm whitespace-nowrap flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Active Tab Content */}
        {activeTab === "active" && (
          <div>
            {activeCheckouts.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Package className="w-12 h-12 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-muted-foreground">No equipment currently checked out</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {activeCheckouts.map((checkout) => (
                  <ActiveCheckoutCard
                    key={checkout.id}
                    checkout={checkout}
                    isManager={isManager}
                    onReturn={() => {
                      setSelectedCheckout(checkout);
                      setShowReturnModal(true);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Available Tab Content */}
        {activeTab === "available" && (
          <div>
            {availableEquipment.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <AlertTriangle className="w-12 h-12 text-amber-600 mx-auto mb-2 opacity-50" />
                  <p className="text-muted-foreground">No equipment available for checkout</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="mb-4 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search equipment..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {filteredAvailable.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Package className="w-12 h-12 text-muted-foreground mx-auto mb-2 opacity-50" />
                      <p className="text-muted-foreground">No equipment matches your search</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-3">
                    {filteredAvailable.map((equipment) => (
                      <AvailableEquipmentCard
                        key={equipment.id}
                        equipment={equipment}
                        onCheckOut={() => {
                          setSelectedEquipment(equipment);
                          setShowCheckOutModal(true);
                        }}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* My Gear Tab Content */}
        {activeTab === "my-gear" && (
          <div>
            {myCheckouts.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Package className="w-12 h-12 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-muted-foreground">You have no active checkouts</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {myCheckouts.map((checkout) => (
                  <ActiveCheckoutCard
                    key={checkout.id}
                    checkout={checkout}
                    isManager={false}
                    onReturn={() => {
                      setSelectedCheckout(checkout);
                      setShowReturnModal(true);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* History Tab Content */}
        {activeTab === "history" && (
          <div>
            {history.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-muted-foreground">No equipment returns in the last 7 days</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {history.map((checkout) => (
                  <Card key={checkout.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-sm">{checkout.equipment?.name}</h3>
                          {checkout.equipment?.make && checkout.equipment?.model && (
                            <p className="text-xs text-muted-foreground">
                              {checkout.equipment.make} {checkout.equipment.model}
                            </p>
                          )}
                        </div>
                        {checkout.condition_in && (
                          <Badge className={conditionColors[checkout.condition_in]}>
                            {conditionLabels[checkout.condition_in]}
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="w-4 h-4 flex-shrink-0" />
                          <span>
                            {getDisplayName({
                              display_name: checkout.profile?.display_name,
                              full_name: checkout.profile?.full_name,
                            })}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="w-4 h-4 flex-shrink-0" />
                          <span>Returned {timeAgo(checkout.returned_at || "")}</span>
                        </div>

                        {checkout.notes_in && (
                          <p className="p-2 bg-gray-50 rounded text-muted-foreground">
                            {checkout.notes_in}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCheckOutModal && selectedEquipment && (
        <CheckOutModal
          equipment={selectedEquipment}
          currentUserId={currentUser?.id || ""}
          onClose={() => {
            setShowCheckOutModal(false);
            setSelectedEquipment(null);
          }}
          onSubmit={handleCheckOut}
        />
      )}

      {showReturnModal && selectedCheckout && (
        <ReturnModal
          checkout={selectedCheckout}
          onClose={() => {
            setShowReturnModal(false);
            setSelectedCheckout(null);
          }}
          onSubmit={handleReturn}
        />
      )}
    </div>
  );
}
