import { jsPDF } from "jspdf";

/**
 * Builds a single print-ready PDF "packet" from a set of documents.
 * Renders a cover page, then each document on its own page(s) with light
 * Markdown formatting (headings, bullets, checkboxes, numbered lists, rules,
 * blockquotes, simple tables). Returns the jsPDF instance (caller calls .save).
 */

export interface PacketDoc {
  title: string;
  body: string;
  categoryLabel?: string;
}

export interface PacketOptions {
  title?: string;
  subtitle?: string;
  dateStr?: string;
}

const MARGIN = 54; // 0.75"
const COURSE = "Veterans Memorial Golf Course";

function stripInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1$2")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1");
}

export function buildPacketPdf(
  docs: PacketDoc[],
  opts: PacketOptions = {},
): jsPDF {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  let y = MARGIN;

  const setFont = (size: number, style: "normal" | "bold" | "italic") => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
  };

  const ensureSpace = (h: number) => {
    if (y + h > pageH - MARGIN) {
      pdf.addPage();
      y = MARGIN;
    }
  };

  const writeWrapped = (
    text: string,
    opt: {
      size?: number;
      style?: "normal" | "bold" | "italic";
      gapBefore?: number;
      gapAfter?: number;
      indent?: number;
      hanging?: string;
      color?: [number, number, number];
    } = {},
  ) => {
    const size = opt.size ?? 11;
    const style = opt.style ?? "normal";
    const lineH = size * 1.32;
    const indent = opt.indent ?? 0;
    if (opt.gapBefore) y += opt.gapBefore;
    setFont(size, style);
    const col = opt.color ?? [33, 37, 41];
    pdf.setTextColor(col[0], col[1], col[2]);

    const prefix = opt.hanging ?? "";
    const prefixW = prefix ? pdf.getTextWidth(prefix) : 0;
    const wrapW = contentW - indent - prefixW;
    const wrapped = pdf.splitTextToSize(text || " ", wrapW) as string[];

    wrapped.forEach((ln, i) => {
      ensureSpace(lineH);
      if (i === 0 && prefix) {
        pdf.text(prefix, MARGIN + indent, y);
        pdf.text(ln, MARGIN + indent + prefixW, y);
      } else {
        pdf.text(ln, MARGIN + indent + prefixW, y);
      }
      y += lineH;
    });
    if (opt.gapAfter) y += opt.gapAfter;
    pdf.setTextColor(33, 37, 41);
  };

  // ── Cover page ──
  setFont(12, "bold");
  pdf.setTextColor(27, 67, 50);
  pdf.text(COURSE.toUpperCase(), MARGIN, y + 6);
  y += 30;
  pdf.setDrawColor(182, 141, 64);
  pdf.setLineWidth(2);
  pdf.line(MARGIN, y, MARGIN + 120, y);
  pdf.setLineWidth(1);
  y += 40;
  setFont(26, "bold");
  pdf.setTextColor(20, 30, 25);
  writeWrapped(opts.title || "New Hire Packet", { size: 26, style: "bold", gapAfter: 6 });
  if (opts.subtitle) {
    writeWrapped(opts.subtitle, { size: 14, style: "normal", color: [90, 100, 95], gapAfter: 4 });
  }
  if (opts.dateStr) {
    writeWrapped(opts.dateStr, { size: 11, style: "normal", color: [120, 128, 124], gapAfter: 10 });
  }
  y += 16;
  writeWrapped("Included documents", { size: 12, style: "bold", color: [27, 67, 50], gapAfter: 6 });
  docs.forEach((d, i) => {
    writeWrapped(d.title, {
      size: 11,
      hanging: `${i + 1}.  `,
      color: [40, 48, 44],
      gapAfter: 1,
    });
  });

  // ── Each document on its own page ──
  for (const d of docs) {
    pdf.addPage();
    y = MARGIN;
    renderBody(d.body);
  }

  // ── Footer page numbers (skip cover) ──
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    setFont(8.5, "normal");
    pdf.setTextColor(150, 156, 152);
    const label =
      p === 1 ? COURSE : `${COURSE}  ·  Page ${p - 1} of ${total - 1}`;
    pdf.text(label, MARGIN, pageH - 28);
  }

  return pdf;

  function renderBody(body: string) {
    const lines = (body || "").replace(/\r\n/g, "\n").split("\n");
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (line.trim() === "") {
        y += 6;
        continue;
      }
      let m: RegExpMatchArray | null;
      if (/^#\s+/.test(line)) {
        writeWrapped(stripInline(line.replace(/^#\s+/, "")), {
          size: 18,
          style: "bold",
          color: [27, 67, 50],
          gapBefore: 2,
          gapAfter: 5,
        });
      } else if (/^##\s+/.test(line)) {
        writeWrapped(stripInline(line.replace(/^##\s+/, "")), {
          size: 13.5,
          style: "bold",
          color: [30, 45, 38],
          gapBefore: 8,
          gapAfter: 3,
        });
      } else if (/^###\s+/.test(line)) {
        writeWrapped(stripInline(line.replace(/^###\s+/, "")), {
          size: 11.5,
          style: "bold",
          gapBefore: 6,
          gapAfter: 2,
        });
      } else if (/^---+$/.test(line.trim())) {
        y += 4;
        ensureSpace(10);
        pdf.setDrawColor(210, 214, 211);
        pdf.line(MARGIN, y, MARGIN + contentW, y);
        y += 9;
      } else if ((m = line.match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/))) {
        writeWrapped(stripInline(m[2]), { size: 11, hanging: "[ ]  ", indent: 6, gapAfter: 1 });
      } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
        writeWrapped(stripInline(m[1]), { size: 11, hanging: "•  ", indent: 6, gapAfter: 1 });
      } else if ((m = line.match(/^(\d+)\.\s+(.*)$/))) {
        writeWrapped(stripInline(m[2]), { size: 11, hanging: `${m[1]}.  `, indent: 6, gapAfter: 1 });
      } else if (/^\|.*\|/.test(line.trim())) {
        const cells = line
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
        if (cells.every((c) => c === "" || /^:?-{2,}:?$/.test(c))) continue;
        writeWrapped(cells.join("    "), { size: 10.5, gapAfter: 2 });
      } else if (/^>\s+/.test(line)) {
        writeWrapped(stripInline(line.replace(/^>\s+/, "")), {
          size: 10.5,
          style: "italic",
          indent: 12,
          color: [90, 100, 95],
          gapAfter: 2,
        });
      } else {
        writeWrapped(stripInline(line), { size: 11, gapAfter: 3 });
      }
    }
  }
}
