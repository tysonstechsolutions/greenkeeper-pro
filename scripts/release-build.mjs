#!/usr/bin/env node
/**
 * One-command release build.
 *
 *   node scripts/release-build.mjs            → produces an unsigned APK
 *   node scripts/release-build.mjs --signed   → produces a signed AAB
 *                                                (needs android/keystore.properties)
 *
 * Runs the whole pipeline in order:
 *   1. npm run build              — Next.js static export → out/
 *   2. npx cap sync android       — copy out/ into android/app/src/main/assets/public/
 *   3. ./gradlew bundleRelease    — R8 minify + resource shrink + AAB
 *      (or assembleRelease for an APK)
 *
 * Prints the final artifact path at the end with its size so you can
 * open the Android Studio "Generate Signed Bundle" flow or upload
 * directly to the Play Console.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ANDROID = path.join(ROOT, "android");

const args = new Set(process.argv.slice(2));
const WANT_APK = args.has("--apk");
const SIGNED_HINT = args.has("--signed"); // just a log hint; signing is driven by keystore.properties

function run(cmd, cmdArgs, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cmdArgs, {
      stdio: "inherit",
      shell: process.platform === "win32",
      cwd: opts.cwd || ROOT,
      env: { ...process.env, ...(opts.env || {}) },
    });
    p.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} ${cmdArgs.join(" ")} exited ${code}`)),
    );
  });
}

async function step(label, fn) {
  const t0 = Date.now();
  console.log(`\n── ${label} ──────────────────────────────────────────`);
  await fn();
  console.log(`✓ ${label} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

async function main() {
  // Sanity: local.properties for android SDK path.
  const localProps = path.join(ANDROID, "local.properties");
  try {
    await fs.access(localProps);
  } catch {
    console.error(
      "\n❌ android/local.properties is missing. It points gradle at the Android SDK.\n" +
        "Create it with one line (adjust the path to your install):\n" +
        "    sdk.dir=C:\\\\Users\\\\<you>\\\\AppData\\\\Local\\\\Android\\\\Sdk\n",
    );
    process.exit(1);
  }

  // Signing warning if missing.
  const keystoreProps = path.join(ANDROID, "keystore.properties");
  try {
    await fs.access(keystoreProps);
    console.log("✓ keystore.properties found — release artifact will be signed.");
  } catch {
    if (SIGNED_HINT) {
      console.error(
        "\n❌ --signed was specified but android/keystore.properties is missing.\n" +
          "Generate a keystore first:  node scripts/make-keystore.mjs\n",
      );
      process.exit(1);
    }
    console.log(
      "ℹ keystore.properties NOT found — artifact will be unsigned\n" +
        "  (run `node scripts/make-keystore.mjs` to set up signing).",
    );
  }

  await step("Next.js static export", () => run("npm", ["run", "build"]));
  await step("Capacitor sync to Android", () =>
    run("npx", ["cap", "sync", "android"]),
  );

  const task = WANT_APK ? "assembleRelease" : "bundleRelease";
  const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  await step(`Gradle ${task}`, () =>
    run(gradlew, [task, "--no-daemon"], { cwd: ANDROID }),
  );

  // Report where the artifact landed.
  const out = path.join(ANDROID, "app", "build", "outputs");
  const artifactPath = WANT_APK
    ? path.join(out, "apk", "release")
    : path.join(out, "bundle", "release");

  const entries = await fs.readdir(artifactPath).catch(() => []);
  const artifact = entries.find((f) =>
    WANT_APK ? f.endsWith(".apk") : f.endsWith(".aab"),
  );

  if (artifact) {
    const full = path.join(artifactPath, artifact);
    const stat = await fs.stat(full);
    console.log(
      `\n✅ Build complete.\n   ${full}\n   ${(stat.size / 1024 / 1024).toFixed(2)} MB\n`,
    );
    if (WANT_APK) {
      console.log("Install to a connected device:");
      console.log(`   adb install -r "${full}"`);
    } else {
      console.log("Upload to Play Console: https://play.google.com/console/");
    }
  } else {
    console.warn(
      `\n⚠ Build succeeded but no artifact found in ${artifactPath}`,
    );
  }
}

main().catch((err) => {
  console.error("\n❌ Release build failed:", err.message);
  process.exit(1);
});
