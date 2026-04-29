import { defineConfig, devices } from "@playwright/test";
import * as path from "path";

const STORAGE_STATE = path.resolve(
  __dirname,
  "tests/e2e/.auth/user.json",
);

export default defineConfig({
  testDir: "./tests/e2e",
  // Skip the legacy auth.spec.ts — it tests an old email/password flow
  // that no longer exists. The route-audit spec authenticates via the
  // PIN flow in global-setup.
  testIgnore: ["**/auth.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? "html" : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 45_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    storageState: STORAGE_STATE,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
