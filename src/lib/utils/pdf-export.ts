/**
 * PDF Export Utilities
 *
 * Client-side PDF generation using html2canvas + jsPDF
 * Creates printable reports from styled HTML content
 */

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export type ReportType =
  | "daily"
  | "weekly"
  | "monthly"
  | "staff"
  | "chemical"
  | "equipment"
  | "parking-lot"
  | "clubhouse"
  | "observations";

export interface PDFExportOptions {
  /** Document title shown in PDF header */
  title: string;
  /** Optional subtitle (e.g., date range) */
  subtitle?: string;
  /** Paper orientation */
  orientation?: "portrait" | "landscape";
  /** Page margins in mm */
  margin?: number;
  /** Include page numbers */
  includePageNumbers?: boolean;
  /** Include generation timestamp */
  includeTimestamp?: boolean;
  /** Filename without extension */
  filename?: string;
}

const DEFAULT_OPTIONS: Required<PDFExportOptions> = {
  title: "Report",
  subtitle: "",
  orientation: "portrait",
  margin: 15,
  includePageNumbers: true,
  includeTimestamp: true,
  filename: "report",
};

/**
 * Prepare an element for PDF capture by applying print-friendly styles
 */
function preparePrintStyles(element: HTMLElement): () => void {
  const originalStyles = element.style.cssText;

  // Apply print-friendly styles
  element.style.backgroundColor = "#ffffff";
  element.style.color = "#000000";
  element.style.width = "100%";
  element.style.maxWidth = "none";

  // Return cleanup function
  return () => {
    element.style.cssText = originalStyles;
  };
}

/**
 * Add header to PDF page
 */
function addHeader(
  pdf: jsPDF,
  options: Required<PDFExportOptions>,
  pageWidth: number
): number {
  const marginLeft = options.margin;
  let yPos = options.margin;

  // Title
  pdf.setFontSize(18);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(27, 67, 50); // VMGC brand color
  pdf.text(options.title, marginLeft, yPos + 6);
  yPos += 10;

  // Subtitle
  if (options.subtitle) {
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 100, 100);
    pdf.text(options.subtitle, marginLeft, yPos + 4);
    yPos += 8;
  }

  // Timestamp
  if (options.includeTimestamp) {
    pdf.setFontSize(9);
    pdf.setTextColor(150, 150, 150);
    const timestamp = new Date().toLocaleString();
    pdf.text(`Generated: ${timestamp}`, marginLeft, yPos + 4);
    yPos += 6;
  }

  // Divider line
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.5);
  pdf.line(marginLeft, yPos + 2, pageWidth - marginLeft, yPos + 2);

  return yPos + 8;
}

/**
 * Add footer with page numbers
 */
function addFooter(
  pdf: jsPDF,
  options: Required<PDFExportOptions>,
  pageNumber: number,
  totalPages: number,
  pageWidth: number,
  pageHeight: number
): void {
  if (!options.includePageNumbers) return;

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(150, 150, 150);

  const text = `Page ${pageNumber} of ${totalPages}`;
  const textWidth = pdf.getTextWidth(text);
  const xPos = (pageWidth - textWidth) / 2;
  const yPos = pageHeight - options.margin / 2;

  pdf.text(text, xPos, yPos);
}

/**
 * Capture an HTML element and export as PDF
 *
 * @param element - The HTML element to capture
 * @param options - PDF export options
 * @returns Promise that resolves when PDF is downloaded
 */
export async function exportElementToPDF(
  element: HTMLElement,
  options: Partial<PDFExportOptions> = {}
): Promise<void> {
  const opts: Required<PDFExportOptions> = { ...DEFAULT_OPTIONS, ...options };

  // Prepare element for capture
  const cleanup = preparePrintStyles(element);

  try {
    // Capture element as canvas
    const canvas = await html2canvas(element, {
      scale: 2, // Higher quality
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });

    // Calculate dimensions
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;

    // Create PDF
    const pdf = new jsPDF({
      orientation: opts.orientation,
      unit: "mm",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - opts.margin * 2;

    // Add header to first page
    const headerHeight = addHeader(pdf, opts, pageWidth);

    // Calculate image scaling
    const ratio = contentWidth / imgWidth;
    const scaledHeight = imgHeight * ratio;

    // Available height per page (accounting for header on first page, footer on all)
    const footerSpace = opts.includePageNumbers ? 10 : 0;
    const firstPageContentHeight = pageHeight - headerHeight - opts.margin - footerSpace;
    const otherPageContentHeight = pageHeight - opts.margin * 2 - footerSpace;

    // Split image across pages if needed
    let remainingHeight = scaledHeight;
    let sourceY = 0;
    let pageNumber = 1;
    const totalPages = Math.ceil(
      (scaledHeight - firstPageContentHeight) / otherPageContentHeight + 1
    );

    // First page
    const firstPageHeight = Math.min(remainingHeight, firstPageContentHeight);
    const firstPageSourceHeight = firstPageHeight / ratio;

    // Create cropped canvas for first page
    const firstCanvas = document.createElement("canvas");
    firstCanvas.width = imgWidth;
    firstCanvas.height = firstPageSourceHeight;
    const firstCtx = firstCanvas.getContext("2d");
    if (firstCtx) {
      firstCtx.drawImage(
        canvas,
        0,
        0,
        imgWidth,
        firstPageSourceHeight,
        0,
        0,
        imgWidth,
        firstPageSourceHeight
      );
      const firstImgData = firstCanvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(
        firstImgData,
        "JPEG",
        opts.margin,
        headerHeight,
        contentWidth,
        firstPageHeight
      );
    }

    addFooter(pdf, opts, pageNumber, totalPages, pageWidth, pageHeight);

    remainingHeight -= firstPageHeight;
    sourceY += firstPageSourceHeight;
    pageNumber++;

    // Subsequent pages
    while (remainingHeight > 0) {
      pdf.addPage();

      const pageContentHeight = Math.min(remainingHeight, otherPageContentHeight);
      const pageSourceHeight = pageContentHeight / ratio;

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = imgWidth;
      pageCanvas.height = pageSourceHeight;
      const pageCtx = pageCanvas.getContext("2d");
      if (pageCtx) {
        pageCtx.drawImage(
          canvas,
          0,
          sourceY,
          imgWidth,
          pageSourceHeight,
          0,
          0,
          imgWidth,
          pageSourceHeight
        );
        const pageImgData = pageCanvas.toDataURL("image/jpeg", 0.95);
        pdf.addImage(
          pageImgData,
          "JPEG",
          opts.margin,
          opts.margin,
          contentWidth,
          pageContentHeight
        );
      }

      addFooter(pdf, opts, pageNumber, totalPages, pageWidth, pageHeight);

      remainingHeight -= pageContentHeight;
      sourceY += pageSourceHeight;
      pageNumber++;
    }

    // Download PDF
    pdf.save(`${opts.filename}.pdf`);
  } finally {
    cleanup();
  }
}

/**
 * Export report data to CSV
 *
 * @param data - Array of objects to export
 * @param filename - Filename without extension
 * @param headers - Optional custom headers (defaults to object keys)
 */
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  headers?: { key: keyof T; label: string }[]
): void {
  if (data.length === 0) {
    console.warn("No data to export");
    return;
  }

  // Determine headers
  const cols = headers || Object.keys(data[0]).map((key) => ({ key, label: key }));

  // Build CSV content
  const headerRow = cols.map((c) => `"${String(c.label)}"`).join(",");
  const dataRows = data.map((row) =>
    cols
      .map((col) => {
        const value = row[col.key as keyof T];
        if (value === null || value === undefined) return '""';
        if (typeof value === "string") {
          // Escape quotes and wrap in quotes
          return `"${value.replace(/"/g, '""')}"`;
        }
        if (typeof value === "object") {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        }
        return `"${value}"`;
      })
      .join(",")
  );

  const csv = [headerRow, ...dataRows].join("\n");

  // Create and download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format date for report display
 */
export function formatReportDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format date range for report subtitle
 */
export function formatDateRange(start: Date | string, end: Date | string): string {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;

  const startStr = s.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const endStr = e.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `${startStr} - ${endStr}`;
}

/**
 * Generate filename with date
 */
export function generateReportFilename(
  reportType: ReportType,
  dateIdentifier?: string
): string {
  const date = dateIdentifier || new Date().toISOString().split("T")[0];
  return `vmgc-${reportType}-report-${date}`;
}

/**
 * Print a specific element (opens print dialog)
 */
export function printElement(element: HTMLElement, title?: string): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    console.error("Failed to open print window");
    return;
  }

  // Clone the element
  const clone = element.cloneNode(true) as HTMLElement;

  // Build print document
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title || "Report"}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          padding: 20px;
          color: #000;
          background: #fff;
        }
        @media print {
          body {
            padding: 0;
          }
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #f4f4f4;
        }
        .badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
        }
        h1, h2, h3 {
          color: #1B4332;
          margin-bottom: 10px;
        }
        .card {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 16px;
          margin: 10px 0;
        }
      </style>
    </head>
    <body>
      ${clone.outerHTML}
    </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  // Wait for content to load then print
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}
