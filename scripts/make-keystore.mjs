#!/usr/bin/env node
/**
 * Generate a release signing keystore + the matching keystore.properties
 * file that android/app/build.gradle reads.
 *
 *   node scripts/make-keystore.mjs
 *
 * Prompts for:
 *   - keystore path (default: ./vmgc-release.jks in repo root, gitignored)
 *   - key alias (default: vmgc)
 *   - CN / OU / O / L / S / C  — all required by keytool
 *   - store password + key password (can be the same)
 *
 * IMPORTANT: Back this keystore up somewhere you won't lose it (password
 * manager, encrypted cloud backup). If you lose it, Google Play will NOT
 * let you push an update to the app — you'd have to publish a new app
 * under a different package name.
 *
 * If you also enable Play App Signing (recommended — it's on by default
 * for new apps since 2021), Google holds the real signing key and your
 * .jks becomes the "upload key." Losing the upload key is recoverable
 * via Google support; losing the signing key without Play App Signing
 * is not.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(q, def) {
  return new Promise((resolve) => {
    rl.question(def ? `${q} [${def}]: ` : `${q}: `, (answer) =>
      resolve(answer.trim() || def || ""),
    );
  });
}

function askSecret(q) {
  // Node's readline doesn't have native password masking. Echo is on —
  // user sees their typing. Not ideal, but this runs once per project.
  return new Promise((resolve) => {
    process.stdout.write(`${q}: `);
    rl.question("", (answer) => resolve(answer.trim()));
  });
}

async function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`exit ${code}`)),
    );
  });
}

async function main() {
  console.log("\n─── VMGC GreenKeeper release keystore generator ───\n");

  const defaultStore = path.join(ROOT, "vmgc-release.jks");
  const storeFile = (await ask("Keystore file path", defaultStore));
  const alias = (await ask("Key alias", "vmgc"));
  const validityDays = (await ask("Validity (days)", "10000"));

  console.log(
    "\nDistinguished-name fields (these land in the APK signature):",
  );
  const cn = await ask("  Common Name (your name or org)", "VMGC GreenKeeper");
  const ou = await ask("  Organizational Unit", "Engineering");
  const o = await ask("  Organization", "VMGC");
  const l = await ask("  City", "North Chicago");
  const st = await ask("  State/Province", "IL");
  const c = await ask("  Country code (2 letters)", "US");

  console.log(
    "\nPasswords (remember them — losing the store password means losing the app):",
  );
  const storePassword = await askSecret("Keystore password");
  if (storePassword.length < 6) {
    console.error("❌ Keystore password must be at least 6 characters.");
    process.exit(1);
  }
  const keyPasswordRaw = await askSecret(
    "Key password (blank = same as keystore password)",
  );
  const keyPassword = keyPasswordRaw || storePassword;

  rl.close();

  // Make sure parent dir exists.
  await fs.mkdir(path.dirname(storeFile), { recursive: true });

  // Already exists? Don't clobber.
  try {
    await fs.access(storeFile);
    console.error(
      `\n❌ ${storeFile} already exists. Delete it first if you want to regenerate.`,
    );
    process.exit(1);
  } catch {
    /* good, keep going */
  }

  const dname =
    `CN=${cn}, OU=${ou}, O=${o}, L=${l}, ST=${st}, C=${c}`;

  console.log("\nRunning keytool…\n");
  await run("keytool", [
    "-genkey",
    "-v",
    "-keystore",
    storeFile,
    "-alias",
    alias,
    "-keyalg",
    "RSA",
    "-keysize",
    "2048",
    "-validity",
    validityDays,
    "-storepass",
    storePassword,
    "-keypass",
    keyPassword,
    "-dname",
    dname,
  ]);

  // Write keystore.properties (gitignored).
  const propsPath = path.join(ROOT, "android", "keystore.properties");
  const contents = [
    "# Release signing credentials for com.vmgc.greenkeeper.",
    "# Gitignored — never commit this file.",
    `storeFile=${storeFile.replace(/\\/g, "/")}`,
    `storePassword=${storePassword}`,
    `keyAlias=${alias}`,
    `keyPassword=${keyPassword}`,
    "",
  ].join("\n");
  await fs.writeFile(propsPath, contents, "utf8");

  console.log(`\n✓ Keystore created: ${storeFile}`);
  console.log(`✓ Credentials written: ${propsPath}`);
  console.log(
    "\nNext: run `node scripts/release-build.mjs --signed` to produce a signed AAB.\n",
  );
  console.log(
    "⚠ BACKUP THE .jks FILE + PASSWORD. Losing either makes Play Store updates impossible.\n",
  );
}

main().catch((err) => {
  console.error("\n❌ Keystore generation failed:", err.message);
  process.exit(1);
});
