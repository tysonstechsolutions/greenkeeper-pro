// Dump text items (string + page-space x,y,width,height) from a PDF via pdf.js.
// pdf-space origin is bottom-left; we report top-left y too for masking.
import { chromium } from "playwright";
import { readFileSync } from "fs";
const [pdfPath] = process.argv.slice(2);
const b64 = readFileSync(pdfPath).toString("base64");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<!doctype html><html><body></body></html>");
await page.addScriptTag({ url: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" });
const data = await page.evaluate(async (b64) => {
  const pdfjs = window["pdfjsLib"];
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent();
    const items = tc.items.filter((it) => it.str && it.str.trim()).map((it) => {
      const [, , , , x, y] = it.transform; // baseline x,y in pdf space
      return { s: it.str, x: Math.round(x), y: Math.round(y), w: Math.round(it.width), h: Math.round(it.height) };
    });
    out.push({ page: i, wpt: Math.round(vp.width), hpt: Math.round(vp.height), items });
  }
  return out;
}, b64);
console.log(JSON.stringify(data, null, 1));
await browser.close();
