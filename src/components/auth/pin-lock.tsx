"use client";

import { useCallback, useEffect, useState } from "react";
import { Delete, Leaf } from "lucide-react";

// Single shared app PIN. Light gate (checked on-device) — not cryptographic
// security, just enough to stop a random person who finds the URL. Override
// via NEXT_PUBLIC_APP_PIN; defaults to 9999.
const EXPECTED_PIN = process.env.NEXT_PUBLIC_APP_PIN || "9999";

export function PinLock({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const maxDigits = EXPECTED_PIN.length;

  const handleDigit = useCallback(
    (d: string) => {
      setError(false);
      setPin((p) => (p.length < maxDigits ? p + d : p));
    },
    [maxDigits],
  );

  const handleDelete = useCallback(() => {
    setError(false);
    setPin((p) => p.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setError(false);
    setPin("");
  }, []);

  // Auto-check once the full PIN is entered.
  useEffect(() => {
    if (pin.length !== maxDigits) return;
    if (pin === EXPECTED_PIN) {
      onUnlock();
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- show error + reset on wrong PIN
      setError(true);
      const t = setTimeout(() => setPin(""), 700);
      return () => clearTimeout(t);
    }
  }, [pin, maxDigits, onUnlock]);

  // Hardware keyboard support (desktop / paired keyboard).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleDelete();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClear();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleDigit, handleDelete, handleClear]);

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center relative overflow-hidden px-4 py-12"
      style={{
        background:
          "linear-gradient(160deg, var(--brand-pine) 0%, var(--brand-pine-deep) 100%)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="relative z-10 text-center mb-8">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg shadow-black/30"
          style={{
            background:
              "linear-gradient(135deg, var(--brand-honey) 0%, var(--brand-honey-light) 100%)",
          }}
        >
          <Leaf className="w-8 h-8 text-brand-green" strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">VMGC</h1>
        <p
          className="text-xs font-semibold mt-1 tracking-[0.18em] uppercase"
          style={{ color: "color-mix(in oklab, var(--brand-honey-light) 85%, transparent)" }}
        >
          GreenKeeper Pro
        </p>
      </div>

      <div
        className="relative z-10 w-full max-w-[340px] rounded-2xl p-6 shadow-2xl shadow-black/40"
        style={{
          background: "rgba(255,255,255,0.97)",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        <p className="text-center text-xs font-semibold text-gray-500 mb-5 tracking-wide uppercase">
          Enter PIN
        </p>

        <div className="flex justify-center gap-3 mb-5">
          {Array.from({ length: maxDigits }).map((_, i) => (
            <div
              key={i}
              className="w-3.5 h-3.5 rounded-full transition-all duration-150"
              style={{
                background:
                  i < pin.length
                    ? error
                      ? "var(--brand-clay)"
                      : "linear-gradient(135deg, var(--brand-pine) 0%, var(--brand-fairway) 100%)"
                    : "transparent",
                border:
                  i < pin.length
                    ? error
                      ? "2px solid var(--brand-clay)"
                      : "2px solid var(--brand-pine)"
                    : "2px solid rgba(0,0,0,0.18)",
                transform: i < pin.length ? "scale(1.15)" : "scale(1)",
              }}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-center">
            <p className="text-sm text-red-600 font-medium">
              Incorrect PIN. Try again.
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2.5">
          {digits.map((digit) => (
            <button
              key={digit}
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-xl text-2xl font-semibold text-gray-800 transition-all duration-100 active:scale-95"
              style={{ background: "rgba(0,0,0,0.04)" }}
            >
              {digit}
            </button>
          ))}

          <button
            onClick={handleClear}
            className="h-14 rounded-xl text-xs font-semibold text-gray-400 tracking-wider uppercase transition-all duration-100 active:scale-95"
            style={{ background: "rgba(0,0,0,0.02)" }}
          >
            Clear
          </button>
          <button
            onClick={() => handleDigit("0")}
            className="h-14 rounded-xl text-2xl font-semibold text-gray-800 transition-all duration-100 active:scale-95"
            style={{ background: "rgba(0,0,0,0.04)" }}
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="h-14 rounded-xl flex items-center justify-center transition-all duration-100 active:scale-95 text-gray-400"
            style={{ background: "rgba(0,0,0,0.02)" }}
            aria-label="Delete"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>

      <p
        className="relative z-10 text-center text-xs mt-8 tracking-wide"
        style={{ color: "rgba(255,255,255,0.3)" }}
      >
        Veterans Memorial Golf Course
      </p>
    </div>
  );
}
