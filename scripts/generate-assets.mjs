#!/usr/bin/env node
/**
 * Generate the icon + splash source files at the sizes @capacitor/assets
 * expects. Inputs come from what's already shipped for the PWA; outputs
 * go to ./assets/ where `npx capacitor-assets generate` picks them up.
 *
 * Inputs:
 *   public/icons/icon-512.png   (512x512 brand logo, dark-green gradient
 *                                 with "VMGC PRO" wordmark)
 *
 * Outputs:
 *   assets/icon.png               1024x1024  — main app icon
 *   assets/icon-foreground.png    1024x1024  — logo trimmed + padded,
 *                                               for Android adaptive icons
 *   assets/icon-background.png    1024x1024  — solid brand green,
 *                                               adaptive-icon background layer
 *   assets/splash.png             2732x2732  — splash screen, logo centered
 *                                               at ~30% on brand-green bg
 *   assets/splash-dark.png        2732x2732  — same (we don't have a
 *                                               separate dark variant)
 */
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SRC_ICON = path.join(ROOT, "public", "icons", "icon-512.png");
const OUT_DIR = path.join(ROOT, "assets");

// Brand green from capacitor.config.ts (SplashScreen.backgroundColor)
const BRAND_BG = { r: 0x1b, g: 0x43, b: 0x32 };

await fs.mkdir(OUT_DIR, { recursive: true });

// ── icon.png (1024x1024) — upscale source with Lanczos3 ──────────────────
await sharp(SRC_ICON)
  .resize(1024, 1024, { kernel: "lanczos3", fit: "contain" })
  .png()
  .toFile(path.join(OUT_DIR, "icon.png"));

// ── icon-foreground.png (1024x1024) — logo at 66% on transparent bg ──────
// Android's adaptive icon crops the foreground aggressively; leaving the
// safe zone (middle ~66%) gives consistent rendering on every launcher.
const logoForAdaptive = await sharp(SRC_ICON)
  .resize(680, 680, { kernel: "lanczos3", fit: "contain" })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: 1024,
    height: 1024,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: logoForAdaptive, gravity: "center" }])
  .png()
  .toFile(path.join(OUT_DIR, "icon-foreground.png"));

// ── icon-background.png (1024x1024) — solid brand green ──────────────────
await sharp({
  create: {
    width: 1024,
    height: 1024,
    channels: 4,
    background: { ...BRAND_BG, alpha: 1 },
  },
})
  .png()
  .toFile(path.join(OUT_DIR, "icon-background.png"));

// ── splash.png (2732x2732) — brand-green bg, logo centered at ~22% ───────
const logoForSplash = await sharp(SRC_ICON)
  .resize(600, 600, { kernel: "lanczos3", fit: "contain" })
  .png()
  .toBuffer();

const splashBuffer = await sharp({
  create: {
    width: 2732,
    height: 2732,
    channels: 4,
    background: { ...BRAND_BG, alpha: 1 },
  },
})
  .composite([{ input: logoForSplash, gravity: "center" }])
  .png()
  .toBuffer();

await fs.writeFile(path.join(OUT_DIR, "splash.png"), splashBuffer);
// No separate dark variant — same green works either way.
await fs.writeFile(path.join(OUT_DIR, "splash-dark.png"), splashBuffer);

console.log("Generated:");
for (const f of [
  "icon.png",
  "icon-foreground.png",
  "icon-background.png",
  "splash.png",
  "splash-dark.png",
]) {
  const p = path.join(OUT_DIR, f);
  const stat = await fs.stat(p);
  console.log(`  ${f}  ${(stat.size / 1024).toFixed(1)} KB`);
}
