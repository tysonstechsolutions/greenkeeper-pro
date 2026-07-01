import sharp from "sharp";
const [pngPath, rowPtArg, scaleArg] = process.argv.slice(2);
const scale = Number(scaleArg || 4);
const rowPt = Number(rowPtArg || 400);
const { data, info } = await sharp(pngPath).greyscale().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const ry = Math.round((792 - rowPt) * scale);
const dark = [];
for (let x = 0; x < width; x++) dark.push(data[ry * width + x] < 120 ? 1 : 0);
const lines = []; let start = -1;
for (let x = 0; x <= width; x++) {
  if (dark[x]) { if (start < 0) start = x; }
  else if (start >= 0) { lines.push(+((start + x - 1) / 2 / scale).toFixed(1)); start = -1; }
}
console.log("row", rowPt, "pt -> vertical dividers (pdf x):", lines.join(", "));
