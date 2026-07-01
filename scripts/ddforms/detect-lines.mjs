// Find horizontal grid lines in a template PNG by scanning one column for dark
// pixel runs; report each line's PDF-point y (page 792 tall, image = scale*).
import sharp from "sharp";
const [pngPath, colPtArg, scaleArg] = process.argv.slice(2);
const scale = Number(scaleArg || 4);
const colPt = Number(colPtArg || 150);
const { data, info } = await sharp(pngPath).greyscale().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const cx = Math.round(colPt * scale);
const dark = [];
for (let y = 0; y < height; y++) {
  const v = data[y * width + cx];
  dark.push(v < 120 ? 1 : 0);
}
// group consecutive dark rows into lines; report center
const lines = [];
let start = -1;
for (let y = 0; y <= height; y++) {
  if (dark[y]) { if (start < 0) start = y; }
  else if (start >= 0) { const cy = (start + y - 1) / 2; lines.push(cy); start = -1; }
}
const pdfY = lines.map((cy) => +(792 - cy / scale).toFixed(1));
console.log("col", colPt, "pt -> lines (pdf y, top→bottom):");
console.log(pdfY.join(", "));
// pitch between consecutive table lines
const diffs = [];
for (let i = 1; i < pdfY.length; i++) diffs.push(+(pdfY[i-1] - pdfY[i]).toFixed(1));
console.log("gaps:", diffs.join(", "));
