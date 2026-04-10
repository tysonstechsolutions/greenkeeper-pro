"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { registerMember } from "@/lib/hooks/useMember";
import {
  Loader2,
  Mail,
  Lock,
  User,
  Phone,
  AlertCircle,
  CheckCircle,
  ChevronRight,
} from "lucide-react";
import type { MemberType, PreferredTee } from "@/types/member";
import { memberTypeLabels, teeLabels } from "@/types/member";

export default function JoinPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [memberType, setMemberType] = useState<MemberType>("veteran");
  const [handicap, setHandicap] = useState("");
  const [preferredTee, setPreferredTee] = useState<PreferredTee>("white");
  const [wantsUpdates, setWantsUpdates] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await registerMember(
      email,
      password,
      fullName,
      phone || null,
      memberType,
      handicap ? parseFloat(handicap) : null,
      preferredTee,
      wantsUpdates
    );

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.push("/member/home");
    router.refresh();
  };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      if (!fullName || !email || !password) {
        setError("Please fill in all required fields");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }
      setError(null);
      setStep(2);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 dark:from-green-950/20 dark:via-background dark:to-emerald-950/20">
      {/* Header with course image */}
      <div className="relative h-48 bg-gradient-to-br from-green-700 to-emerald-800 overflow-hidden">
        <div className="absolute inset-0 bg-[url('/golf-course-hero.jpg')] bg-cover bg-center opacity-30" />
        <div className="relative z-10 flex flex-col items-center justify-center h-full px-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-white/10 backdrop-blur-sm mb-3">
            <span className="text-white font-bold text-xl">GK</span>
          </div>
          <h1 className="text-xl font-bold text-white text-center">
            Veterans Memorial Golf Course
          </h1>
          <p className="text-green-100 text-sm mt-1">Member Registration</p>
        </div>
      </div>

      <div className="px-4 pb-8 -mt-6">
        {/* Progress Steps */}
        <div className="max-w-md mx-auto mb-6">
          <div className="flex items-center justify-center gap-3">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                step === 1
                  ? "bg-primary text-primary-foreground"
                  : "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
              }`}
            >
              {step > 1 ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <span className="w-4 h-4 flex items-center justify-center text-xs">
                  1
                </span>
              )}
              <span>Account</span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                step === 2
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span className="w-4 h-4 flex items-center justify-center text-xs">
                2
              </span>
              <span>Profile</span>
            </div>
          </div>
        </div>

        {/* Form Card */}
        <div className="max-w-md mx-auto bg-card rounded-2xl border border-border shadow-lg p-6">
          <h2 className="text-xl font-semibold text-center mb-1">
            Join Veterans Memorial
          </h2>
          <p className="text-muted-foreground text-sm text-center mb-6">
            Get tee times, course updates, and connect with fellow golfers
          </p>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleNextStep} className="space-y-4">
              <div>
                <label
                  htmlFor="fullName"
                  className="block text-sm font-medium mb-1.5"
                >
                  Full Name <span className="text-destructive">*</span>
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
                <label
                  htmlFor="email"
                  className="block text-sm font-medium mb-1.5"
                >
                  Email <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-background border border-input rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium mb-1.5"
                >
                  Password <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                    minLength={6}
                    className="w-full pl-10 pr-4 py-3 bg-background border border-input rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium mb-1.5"
                >
                  Phone <span className="text-muted-foreground">(optional)</span>
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

              <Button type="submit" className="w-full" size="lg">
                Continue
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Member Type <span className="text-destructive">*</span>
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {(Object.keys(memberTypeLabels) as MemberType[]).map(
                    (type) => (
                      <label
                        key={type}
                        className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                          memberType === type
                            ? "border-primary bg-primary/5"
                            : "border-input hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="memberType"
                          value={type}
                          checked={memberType === type}
                          onChange={(e) =>
                            setMemberType(e.target.value as MemberType)
                          }
                          className="sr-only"
                        />
                        <div
                          className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center ${
                            memberType === type
                              ? "border-primary"
                              : "border-muted-foreground"
                          }`}
                        >
                          {memberType === type && (
                            <div className="w-2 h-2 rounded-full bg-primary" />
                          )}
                        </div>
                        <span className="text-sm">{memberTypeLabels[type]}</span>
                      </label>
                    )
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="handicap"
                    className="block text-sm font-medium mb-1.5"
                  >
                    Handicap{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <input
                    id="handicap"
                    type="number"
                    step="0.1"
                    min="0"
                    max="54"
                    value={handicap}
                    onChange={(e) => setHandicap(e.target.value)}
                    placeholder="e.g., 12.5"
                    className="w-full px-4 py-3 bg-background border border-input rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>

                <div>
                  <label
                    htmlFor="preferredTee"
                    className="block text-sm font-medium mb-1.5"
                  >
                    Preferred Tee
                  </label>
                  <select
                    id="preferredTee"
                    value={preferredTee}
                    onChange={(e) =>
                      setPreferredTee(e.target.value as PreferredTee)
                    }
                    className="w-full px-4 py-3 bg-background border border-input rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    {(Object.keys(teeLabels) as PreferredTee[]).map((tee) => (
                      <option key={tee} value={tee}>
                        {teeLabels[tee]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-input cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={wantsUpdates}
                  onChange={(e) => setWantsUpdates(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-input"
                />
                <div>
                  <span className="text-sm font-medium">
                    Send me course updates
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Get tee time reminders and course condition updates
                  </p>
                </div>
              </label>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* Login Link */}
          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground text-center">
              Already have an account?{" "}
              <Link
                href="/pin-login"
                className="text-primary font-medium hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          By joining, you agree to our terms of service and privacy policy.
        </p>
      </div>
    </div>
  );
}
