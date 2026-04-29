// Summarizes findings.json into a categorized issue list.
import fs from "node:fs";
import path from "node:path";

const auditDir = path.resolve("tests/e2e/.audit");
const perTestDir = path.join(auditDir, "per-test");
const findingsPath = path.join(auditDir, "findings.json");

// Aggregate per-test files into a single findings.json
let findings = [];
if (fs.existsSync(perTestDir)) {
  const perTestFiles = fs.readdirSync(perTestDir).filter((f) => f.endsWith(".json"));
  findings = perTestFiles.map((f) =>
    JSON.parse(fs.readFileSync(path.join(perTestDir, f), "utf8")),
  );
  fs.writeFileSync(findingsPath, JSON.stringify(findings, null, 2));
} else if (fs.existsSync(findingsPath)) {
  findings = JSON.parse(fs.readFileSync(findingsPath, "utf8"));
}

const buckets = {
  pageErrors: [],
  consoleErrors: [],
  failedRequests: [],
  overlap: [],
  horizontalScroll: [],
  notLoaded: [],
};

for (const f of findings) {
  if (!f.loaded) buckets.notLoaded.push(f);
  if (f.pageErrors?.length) buckets.pageErrors.push(f);
  if (f.consoleErrors?.length) buckets.consoleErrors.push(f);
  if (f.failedRequests?.length) buckets.failedRequests.push(f);
  if (f.overlap?.length) buckets.overlap.push(f);
  if (f.horizontalScroll) buckets.horizontalScroll.push(f);
}

const fmt = (f) => `${f.route} @ ${f.viewport}`;

console.log(`Total routes audited: ${findings.length}`);
console.log("");

console.log(`\n━━ NOT LOADED (${buckets.notLoaded.length}) ━━`);
for (const f of buckets.notLoaded) console.log(` • ${fmt(f)}`);

console.log(`\n━━ PAGE ERRORS (${buckets.pageErrors.length}) ━━`);
for (const f of buckets.pageErrors) {
  console.log(` • ${fmt(f)}`);
  for (const e of f.pageErrors) {
    const firstLine = e.split("\n")[0].slice(0, 200);
    console.log(`     - ${firstLine}`);
  }
}

console.log(`\n━━ CONSOLE ERRORS (${buckets.consoleErrors.length}) ━━`);
for (const f of buckets.consoleErrors) {
  console.log(` • ${fmt(f)}`);
  for (const e of f.consoleErrors.slice(0, 3)) {
    console.log(`     - ${e.slice(0, 180)}`);
  }
}

console.log(`\n━━ FAILED REQUESTS (${buckets.failedRequests.length}) ━━`);
for (const f of buckets.failedRequests) {
  console.log(` • ${fmt(f)}`);
  for (const r of f.failedRequests.slice(0, 3)) {
    console.log(`     - ${r.slice(0, 200)}`);
  }
}

console.log(`\n━━ UI OVERLAP (${buckets.overlap.length}) ━━`);
for (const f of buckets.overlap) {
  console.log(` • ${fmt(f)}`);
  for (const o of f.overlap.slice(0, 5)) {
    console.log(
      `     - ${o.type}: ${o.el} (z=${o.elZ ?? "?"} navZ=${o.navZ ?? "?"}) at ${JSON.stringify(o.rect)}`,
    );
  }
}

console.log(`\n━━ HORIZONTAL SCROLL (${buckets.horizontalScroll.length}) ━━`);
for (const f of buckets.horizontalScroll) console.log(` • ${fmt(f)}`);

// Per-route screenshot list
const screens = fs
  .readdirSync(auditDir)
  .filter((f) => f.endsWith(".png"))
  .sort();
console.log(`\n━━ SCREENSHOTS CAPTURED (${screens.length}) ━━`);
const routes = [...new Set(screens.map((s) => s.split("__")[0]))];
console.log(`Unique routes covered: ${routes.length}`);
