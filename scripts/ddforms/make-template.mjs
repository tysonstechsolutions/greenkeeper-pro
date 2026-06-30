// Render a filled XFA form at high DPI and white-mask every text item that is
// NOT a known form label, producing a clean blank template PNG. Pass the PDF,
// a JSON file of exact label strings to KEEP, the page index, scale, and out.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";
import sharp from "sharp";

const [pdfPath, labelsPath, pageArg, scaleArg, outPath] = process.argv.slice(2);
const pageNum = Number(pageArg || 1);
const scale = Number(scaleArg || 4);
const labels = new Set(JSON.parse(readFileSync(labelsPath, "utf8")));
const b64 = readFileSync(pdfPath).toString("base64");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<!doctype html><html><body></body></html>");
await page.addScriptTag({ url: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" });
const { png, pw, ph, hpt, items } = await page.evaluate(async ({ b64, pageNum, scale }) => {
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
  const tc = await pg.getTextContent();
  const items = tc.items.filter((it) => it.str && it.str.trim()).map((it) => {
    const [, , , , x, y] = it.transform;
    return { s: it.str, x, y, w: it.width, h: it.height };
  });
  return { png: canvas.toDataURL("image/png"), pw: canvas.width, ph: canvas.height, hpt: vp.viewBox ? 792 : 792, items };
}, { b64, pageNum, scale });
await browser.close();

const PAGE_H = 792; // letter
const rects = items
  .filter((it) => !labels.has(it.s.trim()))
  .map((it) => {
    const padX = 1.5, padTop = 3, padBot = 2;
    const xpx = Math.max(0, (it.x - padX) * scale);
    const ytop = (PAGE_H - (it.y + it.h + padTop)) * scale;
    const wpx = (it.w + padX * 2) * scale;
    const hpx = (it.h + padTop + padBot) * scale;
    return `<rect x="${xpx.toFixed(1)}" y="${ytop.toFixed(1)}" width="${wpx.toFixed(1)}" height="${hpx.toFixed(1)}" fill="white"/>`;
  });
const base = Buffer.from(png.split(",")[1], "base64");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}">${rects.join("")}</svg>`;
await sharp(base).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(outPath);
console.log(`masked ${rects.length} data items -> ${outPath} (${pw}x${ph})`);
