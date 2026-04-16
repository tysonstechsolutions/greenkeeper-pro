"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, User, Phone, AlertCircle, CheckCircle, KeyRound } from "lucide-react";
import type { Invite, InviteRole } from "@/types/database";

const roleLabels: Record<InviteRole, string> = {
  asst_super: "Assistant Superintendent",
  foreman: "Foreman / Crew Lead",
  mechanic: "Mechanic / Equipment Tech",
  crew: "Crew Member",
  seasonal: "Seasonal / Part-Time",
  director: "Director / MWR Leadership",
  gm: "General Manager",
};

export default function InvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  useEffect(() => {
    async function fetchInvite() {
      const supabase = createClient();

      const { data, error: fetchError } = await supabase
        .from("invites")
        .select("*")
        .eq("token", token)
        .single();

      if (fetchError || !data) {
        setError("Invalid or expired invite link.");
        setLoading(false);
        return;
      }

      const inviteData = data as Invite;

      if (inviteData.used_by) {
        setError("This invite has already been used.");
        setLoading(false);
        return;
      }

      if (new Date(inviteData.expires_at) < new Date()) {
        setError("This invite has expired. Please request a new one.");
        setLoading(false);
        return;
      }

      setInvite(inviteData);
      setLoading(false);
    }

    fetchInvite();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!invite) return;
    if (!/^\d{4,6}$/.test(pin)) {
      setError("PIN must be 4–6 digits.");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs don't match.");
      return;
    }
    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/pin-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          pin,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create account.");
        setSubmitting(false);
        return;
      }

      router.push(data.redirectPath || "/dashboard");
      router.refresh();
    } catch {
      setError("Connection error. Please try again.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Invalid Invite</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => router.push("/pin-login")} variant="outline">
            Go to PIN Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <div className="w-full max-w-md">
        {/* Logo and Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <span className="text-primary-foreground font-bold text-2xl">GK</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Welcome to VMGC</h1>
          <p className="text-muted-foreground mt-1">Set up your crew PIN</p>
        </div>

        {/* Registration Form */}
        <div className="bg-card rounded-xl border border-border shadow-lg p-6">
          {/* Role Badge */}
          {invite && (
            <div className="flex items-center justify-center gap-2 mb-6 p-3 rounded-lg bg-primary/10">
              <CheckCircle className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">
                You&apos;re joining as: <span className="text-primary">{roleLabels[invite.role]}</span>
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="fullName" className="block text-sm font-medium mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Smith"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-background border border-input rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium mb-1.5">
                Phone Number <span className="text-muted-foreground">(optional)</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full pl-10 pr-4 py-3 bg-background border border-input rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label htmlFor="pin" className="block text-sm font-medium mb-1.5">
                Choose a PIN (4–6 digits)
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4,6}"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-background border border-input rounded-xl text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirmPin" className="block text-sm font-medium mb-1.5">
                Confirm PIN
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="confirmPin"
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4,6}"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-background border border-input rounded-xl text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create Account"
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          Veterans Memorial Golf Course
        </p>
      </div>
    </div>
  );
}
