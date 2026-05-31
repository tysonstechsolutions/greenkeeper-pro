"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  User,
  Save,
  Loader2,
  Shield,
  Phone,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/hooks/useAuth";
import { directSelectRow, directPatchRow } from "@/lib/supabase/rest";
import type { UserRole } from "@/types/database";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "super", label: "Superintendent" },
  { value: "asst_super", label: "Asst. Superintendent" },
  { value: "foreman", label: "Foreman" },
  { value: "mechanic", label: "Mechanic" },
  { value: "crew", label: "Crew" },
  { value: "seasonal", label: "Seasonal" },
  { value: "pro", label: "Pro Shop" },
  { value: "director", label: "Director" },
];

interface StaffProfile {
  id: string;
  email: string;
  full_name: string;
  display_name: string | null;
  role: UserRole;
  phone: string | null;
  hire_date: string | null;
  is_active: boolean;
}

function PageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const staffId = searchParams.get("id") ?? "";
  const { isSuper, isAsstSuper, isDirector, isGM } = useAuth();
  // Anyone in the upper-management bucket can edit staff. Mirrors the
  // canEditStaff gate on /staff so the Edit Profile button doesn't lead
  // to a "Not Authorized" screen for those roles.
  const canEdit = isSuper || isAsstSuper || isDirector || isGM;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("crew");
  const [hireDate, setHireDate] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    async function fetchStaff() {
      setLoading(true);
      try {
        // Direct REST so the page can't wedge on a stalled supabase-js
        // auth wrapper. The previous withTimeout() wrapper raced against
        // a 15s ceiling, but that's still a long time to stare at a
        // spinner — the cached-token path doesn't even acquire the
        // wrapper's lock.
        const staff = await directSelectRow<StaffProfile>(
          "profiles",
          "id",
          staffId,
          "id, email, full_name, display_name, role, phone, hire_date, is_active",
          "settings.staff.view.fetch",
        );
        if (!staff) {
          setError("Staff member not found");
          return;
        }
        setFullName(staff.full_name || "");
        setDisplayName(staff.display_name || "");
        setPhone(staff.phone || "");
        setRole(staff.role);
        setHireDate(staff.hire_date || "");
        setIsActive(staff.is_active);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load staff");
      } finally {
        setLoading(false);
      }
    }

    if (staffId) fetchStaff();
  }, [staffId]);

  const handleSave = async () => {
    if (!staffId) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Direct REST so the save can't wedge on a stalled supabase-js
      // auth wrapper. RLS still validates via JWT.
      await directPatchRow(
        "profiles",
        "id",
        staffId,
        {
          full_name: fullName,
          display_name: displayName || null,
          phone: phone || null,
          role,
          hire_date: hireDate || null,
          is_active: isActive,
        },
        "settings.staff.view.save",
      );
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <div className="p-4 md:p-6 pb-24">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Not Authorized</h1>
        </div>
        <p className="text-muted-foreground">You don&apos;t have permission to edit staff profiles.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 pb-24">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Edit Staff Member</h1>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Edit Staff Member
          </h1>
          <p className="text-sm text-muted-foreground">Update profile information and role</p>
        </div>
      </div>

      {/* Error / Success banners */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
          Profile updated successfully!
        </div>
      )}

      {/* Form */}
      <div className="max-w-xl space-y-5">
        {/* Full Name */}
        <div className="space-y-1.5">
          <Label htmlFor="fullName" className="flex items-center gap-1.5 text-sm font-medium">
            <User className="w-3.5 h-3.5" /> Full Name
          </Label>
          <Input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Enter full name"
          />
        </div>

        {/* Display Name */}
        <div className="space-y-1.5">
          <Label htmlFor="displayName" className="text-sm font-medium">Display Name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Optional nickname or preferred name"
          />
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <Label htmlFor="phone" className="flex items-center gap-1.5 text-sm font-medium">
            <Phone className="w-3.5 h-3.5" /> Phone
          </Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            type="tel"
          />
        </div>

        {/* Role */}
        <div className="space-y-1.5">
          <Label htmlFor="role" className="flex items-center gap-1.5 text-sm font-medium">
            <Shield className="w-3.5 h-3.5" /> Role
          </Label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* Hire Date */}
        <div className="space-y-1.5">
          <Label htmlFor="hireDate" className="flex items-center gap-1.5 text-sm font-medium">
            <Calendar className="w-3.5 h-3.5" /> Hire Date
          </Label>
          <Input
            id="hireDate"
            value={hireDate}
            onChange={(e) => setHireDate(e.target.value)}
            type="date"
          />
        </div>

        {/* Active Status */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => setIsActive(!isActive)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isActive ? "bg-green-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isActive ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <Label className="text-sm font-medium">
            {isActive ? "Active" : "Inactive"}
          </Label>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Button onClick={handleSave} disabled={saving || !fullName.trim()}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="text-sm text-muted-foreground animate-pulse">Loading…</div></div>}>
      <PageContent />
    </Suspense>
  );
}
