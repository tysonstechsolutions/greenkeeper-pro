import { chromium, FullConfig } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * One-time PIN login. Saves auth state so every spider test reuses it
 * without going through pin-login again.
 */
export default async function globalSetup(config: FullConfig) {
  const pin = process.env.PLAYWRIGHT_TEST_PIN;
  if (!pin || pin.length < 4) {
    throw new Error(
      "PLAYWRIGHT_TEST_PIN env var must be set to a 4-6 digit PIN.",
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

  await page.goto(`${baseURL}/pin-login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  // Click each digit
  for (const digit of pin) {
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
