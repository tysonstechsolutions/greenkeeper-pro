"use client";

import { useState } from "react";
import {
  Loader2,
  Save,
  CheckCircle,
  Copy,
  AlertCircle,
  KeyRound,
  UserPlus,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  directInsertRow,
  getCachedUserId,
} from "@/lib/supabase/rest";
import { callApi } from "@/lib/api/client";
import type { Invite, InviteRole } from "@/types/database";

// Roles a manager can hand out via the manual-add flow. Mirrors the
// invite-only set in the old /settings/invite page (no super/pro/director
// — those need to be provisioned by Anthropic-side admin tooling).
const ROLE_OPTIONS: { value: InviteRole; label: string }[] = [
  { value: "crew", label: "Crew Member" },
  { value: "seasonal", label: "Seasonal / Part-Time" },
  { value: "mechanic", label: "Mechanic / Equipment Tech" },
  { value: "foreman", label: "Foreman / Crew Lead" },
  { value: "asst_super", label: "Assistant Superintendent" },
  { value: "director", label: "Director / MWR Leadership" },
  { value: "gm", label: "General Manager" },
];

/** 4-digit numeric PIN, padded so leading zeros are preserved. */
function generatePin(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

interface AddStaffSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful add so the parent can refetch the list. */
  onAdded?: () => void;
}

interface PinSignupResponse {
  success: boolean;
  user?: { id: string; name: string; role: string };
  // The pin-signup edge function returns a session for the *new* staff
  // member. We deliberately ignore it — the manager is the one filling
  // out this form, so we don't want to swap their session.
  session?: {
    access_token: string;
    refresh_token: string;
  } | null;
  redirectPath?: string;
  error?: string;
}

/**
 * Manual "Add Staff" sheet — replaces the old email-based invite flow.
 * The manager fills in the new team member's name, role, and (optionally)
 * phone, and the system provisions their account immediately with a
 * generated PIN that the manager hands to the staff member in person.
 *
 * No email is ever sent. No invite link needs to be shared. The new staff
 * row appears in the staff list as soon as the form succeeds.
 */
export function AddStaffSheet({
  open,
  onOpenChange,
  onAdded,
}: AddStaffSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col"
      >
        <SheetTitle className="sr-only">Add staff member</SheetTitle>
        <SheetDescription className="sr-only">
          Create a new staff record manually. Generates a PIN you can hand
          to them in person if they ever need to sign in.
        </SheetDescription>

        {open && (
          <AddStaffForm
            // Fresh state each time the sheet opens.
            key={String(open)}
            onAdded={onAdded}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

interface AddStaffFormProps {
  onAdded?: () => void;
  onClose: () => void;
}

function AddStaffForm({ onAdded, onClose }: AddStaffFormProps) {
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<InviteRole>("crew");
  const [phone, setPhone] = useState("");
  // PIN is generated once per form session so re-clicking Submit
  // doesn't randomize it on the user mid-flow. They can request a new
  // one with the "Regenerate" button.
  const [pin, setPin] = useState<string>(() => generatePin());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After success we keep the form filled but show a "saved" panel with
  // the PIN highlighted, so the manager can write it down before closing.
  const [savedName, setSavedName] = useState<string | null>(null);
  const [pinCopied, setPinCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError("Full name is required.");
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setError("PIN must be 4–6 digits.");
      return;
    }

    const managerId = getCachedUserId();
    if (!managerId) {
      setError("You must be signed in to add staff.");
      return;
    }

    setSubmitting(true);
    try {
      // Step 1: provision an invite row so we have a token to pass to
      // the existing pin-signup edge function. No email field — this is
      // the whole point of the manual flow.
      const invite = await directInsertRow<Invite>(
        "invites",
        {
          role,
          email: null,
          created_by: managerId,
        },
        "addStaff.createInvite",
      );

      // Step 2: call pin-signup with the invite token + the staff
      // member's profile data. The edge function creates the auth user,
      // profile row, and pin_codes entry in one atomic shot.
      const result = await callApi<PinSignupResponse>("pin-signup", {
        method: "POST",
        body: {
          token: invite.token,
          fullName: trimmedName,
          phone: phone.trim() || null,
          pin,
        },
      });

      if (!result?.success) {
        throw new Error(result?.error || "Failed to add staff member.");
      }

      // Deliberately discard `result.session` — we don't want to log
      // the manager out and into the new staff member's account.

      setSavedName(trimmedName);
      onAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const copyPin = async () => {
    try {
      await navigator.clipboard.writeText(pin);
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 1500);
    } catch {
      // Clipboard might be denied — ignore, user can read the PIN.
    }
  };

  const startAnother = () => {
    setSavedName(null);
    setFullName("");
    setPhone("");
    setRole("crew");
    setPin(generatePin());
    setPinCopied(false);
    setError(null);
  };

  // ── Success view ─────────────────────────────────────────────────────
  if (savedName) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-border">
          <div className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            Added {savedName}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            They&apos;re on the team now. Hand them the PIN below if they need to sign in.
          </div>
        </div>

        <div className="px-4 py-6 flex-1 overflow-y-auto space-y-4">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              <KeyRound className="w-3.5 h-3.5" />
              Their PIN
            </div>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-mono font-bold tabular-nums tracking-wider">
                {pin}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={copyPin}
                className="ml-auto"
              >
                {pinCopied ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 leading-snug">
              Write it down or copy it now — it won&apos;t be shown again.
              They use this PIN at the sign-in screen on the app.
            </p>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border flex flex-col gap-2">
          <Button onClick={startAnother} variant="outline" className="w-full">
            <UserPlus className="w-4 h-4 mr-2" />
            Add another
          </Button>
          <Button onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      </div>
    );
  }

  // ── Form view ────────────────────────────────────────────────────────
  return (
    <form onSubmit={submit} className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <div className="text-sm font-semibold">Add staff member</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Creates the account directly — no email, no invite link.
        </div>
      </div>

      <div className="px-4 py-4 flex-1 overflow-y-auto space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="add-staff-name">Full name *</Label>
          <Input
            id="add-staff-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. John Smith"
            autoFocus
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="add-staff-role">Role *</Label>
          <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
            <SelectTrigger id="add-staff-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="add-staff-phone">Phone (optional)</Label>
          <Input
            id="add-staff-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(757) 555-1234"
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="add-staff-pin">PIN</Label>
            <button
              type="button"
              onClick={() => setPin(generatePin())}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Regenerate
            </button>
          </div>
          <Input
            id="add-staff-pin"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            pattern="[0-9]{4,6}"
            maxLength={6}
            className="font-mono text-base tabular-nums"
          />
          <p className="text-[11px] text-muted-foreground">
            They&apos;ll use this to sign in if they ever need access.
            You&apos;ll see it again on the next screen so you can copy it.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border flex flex-col gap-2">
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {submitting ? "Adding…" : "Add to team"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={submitting}
          className="w-full"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
