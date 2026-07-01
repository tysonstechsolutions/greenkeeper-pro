import { chromium } from "playwright";
import { writeFileSync } from "fs";
const [outPath, ...urls] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36" });
let saved = false;
for (const url of urls) {
  try {
    const req = await ctx.request.get(url, { timeout: 40000 });
    const status = req.status();
    const body = await req.body();
    const head = body.slice(0, 5).toString("latin1");
    console.log(url, "->", status, body.length, JSON.stringify(head));
    if (status === 200 && head === "%PDF-") { writeFileSync(outPath, body); console.log("SAVED", outPath, body.length); saved = true; break; }
  } catch (e) { console.log(url, "ERR", String(e).slice(0, 90)); }
}
await browser.close();
process.exit(saved ? 0 : 3);
