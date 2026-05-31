"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Delete, Loader2, Leaf, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { persistSessionDirect } from "@/lib/supabase/persist-session";

interface PinLoginResponse {
  success: boolean;
  user?: { id?: string; name?: string; role?: string };
  session?: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    expires_at?: number;
    token_type?: string;
  };
  redirectPath?: string;
  error?: string;
}

function PinLoginInner() {
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
      const supabase = createClient();
      const { data: dataRaw, error: fnError } = await supabase.functions.invoke(
        "pin-login",
        {
          method: "POST",
          body: { pin },
        },
      );
      const data = dataRaw as PinLoginResponse | null;

      if (fnError || !data) {
        setError(fnError?.message || "Invalid PIN");
        setPin("");
        setLoading(false);
        return;
      }

      if (!data.success) {
        setError(data.error || "Invalid PIN");
        setPin("");
        setLoading(false);
        return;
      }

      if (data.session) {
        try {
          persistSessionDirect(data.session);
        } catch (err) {
          console.error("[pin-login] persistSessionDirect failed:", err);
          supabase.auth
            .setSession({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            })
            .catch((e: unknown) =>
              console.error("[pin-login] setSession fallback failed:", e),
            );
        }
      }

      setUserName(data.user?.name || "User");

      setTimeout(() => {
        const destination = returnTo || data.redirectPath || "/dashboard";
        window.location.href = destination.startsWith("/")
          ? destination
          : `/${destination}`;
      }, 250);
    } catch {
      setError("Connection error. Please try again.");
      setPin("");
      setLoading(false);
    }
  }, [pin, returnTo]);

  // Hardware keyboard support: digits 0-9, Backspace, Enter, Escape.
  // The page renders no <input>, so without this the user can't type the
  // PIN on a desktop or with a Bluetooth keyboard plugged into a tablet.
  useEffect(() => {
    if (userName) return; // success screen — no input
    const onKey = (e: KeyboardEvent) => {
      if (loading) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleDigit(e.key);
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        handleDelete();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (pin.length >= 4) handleSubmit();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        handleClear();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    loading,
    userName,
    pin.length,
    handleDigit,
    handleDelete,
    handleSubmit,
    handleClear,
  ]);

  // Auto-submit when the full 6-digit PIN is entered. Most PIN pads do
  // this — saves a tap. We still require an explicit Sign In for the
  // shorter 4-5 digit fallback (because we don't know if the user is
  // done typing). handleSubmit calls setState internally, which is the
  // intent — the user typing the 6th digit IS the submit gesture.
  useEffect(() => {
    if (loading) return;
    if (pin.length !== maxDigits) return;
    handleSubmit(); // eslint-disable-line react-hooks/set-state-in-effect -- intentional auto-submit
  }, [pin, loading, handleSubmit]);

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-4 py-12"
      style={{
        background:
          "linear-gradient(160deg, #1B4332 0%, #14352A 55%, #0D2018 100%)",
      }}
    >
      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Soft glow behind the card */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse, rgba(182,141,64,0.08) 0%, transparent 70%)",
        }}
      />

      {/* Brand mark */}
      <div className="relative z-10 text-center mb-8">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg shadow-black/30"
          style={{
            background: "linear-gradient(135deg, #B68D40 0%, #D4A853 100%)",
          }}
        >
          <Leaf className="w-8 h-8 text-[#1B4332]" strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">VMGC</h1>
        <p
          className="text-xs font-semibold mt-1 tracking-[0.18em] uppercase"
          style={{ color: "rgba(182,141,64,0.85)" }}
        >
          GreenKeeper Pro
        </p>
      </div>

      {/* PIN card */}
      <div
        className="relative z-10 w-full max-w-[340px] rounded-2xl p-6 shadow-2xl shadow-black/40"
        style={{
          background: "rgba(255,255,255,0.97)",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        {userName && !error ? (
          /* Success state */
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
              style={{ background: "linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)" }}
            >
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <p className="text-lg font-bold text-gray-900">Welcome, {userName}!</p>
            <p className="text-sm text-gray-500 mt-1">Loading your dashboard…</p>
          </div>
        ) : (
          <>
            {/* Label */}
            <p className="text-center text-xs font-semibold text-gray-500 mb-5 tracking-wide uppercase">
              Enter your PIN
            </p>

            {/* PIN dots */}
            <div className="flex justify-center gap-3 mb-5">
              {Array.from({ length: maxDigits }).map((_, i) => (
                <div
                  key={i}
                  className="w-3.5 h-3.5 rounded-full transition-all duration-150"
                  style={{
                    background:
                      i < pin.length
                        ? "linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)"
                        : "transparent",
                    border:
                      i < pin.length
                        ? "2px solid #1B4332"
                        : "2px solid rgba(0,0,0,0.18)",
                    transform: i < pin.length ? "scale(1.15)" : "scale(1)",
                  }}
                />
              ))}
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-center">
                <p className="text-sm text-red-600 font-medium">{error}</p>
              </div>
            )}

            {/* Number pad */}
            <div className="grid grid-cols-3 gap-2.5">
              {digits.map((digit) => (
                <button
                  key={digit}
                  onClick={() => handleDigit(digit)}
                  disabled={loading}
                  className="h-14 rounded-xl text-2xl font-semibold text-gray-800 transition-all duration-100 active:scale-95 disabled:opacity-40"
                  style={{ background: "rgba(0,0,0,0.04)" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(0,0,0,0.07)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(0,0,0,0.04)")
                  }
                >
                  {digit}
                </button>
              ))}

              {/* Bottom row: Clear | 0 | Delete */}
              <button
                onClick={handleClear}
                disabled={loading}
                className="h-14 rounded-xl text-xs font-semibold text-gray-400 tracking-wider uppercase transition-all duration-100 active:scale-95 disabled:opacity-40"
                style={{ background: "rgba(0,0,0,0.02)" }}
              >
                Clear
              </button>
              <button
                onClick={() => handleDigit("0")}
                disabled={loading}
                className="h-14 rounded-xl text-2xl font-semibold text-gray-800 transition-all duration-100 active:scale-95 disabled:opacity-40"
                style={{ background: "rgba(0,0,0,0.04)" }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(0,0,0,0.07)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(0,0,0,0.04)")
                }
              >
                0
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="h-14 rounded-xl flex items-center justify-center transition-all duration-100 active:scale-95 disabled:opacity-40 text-gray-400"
                style={{ background: "rgba(0,0,0,0.02)" }}
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            {/* Sign in button */}
            <button
              onClick={handleSubmit}
              disabled={loading || pin.length < 4}
              className="w-full mt-4 rounded-xl font-bold text-base transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-white"
              style={{
                height: "52px",
                background:
                  "linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)",
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Verifying…
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </>
        )}
      </div>

      {/* Footer */}
      <p className="relative z-10 text-center text-xs mt-8 tracking-wide"
        style={{ color: "rgba(255,255,255,0.3)" }}
      >
        Veterans Memorial Golf Course
      </p>
    </div>
  );
}

export default function PinLoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{
            background: "linear-gradient(160deg, #1B4332 0%, #0D2018 100%)",
          }}
        >
          <Loader2 className="w-6 h-6 animate-spin text-white/40" />
        </div>
      }
    >
      <PinLoginInner />
    </Suspense>
  );
}
