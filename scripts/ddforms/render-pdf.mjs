// Render one page of a PDF to PNG via Playwright + pdf.js (no poppler needed).
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";
const [pdfPath, outPath, pageArg, scaleArg] = process.argv.slice(2);
const pageNum = Number(pageArg || 1), scale = Number(scaleArg || 2);
const b64 = readFileSync(pdfPath).toString("base64");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<!doctype html><html><body></body></html>");
await page.addScriptTag({ url: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" });
const png = await page.evaluate(async ({ b64, pageNum, scale }) => {
  const pdfjs = window["pdfjsLib"];
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const pg = await doc.getPage(pageNum);
  const vp = pg.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pg.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas.toDataURL("image/png");
}, { b64, pageNum, scale });
await browser.close();
writeFileSync(outPath, Buffer.from(png.split(",")[1], "base64"));
console.log("rendered", pdfPath, "->", outPath);
