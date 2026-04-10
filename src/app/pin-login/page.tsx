"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Delete, Loader2, KeyRound } from "lucide-react";

function PinLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  const maxDigits = 6;

  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length < maxDigits && !loading) {
        setError(null);
        setPin((prev) => prev + digit);
      }
    },
    [pin.length, loading]
  );

  const handleDelete = useCallback(() => {
    if (!loading) {
      setPin((prev) => prev.slice(0, -1));
      setError(null);
    }
  }, [loading]);

  const handleClear = useCallback(() => {
    if (!loading) {
      setPin("");
      setError(null);
      setUserName(null);
    }
  }, [loading]);

  const handleSubmit = useCallback(async () => {
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Invalid PIN");
        setPin("");
        setLoading(false);
        return;
      }

      setUserName(data.user?.name || "User");

      // Brief delay to show welcome message
      setTimeout(() => {
        const destination = returnTo || data.redirectPath || "/dashboard";
        router.push(destination);
        router.refresh();
      }, 800);
    } catch {
      setError("Connection error. Please try again.");
      setPin("");
      setLoading(false);
    }
  }, [pin, router, returnTo]);

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-3">
            <KeyRound className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">VMGC Greenkeeper</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your PIN to sign in
          </p>
        </div>

        {/* PIN Display */}
        <div className="bg-card rounded-xl border border-border shadow-lg p-6 mb-4">
          {/* Success State */}
          {userName && !error ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                <svg
                  className="w-8 h-8 text-green-600 dark:text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-lg font-semibold text-foreground">
                Welcome, {userName}!
              </p>
              <p className="text-sm text-muted-foreground mt-1">Loading your dashboard...</p>
            </div>
          ) : (
            <>
              {/* PIN Dots */}
              <div className="flex justify-center gap-3 mb-6">
                {Array.from({ length: maxDigits }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                      i < pin.length
                        ? "bg-primary border-primary scale-110"
                        : "border-muted-foreground/30"
                    }`}
                  />
                ))}
              </div>

              {/* Error Message */}
              {error && (
                <div className="text-center mb-4">
                  <p className="text-sm text-destructive font-medium">{error}</p>
                </div>
              )}

              {/* Number Pad */}
              <div className="grid grid-cols-3 gap-3">
                {digits.map((digit) => (
                  <button
                    key={digit}
                    onClick={() => handleDigit(digit)}
                    disabled={loading}
                    className="h-16 rounded-xl bg-muted/50 hover:bg-muted active:bg-muted/80 text-2xl font-semibold text-foreground transition-all duration-100 active:scale-95 disabled:opacity-50"
                  >
                    {digit}
                  </button>
                ))}

                {/* Bottom row: Clear, 0, Delete */}
                <button
                  onClick={handleClear}
                  disabled={loading}
                  className="h-16 rounded-xl bg-muted/30 hover:bg-muted/50 text-sm font-medium text-muted-foreground transition-all duration-100 active:scale-95 disabled:opacity-50"
                >
                  Clear
                </button>
                <button
                  onClick={() => handleDigit("0")}
                  disabled={loading}
                  className="h-16 rounded-xl bg-muted/50 hover:bg-muted active:bg-muted/80 text-2xl font-semibold text-foreground transition-all duration-100 active:scale-95 disabled:opacity-50"
                >
                  0
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="h-16 rounded-xl bg-muted/30 hover:bg-muted/50 flex items-center justify-center text-muted-foreground transition-all duration-100 active:scale-95 disabled:opacity-50"
                >
                  <Delete className="w-6 h-6" />
                </button>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={loading || pin.length < 4}
                className="w-full mt-4 h-14 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-lg transition-all duration-100 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          Veterans Memorial Golf Course
        </p>
      </div>
    </div>
  );
}

export default function PinLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PinLoginInner />
    </Suspense>
  );
}
