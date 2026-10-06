"use client";

import { useState, useEffect, useCallback } from "react";
import {
  directSelectList,
  directInsertRow,
  directPatchRow,
  directDeleteRow,
} from "@/lib/supabase/rest";
import { useAuth } from "@/lib/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  KeyRound,
  Plus,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Check,
  ArrowLeft,
  Pencil,
  X,
} from "lucide-react";
import Link from "next/link";
import { generatePin, pinProblem } from "@/lib/auth/pins";

interface PinEntry {
  id: string;
  user_id: string;
  pin: string;
  is_active: boolean;
  profile?: {
    full_name: string;
    role: string;
    email: string;
  };
}

interface StaffMember {
  id: string;
  full_name: string;
  role: string;
  email: string;
}

const DUPLICATE = "Someone else already has that PIN. Pick another.";
const isDuplicate = (err: unknown) => /duplicate|unique|23505/i.test(err instanceof Error ? err.message : String(err));

export default function PinManagementPage() {
  // The superintendent, the assistant superintendent, and the GM manage PINs
  // (the database allows exactly these three: 20261013120000_gm_manages_pins).
  const { isSuper, isAsstSuper, isGM } = useAuth();
  const canManage = isSuper || isAsstSuper || isGM;
  const [pins, setPins] = useState<PinEntry[]>([]);
  const [staffWithoutPins, setStaffWithoutPins] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showPins, setShowPins] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // The PIN being typed in for one person.
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // No declared FK between pin_codes.user_id and profiles.id, so we
      // can't ask PostgREST to embed the relationship — do two queries
      // and stitch them in JS. Keeps the page working without a schema
      // change. Direct REST so the page doesn't wedge on a stalled
      // supabase-js auth wrapper.
      type PinRow = { id: string; user_id: string; pin: string; is_active: boolean };
      const [pinData, allStaff] = await Promise.all([
        directSelectList<PinRow>("pin_codes", {
          columns: "id, user_id, pin, is_active",
          orderBy: [{ column: "created_at", ascending: true }],
          label: "settings.pins.fetchPins",
        }),
        directSelectList<StaffMember>("profiles", {
          columns: "id, full_name, role, email",
          filters: [`is_active=eq.true`],
          orderBy: [{ column: "full_name", ascending: true }],
          label: "settings.pins.fetchStaff",
        }),
      ]);

      const profileById = new Map(
        allStaff.map((s: StaffMember) => [
          s.id,
          { full_name: s.full_name, role: s.role, email: s.email },
        ]),
      );

      const pinsWithProfile: PinEntry[] = pinData.map((p: PinRow) => ({
        id: p.id,
        user_id: p.user_id,
        pin: p.pin,
        is_active: p.is_active,
        profile: profileById.get(p.user_id),
      }));

      // Everyone on staff can have a PIN: crew, the F&B Manager, the pro shop, managers.
      const pinUserIds = new Set(pinData.map((p: PinRow) => p.user_id));
      const withoutPins = allStaff.filter((s: StaffMember) => !pinUserIds.has(s.id));

      setPins(pinsWithProfile);
      setStaffWithoutPins(withoutPins);
    } catch (err) {
      console.error("Error fetching PIN data:", err);
      setError("Failed to load PIN data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreatePin = async (staffMember: StaffMember) => {
    setSaving(staffMember.id);
    setError(null);

    const newPin = generatePin(takenPins());

    try {
      await directInsertRow(
        "pin_codes",
        {
          user_id: staffMember.id,
          pin: newPin,
          is_active: true,
        },
        "settings.pins.create",
      );
      setSuccess(`PIN ${newPin} created for ${staffMember.full_name}`);
      setTimeout(() => setSuccess(null), 3000);
      await fetchData();
    } catch (err) {
      if (isDuplicate(err)) {
        setError(`${staffMember.full_name} may already have a PIN, or that PIN was just taken. Reload and try again.`);
      } else {
        console.error("Error creating PIN:", err);
        setError("Failed to create PIN");
      }
    } finally {
      setSaving(null);
    }
  };

  /** PINs in use, leaving out one person's own. */
  const takenPins = (exceptId?: string) =>
    new Set(pins.filter((p) => p.is_active && p.id !== exceptId).map((p) => p.pin));

  const handleSetPin = async (pinEntry: PinEntry, value: string) => {
    const pin = value.trim();
    const problem = pinProblem(pin, takenPins(pinEntry.id));
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(pinEntry.id);
    setError(null);
    try {
      await directPatchRow("pin_codes", "id", pinEntry.id, { pin }, "settings.pins.set");
      setEditing(null);
      setSuccess(`${pinEntry.profile?.full_name || "Their"} PIN is now ${pin}`);
      setTimeout(() => setSuccess(null), 4000);
      await fetchData();
    } catch (err) {
      console.error("Error setting PIN:", err);
      setError(isDuplicate(err) ? DUPLICATE : "Failed to change the PIN");
    } finally {
      setSaving(null);
    }
  };

  const handleRegeneratePin = async (pinEntry: PinEntry) => {
    setSaving(pinEntry.id);
    setError(null);

    const newPin = generatePin(takenPins(pinEntry.id));

    try {
      await directPatchRow(
        "pin_codes",
        "id",
        pinEntry.id,
        { pin: newPin },
        "settings.pins.regenerate",
      );
      setSuccess(
        `New PIN ${newPin} generated for ${pinEntry.profile?.full_name || "user"}`
      );
      setTimeout(() => setSuccess(null), 3000);
      await fetchData();
    } catch (err) {
      console.error("Error regenerating PIN:", err);
      setError(isDuplicate(err) ? DUPLICATE : "Failed to regenerate PIN");
    } finally {
      setSaving(null);
    }
  };

  const handleToggleActive = async (pinEntry: PinEntry) => {
    setSaving(pinEntry.id);

    try {
      await directPatchRow(
        "pin_codes",
        "id",
        pinEntry.id,
        { is_active: !pinEntry.is_active },
        "settings.pins.toggle",
      );
      await fetchData();
    } catch (err) {
      console.error("Error toggling PIN:", err);
      setError(isDuplicate(err) ? "Someone else is using that PIN now. Give this person a new PIN first." : "Failed to update PIN status");
    } finally {
      setSaving(null);
    }
  };

  const handleDeletePin = async (pinEntry: PinEntry) => {
    if (
      !confirm(
        `Remove PIN for ${pinEntry.profile?.full_name || "this user"}? They won't be able to use PIN login until a new one is created.`
      )
    ) {
      return;
    }

    setSaving(pinEntry.id);

    try {
      await directDeleteRow(
        "pin_codes",
        "id",
        pinEntry.id,
        "settings.pins.delete",
      );
      await fetchData();
    } catch (err) {
      console.error("Error deleting PIN:", err);
      setError("Failed to delete PIN");
    } finally {
      setSaving(null);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "mechanic":
        return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
      case "crew":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "foreman":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "seasonal":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
      case "fb_manager":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      case "pro":
        return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      crew: "Crew Member",
      mechanic: "Mechanic",
      foreman: "Foreman",
      seasonal: "Seasonal",
      asst_super: "Asst. Superintendent",
      super: "Superintendent",
      director: "Director",
      gm: "General Manager",
      fb_manager: "F&B Manager",
      pro: "Pro Shop",
    };
    return labels[role] || role;
  };

  if (!canManage) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">
          You don&apos;t have permission to manage PINs.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <Link
          href="/settings"
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-primary" />
            PIN Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everyone&apos;s sign-in PIN: see it, set it, change it, or turn it off
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPins(!showPins)}
        >
          {showPins ? (
            <>
              <EyeOff className="w-4 h-4 mr-1" /> Hide PINs
            </>
          ) : (
            <>
              <Eye className="w-4 h-4 mr-1" /> Show PINs
            </>
          )}
        </Button>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-destructive/60 hover:text-destructive"
          >
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm mb-4">
          <Check className="w-4 h-4 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Existing PINs */}
          <div className="bg-card rounded-xl border border-border shadow-sm mb-6">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold">Active PINs ({pins.length})</h2>
            </div>

            {pins.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <KeyRound className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No PINs created yet. Add PINs for your crew below.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pins.map((pinEntry) => (
                  <div
                    key={pinEntry.id}
                    className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2"
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                      {(pinEntry.profile?.full_name || "?")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-[8rem]">
                      <p className="font-medium text-foreground truncate">
                        {pinEntry.profile?.full_name || "Unknown User"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${getRoleBadgeColor(
                            pinEntry.profile?.role || ""
                          )}`}
                        >
                          {getRoleLabel(pinEntry.profile?.role || "")}
                        </span>
                        {!pinEntry.is_active && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            Disabled
                          </span>
                        )}
                      </div>
                    </div>

                    {/* PIN: shown, hidden, or being changed */}
                    {editing?.id === pinEntry.id ? (
                      <form
                        className="order-last basis-full flex items-center gap-1 pl-14"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void handleSetPin(pinEntry, editing.value);
                        }}
                      >
                        <input
                          autoFocus
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          value={editing.value}
                          onChange={(e) => setEditing({ id: pinEntry.id, value: e.target.value.replace(/\D/g, "") })}
                          aria-label={`New PIN for ${pinEntry.profile?.full_name || "this person"}`}
                          className="w-24 rounded-lg border border-border bg-background px-2 py-1 font-mono text-lg tracking-widest text-center"
                        />
                        <Button type="submit" size="sm" disabled={saving === pinEntry.id}>
                          Save
                        </Button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
                          aria-label="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </form>
                    ) : (
                      <div className="font-mono text-lg font-bold tracking-widest text-foreground min-w-[80px] text-center">
                        {showPins ? pinEntry.pin : "••••"}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setError(null);
                          setEditing({ id: pinEntry.id, value: "" });
                        }}
                        disabled={saving === pinEntry.id}
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        title="Set PIN"
                        aria-label={`Set PIN for ${pinEntry.profile?.full_name || "this person"}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRegeneratePin(pinEntry)}
                        disabled={saving === pinEntry.id}
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        title="Regenerate PIN"
                      >
                        {saving === pinEntry.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleToggleActive(pinEntry)}
                        disabled={saving === pinEntry.id}
                        className={`p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50 ${
                          pinEntry.is_active
                            ? "text-green-600 hover:text-green-700"
                            : "text-red-500 hover:text-red-600"
                        }`}
                        title={
                          pinEntry.is_active ? "Disable PIN" : "Enable PIN"
                        }
                      >
                        {pinEntry.is_active ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <AlertCircle className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeletePin(pinEntry)}
                        disabled={saving === pinEntry.id}
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                        title="Delete PIN"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Staff Without PINs */}
          {staffWithoutPins.length > 0 && (
            <div className="bg-card rounded-xl border border-border shadow-sm">
              <div className="p-4 border-b border-border">
                <h2 className="font-semibold">
                  Staff Without PINs ({staffWithoutPins.length})
                </h2>
              </div>
              <div className="divide-y divide-border">
                {staffWithoutPins.map((staff) => (
                  <div
                    key={staff.id}
                    className="p-4 flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-semibold text-sm">
                      {staff.full_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{staff.full_name}</p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${getRoleBadgeColor(
                          staff.role
                        )}`}
                      >
                        {getRoleLabel(staff.role)}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleCreatePin(staff)}
                      disabled={saving === staff.id}
                    >
                      {saving === staff.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-1" />
                          Create PIN
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Help */}
          <div className="mt-6 p-4 rounded-xl bg-muted/50 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-2">How PIN Login Works</p>
            <p>
              PINs let staff sign in quickly on shared devices (like the shop iPad) without an
              email and password. Everyone&apos;s PIN is different, 4 to 6 digits. Use the pencil
              to set a PIN yourself, the arrows for a random one, the check to turn a PIN off or
              back on, and the trash can to remove it. A changed PIN works right away; tell the
              person their new one.
            </p>
            <p className="mt-2">
              A PIN only signs in someone added with Add Staff (PIN sign-in). People who sign in
              with an email and password keep doing that.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
