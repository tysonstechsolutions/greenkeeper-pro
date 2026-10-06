"use client";

import { useState } from "react";
import { Timer } from "lucide-react";
import { IDLE_CHOICES, idleChoiceLabel, readIdleMinutes, writeIdleMinutes } from "@/lib/auth/idle";

/** Settings row: how long this device waits before logging out. */
export function AutoLogoutSetting() {
  const [minutes, setMinutes] = useState(() => readIdleMinutes());
  return (
    <div className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-sm shrink-0">
        <Timer className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <label htmlFor="auto-logout" className="font-medium text-sm block">
          Auto log-out
        </label>
        <p className="text-xs text-muted-foreground">
          When nobody uses this device. Keep it on for shared phones and tablets.
        </p>
      </div>
      <select
        id="auto-logout"
        value={minutes}
        onChange={(e) => {
          const n = Number(e.target.value);
          setMinutes(n);
          writeIdleMinutes(n);
        }}
        className="shrink-0 rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
      >
        {IDLE_CHOICES.map((m) => (
          <option key={m} value={m}>
            {idleChoiceLabel(m)}
          </option>
        ))}
      </select>
    </div>
  );
}
