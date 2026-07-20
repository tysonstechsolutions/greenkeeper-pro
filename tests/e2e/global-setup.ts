import { chromium, FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

/**
 * One-time PIN login. Saves auth state so every spider test reuses it
 * without going through pin-login again.
 */
export default async function globalSetup(config: FullConfig) {
  const pin = process.env.PLAYWRIGHT_TEST_PIN;
  const email = process.env.PLAYWRIGHT_TEST_EMAIL;
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD;
  const usePasswordFixture = Boolean(email && password);

  if (!usePasswordFixture && (!pin || pin.length < 4)) {
    throw new Error(
      "Set a 4-6 digit PLAYWRIGHT_TEST_PIN, or set both PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD for a disposable local fixture.",
    );
  }

  const baseURL =
    config.projects[0]?.use?.baseURL || "http://localhost:3000";

  const authDir = path.join(__dirname, ".auth");
  fs.mkdirSync(authDir, { recursive: true });
  const storagePath = path.join(authDir, "user.json");

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      // Surface login-page console errors so we don't silently fail auth
      console.warn("[pin-login console error]", msg.text());
    }
  });

  if (usePasswordFixture) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        "Password-based Playwright setup requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email!,
      password: password!,
    });
    if (error || !data.session) {
      throw new Error(
        `Disposable Playwright user could not sign in: ${error?.message ?? "session missing"}`,
      );
    }

    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
      { key: storageKey, session: data.session },
    );
    await page.goto(`${baseURL}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => !url.pathname.startsWith("/pin-login"), {
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await context.storageState({ path: storagePath });
    await browser.close();
    return;
  }

  await page.goto(`${baseURL}/pin-login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  // Click each digit
  for (const digit of pin!) {
    await page
      .getByRole("button", { name: digit, exact: true })
      .first()
      .click();
  }

  await page.getByRole("button", { name: /sign in/i }).click();

  // Wait for the navigation away from /pin-login. Use either the welcome state
  // or the dashboard URL — pin-login does a hard navigation via window.location.
  await page
    .waitForURL((url) => !url.pathname.startsWith("/pin-login"), {
      timeout: 30000,
    })
    .catch(async () => {
      const screenshotPath = path.join(authDir, "login-failed.png");
      await page.screenshot({ path: screenshotPath, fullPage: true });
      throw new Error(
        `PIN login did not navigate away from /pin-login within 30s. Screenshot: ${screenshotPath}`,
      );
    });

  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  await context.storageState({ path: storagePath });
  await browser.close();
}
