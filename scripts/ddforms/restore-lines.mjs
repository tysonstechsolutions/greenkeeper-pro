// Restore grid lines that data-masking erased, by copying the ORIGINAL raster's
// long horizontal/vertical line segments onto our template — but ONLY for a
// segment the template ALREADY retains a real fraction (>=FRAC) of. That
// completes partially-erased dividers yet rejects the original's buttons /
// signature / data (masked to white in the template -> ~0% coverage). Rasters
// must be pixel-aligned (same form, same scale).
import sharp from "sharp";
const [origPath, tmplPath, outPath] = process.argv.slice(2);
const load = async f => { const { data, info } = await sharp(f).greyscale().raw().toBuffer({ resolveWithObject: true }); return { d: data, W: info.width, H: info.height }; };
const O = await load(origPath), M = await load(tmplPath);
const W = O.W, H = O.H;
const oDark = (x, y) => O.d[y * W + x] < 128;
const mDark = (x, y) => M.d[y * W + x] < 128;
const RUN = 40, FRAC = 0.18;
const fills = [];
// horizontal
for (let y = 0; y < H; y++) {
  let s = -1;
  for (let x = 0; x <= W; x++) {
    const d = x < W && oDark(x, y);
    if (d) { if (s < 0) s = x; }
    else {
      if (s >= 0 && x - s >= RUN) {
        let cov = 0;
        for (let xx = s; xx < x; xx++) if (mDark(xx, y) || (y > 0 && mDark(xx, y - 1)) || (y < H - 1 && mDark(xx, y + 1))) cov++;
        if (cov >= FRAC * (x - s)) fills.push({ x: s, y, w: x - s, h: 1 });
      }
      s = -1;
    }
  }
}
// vertical
for (let x = 0; x < W; x++) {
  let s = -1;
  for (let y = 0; y <= H; y++) {
    const d = y < H && oDark(x, y);
    if (d) { if (s < 0) s = y; }
    else {
      if (s >= 0 && y - s >= RUN) {
        let cov = 0;
        for (let yy = s; yy < y; yy++) if (mDark(x, yy) || (x > 0 && mDark(x - 1, yy)) || (x < W - 1 && mDark(x + 1, yy))) cov++;
        if (cov >= FRAC * (y - s)) fills.push({ x, y: s, w: 1, h: y - s });
      }
      s = -1;
    }
  }
}
const rects = fills.map(f => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="black"/>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${rects}</svg>`;
const tmp = outPath + ".tmp.png";
await sharp(tmplPath).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(tmp);
(await import("fs")).renameSync(tmp, outPath);
console.log(`${tmplPath}: restored ${fills.length} segments -> ${outPath}`);
