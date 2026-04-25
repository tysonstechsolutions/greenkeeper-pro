/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { ROUTES } from "./route-inventory";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const AUDIT_DIR = path.join(__dirname, ".audit");
const PER_TEST_DIR = path.join(AUDIT_DIR, "per-test");
fs.mkdirSync(AUDIT_DIR, { recursive: true });
fs.mkdirSync(PER_TEST_DIR, { recursive: true });

type Finding = {
  route: string;
  finalUrl: string;
  viewport: string;
  loaded: boolean;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  overlap: any[];
  horizontalScroll: boolean;
  screenshot: string;
};

test.describe.configure({ mode: "parallel" });

for (const route of ROUTES) {
  if (route.skip) continue;

  for (const vp of VIEWPORTS) {
    const url = route.path + (route.query ? `?${route.query}` : "");
    const safeName =
      (route.path.replace(/^\//, "").replace(/\//g, "_") || "root") +
      (route.query ? `__q` : "");

    test(`${route.path} @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const failedRequests: string[] = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => pageErrors.push(err.message));
      page.on("requestfailed", (req) => {
        const failure = req.failure();
        // Ignore expected failures (cancelled navigations, etc.)
        if (failure && !/aborted|cancelled/i.test(failure.errorText)) {
          failedRequests.push(
            `${req.method()} ${req.url()} - ${failure.errorText}`,
          );
        }
      });

      let loaded = false;
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        // Best-effort settle; many pages have long-poll / websockets that
        // never reach networkidle, so we cap and move on.
        await page
          .waitForLoadState("networkidle", { timeout: 5000 })
          .catch(() => {});
        // Tiny extra settle for client-side data fetches.
        await page.waitForTimeout(500);
        loaded = true;
      } catch {
        loaded = false;
      }

      const screenshotName = `${safeName}__${vp.name}.png`;
      const screenshotPath = path.join(AUDIT_DIR, screenshotName);
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true });
      } catch {}

      let overlap: any[] = [];
      let horizontalScroll = false;
      let finalUrl = page.url();

      try {
        const probe = await page.evaluate(() => {
          const out: { overlap: any[]; horizontalScroll: boolean } = {
            overlap: [],
            horizontalScroll: false,
          };

          out.horizontalScroll =
            document.documentElement.scrollWidth > window.innerWidth + 1;

          const header = document.querySelector(
            "[data-app-header]",
          ) as HTMLElement | null;
          const bottomNav = document.querySelector(
            "[data-bottom-nav]",
          ) as HTMLElement | null;
          const chatBubble = document.querySelector(
            "[data-chat-bubble]",
          ) as HTMLElement | null;

          const navRect = bottomNav?.getBoundingClientRect();
          const headerRect = header?.getBoundingClientRect();
          const bubbleRect = chatBubble?.getBoundingClientRect();

          const navZ = bottomNav
            ? parseInt(getComputedStyle(bottomNav).zIndex || "0", 10) || 0
            : 0;

          const allFixed = Array.from(document.querySelectorAll("*")).filter(
            (el) => {
              const cs = getComputedStyle(el);
              return (
                cs.position === "fixed" &&
                cs.display !== "none" &&
                cs.visibility !== "hidden" &&
                cs.opacity !== "0"
              );
            },
          ) as HTMLElement[];

          const summarize = (el: HTMLElement) => {
            const tag = el.tagName.toLowerCase();
            const cls =
              typeof el.className === "string"
                ? el.className.split(/\s+/).slice(0, 3).join(".")
                : "";
            return cls ? `${tag}.${cls}` : tag;
          };

          // ── 1. Page-level fixed elements hidden behind bottom-nav ──
          if (navRect && navRect.width > 0) {
            for (const el of allFixed) {
              if (
                el === bottomNav ||
                el === chatBubble ||
                (header && header.contains(el)) ||
                el.hasAttribute("data-bottom-nav") ||
                el.hasAttribute("data-chat-bubble") ||
                el.closest("[data-bottom-nav]") ||
                el.closest("[data-chat-bubble]")
              )
                continue;

              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;

              const intersects =
                r.bottom > navRect.top &&
                r.top < navRect.bottom &&
                r.right > navRect.left &&
                r.left < navRect.right;

              if (!intersects) continue;

              const elZ =
                parseInt(getComputedStyle(el).zIndex || "0", 10) || 0;

              if (elZ < navZ) {
                out.overlap.push({
                  type: "hidden_behind_bottom_nav",
                  el: summarize(el),
                  rect: {
                    top: Math.round(r.top),
                    bottom: Math.round(r.bottom),
                    left: Math.round(r.left),
                    right: Math.round(r.right),
                  },
                  elZ,
                  navZ,
                });
              }
            }
          }

          // ── 2. Page-level fixed elements clashing with chat bubble ──
          if (bubbleRect && bubbleRect.width > 0) {
            for (const el of allFixed) {
              if (
                el === bottomNav ||
                el === chatBubble ||
                el.hasAttribute("data-bottom-nav") ||
                el.hasAttribute("data-chat-bubble") ||
                el.closest("[data-bottom-nav]") ||
                el.closest("[data-chat-bubble]") ||
                (header && header.contains(el))
              )
                continue;

              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;

              // Only care about overlap with the small bubble circle
              const intersects =
                r.bottom > bubbleRect.top &&
                r.top < bubbleRect.bottom &&
                r.right > bubbleRect.left &&
                r.left < bubbleRect.right;

              if (intersects) {
                // Exclude full-screen overlays (modals/sheets — expected to
                // cover the bubble; the bubble's z-40 is below modal z-50).
                const fillsViewport =
                  r.width >= window.innerWidth - 4 &&
                  r.height >= window.innerHeight - 4;
                if (fillsViewport) continue;

                out.overlap.push({
                  type: "overlaps_chat_bubble",
                  el: summarize(el),
                  rect: {
                    top: Math.round(r.top),
                    bottom: Math.round(r.bottom),
                    left: Math.round(r.left),
                    right: Math.round(r.right),
                  },
                });
              }
            }
          }

          // ── 3. Off-viewport fixed elements (might indicate broken layout) ──
          for (const el of allFixed) {
            if (
              el === bottomNav ||
              el === chatBubble ||
              el === header ||
              el.hasAttribute("data-bottom-nav") ||
              el.hasAttribute("data-chat-bubble") ||
              el.hasAttribute("data-app-header")
            )
              continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const fullyOff =
              r.right < 0 ||
              r.bottom < 0 ||
              r.left > window.innerWidth ||
              r.top > window.innerHeight;
            if (fullyOff) {
              out.overlap.push({
                type: "fixed_off_viewport",
                el: summarize(el),
                rect: {
                  top: Math.round(r.top),
                  bottom: Math.round(r.bottom),
                  left: Math.round(r.left),
                  right: Math.round(r.right),
                },
              });
            }
          }

          return out;
        });

        overlap = probe.overlap;
        horizontalScroll = probe.horizontalScroll;
      } catch {
        // Probe failed — page might have errored before script could run
      }

      finalUrl = page.url();

      const finding: Finding = {
        route: url,
        finalUrl,
        viewport: vp.name,
        loaded,
        consoleErrors,
        pageErrors,
        failedRequests,
        overlap,
        horizontalScroll,
        screenshot: screenshotName,
      };

      // Per-test file write — multi-worker safe (unique filename per test).
      // Aggregator reads all files at the end.
      const perTestPath = path.join(
        PER_TEST_DIR,
        `${safeName}__${vp.name}.json`,
      );
      fs.writeFileSync(perTestPath, JSON.stringify(finding, null, 2));

      // Soft assertion: don't fail the test for findings; we record everything.
      // We do fail if the page outright crashed (no content rendered).
      expect(loaded, `Failed to load ${url}`).toBe(true);
    });
  }
}
