// Restore grid lines that data-masks partially erased. Detect vertical divider
// columns, then for each cell (between adjacent dividers) and each row, if a
// real horizontal-rule segment is present (a continuous dark run >= MINSEG) but
// the rule is only partly filled across the cell, complete it. Without --apply
// it writes a RED diagnostic; with --apply it fills black and overwrites.
import sharp from "sharp";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const [pngPath, out] = args.filter(a => a !== "--apply");
const { data, info } = await sharp(pngPath).greyscale().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const dark = (x, y) => data[y * W + x] < 128;

const VMIN = 150;                 // a divider column has a vertical dark run this long
const isDiv = new Uint8Array(W);
for (let x = 0; x < W; x++) {
  let run = 0, best = 0;
  for (let y = 0; y < H; y++) { if (dark(x, y)) { run++; if (run > best) best = run; } else run = 0; }
  if (best >= VMIN) isDiv[x] = 1;
}
const vlist = [];
for (let x = 0; x < W; x++) if (isDiv[x]) { const s = x; while (x < W && isDiv[x]) x++; vlist.push(Math.round((s + x - 1) / 2)); }

const MINSEG = 55, FRACFULL = 0.965, FRACMIN = 0.14, MAXW = 820, MINW = 28;
const fills = [];
for (let y = 1; y < H - 1; y++) {
  for (let k = 0; k + 1 < vlist.length; k++) {
    const v1 = vlist[k], v2 = vlist[k + 1], w = v2 - v1;
    if (w < MINW || w > MAXW) continue;
    const a = v1 + 3, b = v2 - 3;
    let run = 0, best = 0, cnt = 0;
    for (let x = a; x <= b; x++) { if (dark(x, y)) { run++; cnt++; if (run > best) best = run; } else run = 0; }
    const frac = cnt / (b - a + 1);
    if (best >= MINSEG && frac >= FRACMIN && frac < FRACFULL) {
      let s = -1;
      for (let x = a; x <= b + 1; x++) {
        const d = x <= b && dark(x, y);
        if (!d) { if (s >= 0) { fills.push({ x: s, y, w: x - s, h: 1 }); s = -1; } }
        else if (s < 0) s = x;
      }
    }
  }
}
const color = apply ? "black" : "red";
const rects = fills.map(f => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="${color}"/>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${rects}</svg>`;
const tmp = out + ".tmp.png";
await sharp(pngPath).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(tmp);
const fs = await import("fs");
fs.renameSync(tmp, out);
console.log(`${pngPath}: ${vlist.length} dividers, ${fills.length} fill px-rows -> ${out}${apply ? " [APPLIED]" : " [diagnostic]"}`);
