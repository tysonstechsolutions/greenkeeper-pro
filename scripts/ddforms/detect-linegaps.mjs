// Find interior white gaps in long horizontal/vertical grid lines of a form
// raster (gaps left when data-text masks clipped a line). Only bridges a gap
// when BOTH neighboring dark runs are long (>=EDGE) — so printed label text,
// whose strokes are short runs, is never mistaken for a line. Emits a red
// diagnostic PNG + a JSON list of gap rects (image px).
import sharp from "sharp";
const [pngPath, outDiag, outJson] = process.argv.slice(2);
const { data, info } = await sharp(pngPath).greyscale().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const dark = (x, y) => data[y * W + x] < 128;

const MINLINE_H = 400, GAP_H = 200, EDGE = 60;
const MINLINE_V = 220, GAP_V = 90;
const fills = [];

for (let y = 0; y < H; y++) {
  const runs = [];
  let s = -1;
  for (let x = 0; x < W; x++) {
    if (dark(x, y)) { if (s < 0) s = x; }
    else if (s >= 0) { runs.push([s, x - 1]); s = -1; }
  }
  if (s >= 0) runs.push([s, W - 1]);
  let i = 0;
  while (i < runs.length) {
    let start = runs[i][0], end = runs[i][1];
    const gaps = [];
    let j = i + 1;
    while (j < runs.length && runs[j][0] - end - 1 <= GAP_H) {
      if (end - start + 1 >= EDGE && runs[j][1] - runs[j][0] + 1 >= EDGE)
        gaps.push([end + 1, runs[j][0] - 1]);
      end = runs[j][1];
      j++;
    }
    if (end - start + 1 >= MINLINE_H) for (const g of gaps) fills.push({ x: g[0], y: y - 1, w: g[1] - g[0] + 1, h: 3 });
    i = j;
  }
}
for (let x = 0; x < W; x++) {
  const runs = [];
  let s = -1;
  for (let y = 0; y < H; y++) {
    if (dark(x, y)) { if (s < 0) s = y; }
    else if (s >= 0) { runs.push([s, y - 1]); s = -1; }
  }
  if (s >= 0) runs.push([s, H - 1]);
  let i = 0;
  while (i < runs.length) {
    let start = runs[i][0], end = runs[i][1];
    const gaps = [];
    let j = i + 1;
    while (j < runs.length && runs[j][0] - end - 1 <= GAP_V) {
      if (end - start + 1 >= EDGE && runs[j][1] - runs[j][0] + 1 >= EDGE)
        gaps.push([end + 1, runs[j][0] - 1]);
      end = runs[j][1];
      j++;
    }
    if (end - start + 1 >= MINLINE_V) for (const g of gaps) fills.push({ x: x - 1, y: g[0], w: 3, h: g[1] - g[0] + 1 });
    i = j;
  }
}
const rects = fills.map(f => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="red"/>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${rects}</svg>`;
await sharp(pngPath).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(outDiag);
const fs = await import("fs");
fs.writeFileSync(outJson, JSON.stringify(fills));
console.log(`${pngPath}: ${fills.length} gap fills -> ${outDiag}`);
