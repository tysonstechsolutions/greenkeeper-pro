/**
 * Shared application constants
 * Single source of truth for course info, brand colors, and config values.
 */

// ─── Course Information ───────────────────────────────────────────────────────
export const COURSE = {
  name: "Veterans Memorial Golf Course",
  shortName: "VMGC",
  tagline: "Championship Course Management",
  location: "Great Lakes, IL",
  lat: 42.3095,
  lng: -87.8475,
} as const;

// ─── Brand Colors ─────────────────────────────────────────────────────────────
export const BRAND = {
  darkGreen: "#1B4332",
  green: "#2D6A4F",
  gold: "#B68D40",
  lightGold: "#D4A853",
} as const;

// ─── App Configuration ────────────────────────────────────────────────────────
export const APP_CONFIG = {
  /** How often to poll for new notifications (ms) */
  notificationPollInterval: 120_000,
  /** Weather auto-refresh interval (minutes) */
  weatherRefreshMinutes: 30,
  /** Max image upload size (bytes) — 10 MB */
  maxImageSize: 10 * 1024 * 1024,
  /** Max tool-use rounds for AI assistant */
  maxAIToolRounds: 10,
} as const;
