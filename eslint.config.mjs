import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Supabase Edge Functions (Deno) handle untyped JSON request/response
  // bodies, third-party APIs, and fetch responses where `any` is the
  // pragmatic choice. The Next.js typescript preset treats no-explicit-any
  // as an error globally; loosen it to a warning for these files only.
  {
    files: ["supabase/functions/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local-only Claude Code worktrees (gitignored — CI never sees them).
    // Without this, lint scans ~50k duplicated TS files from prior agent
    // worktrees and emits hundreds of thousands of phantom issues.
    ".claude/**",
    // Capacitor / Android build artifacts. Same story: gitignored, only
    // present after a local `npx cap sync` / Gradle build, and the bundled
    // JS chunks shouldn't be linted.
    "android/app/build/**",
    "android/app/src/main/assets/public/**",
    "android/build/**",
    // Vendored pdf.js worker. This generated/minified runtime is served as a
    // static asset and is not maintained as application source.
    "public/vendor/pdf.worker.min.mjs",
    // Standalone Node.js utility scripts (CommonJS, not part of the app).
    "scripts/**",
  ]),
]);

export default eslintConfig;
