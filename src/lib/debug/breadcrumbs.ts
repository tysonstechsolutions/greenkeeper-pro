/**
 * Module-level breadcrumb buffer for the in-app debug panel.
 *
 * Most bugs in this app don't throw exceptions — clicks that silently don't
 * navigate, fetches that stay pending forever, layout issues, logic errors.
 * window.onerror + unhandledrejection miss all of that, which was why the
 * user reported "I never see any bug come up but still seeing issues".
 *
 * This module records a sliding window of everything the user does and
 * everything the app does on their behalf: route changes, link clicks, fetch
 * lifecycle, console.error/warn/info, lifecycle events. The DebugOverlay
 * reads the buffer and renders it as a timeline, with copy-to-clipboard so
 * the user can share a diagnostic with me.
 *
 * Safe to call from anywhere (client or server). On the server it's a no-op
 * on dispatch but the buffer still exists — the overlay re-reads on mount
 * so pre-hydration breadcrumbs survive.
 */

export type BreadcrumbKind =
  | "nav"
  | "click"
  | "fetch"
  | "fetch-done"
  | "error"
  | "warn"
  | "info"
  | "lifecycle"
  | "reset"
  | "timeout";

export interface Breadcrumb {
  id: number;
  time: number;
  kind: BreadcrumbKind;
  message: string;
  // Optional free-form extras that show on long-press / expand. Kept small
  // so the buffer doesn't balloon.
  detail?: string;
}

const MAX = 100;
const EVENT = "debug:breadcrumb-update";

let nextId = 1;
const buffer: Breadcrumb[] = [];

export function recordBreadcrumb(
  kind: BreadcrumbKind,
  message: string,
  detail?: string,
): void {
  const crumb: Breadcrumb = {
    id: nextId++,
    time: Date.now(),
    kind,
    message: truncate(message, 200),
    detail: detail ? truncate(detail, 500) : undefined,
  };
  buffer.push(crumb);
  if (buffer.length > MAX) buffer.shift();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

export function getBreadcrumbs(): readonly Breadcrumb[] {
  return buffer;
}

export function clearBreadcrumbs(): void {
  buffer.length = 0;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

export function subscribeBreadcrumbs(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/**
 * Format the breadcrumb log as shareable plain text. Suitable for dumping
 * into a screenshot description or pasting into a bug report.
 */
export function formatBreadcrumbsAsText(extras?: Record<string, string>): string {
  const header = [
    `# VMGC Debug Log (${new Date().toISOString()})`,
    typeof window !== "undefined" ? `URL: ${window.location.href}` : "",
    typeof navigator !== "undefined" ? `UA: ${navigator.userAgent}` : "",
  ];
  if (extras) {
    for (const [k, v] of Object.entries(extras)) header.push(`${k}: ${v}`);
  }
  header.push("");
  const lines = buffer.map((c) => {
    const t = new Date(c.time).toLocaleTimeString();
    const base = `${t}  [${c.kind.padEnd(10, " ")}] ${c.message}`;
    return c.detail ? `${base}\n        ↳ ${c.detail}` : base;
  });
  return [...header, ...lines].join("\n");
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ── Console interception ────────────────────────────────────────────────────
// Captures console.error/warn/info (but NOT console.log to avoid spam) so
// the panel surfaces code that reports problems via console without ever
// throwing. Call once on app boot; subsequent calls are no-ops.

let consoleHooked = false;

export function hookConsoleForBreadcrumbs() {
  if (consoleHooked) return;
  if (typeof window === "undefined") return;
  consoleHooked = true;

  const orig = {
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console),
  };

  console.error = (...args: unknown[]) => {
    recordBreadcrumb("error", formatConsoleArgs(args));
    orig.error(...args);
  };
  console.warn = (...args: unknown[]) => {
    recordBreadcrumb("warn", formatConsoleArgs(args));
    orig.warn(...args);
  };
  console.info = (...args: unknown[]) => {
    recordBreadcrumb("info", formatConsoleArgs(args));
    orig.info(...args);
  };
}

function formatConsoleArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}
