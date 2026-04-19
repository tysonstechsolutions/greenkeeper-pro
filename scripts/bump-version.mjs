#!/usr/bin/env node
/**
 * Bump android/app/build.gradle's versionCode + versionName.
 *
 *   node scripts/bump-version.mjs patch   → 1.0.0 → 1.0.1  (versionCode +1)
 *   node scripts/bump-version.mjs minor   → 1.0.1 → 1.1.0
 *   node scripts/bump-version.mjs major   → 1.1.0 → 2.0.0
 *   node scripts/bump-version.mjs 1.2.3   → sets exactly (versionCode +1)
 *
 * Every upload to Play Store needs a unique versionCode that's greater
 * than the last upload. versionName is the user-facing string.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const GRADLE = path.join(ROOT, "android", "app", "build.gradle");

const arg = process.argv[2];
if (!arg) {
  console.error(
    "Usage: node scripts/bump-version.mjs (patch|minor|major|<x.y.z>)",
  );
  process.exit(1);
}

const src = await fs.readFile(GRADLE, "utf8");

const codeMatch = src.match(/versionCode\s+(\d+)/);
const nameMatch = src.match(/versionName\s+"([^"]+)"/);
if (!codeMatch || !nameMatch) {
  console.error("❌ Couldn't find versionCode / versionName in build.gradle");
  process.exit(1);
}

const oldCode = parseInt(codeMatch[1], 10);
const oldName = nameMatch[1];
const [maj, min, pat] = oldName.split(".").map((n) => parseInt(n, 10) || 0);

let newName;
if (arg === "patch") newName = `${maj}.${min}.${pat + 1}`;
else if (arg === "minor") newName = `${maj}.${min + 1}.0`;
else if (arg === "major") newName = `${maj + 1}.0.0`;
else if (/^\d+\.\d+\.\d+$/.test(arg)) newName = arg;
else {
  console.error(`Unknown bump argument: ${arg}`);
  process.exit(1);
}

const newCode = oldCode + 1;
const next = src
  .replace(/versionCode\s+\d+/, `versionCode ${newCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${newName}"`);

await fs.writeFile(GRADLE, next, "utf8");
console.log(
  `versionCode: ${oldCode} → ${newCode}\n` +
    `versionName: ${oldName} → ${newName}\n\n` +
    `Don't forget to commit before building the release.`,
);
