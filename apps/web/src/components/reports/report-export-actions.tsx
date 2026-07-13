"use client";

import { Download } from "lucide-react";

export type ReportExportCell = string | number | boolean | null | undefined;

export type ReportExportSection = {
  title: string;
  rows: Array<Record<string, ReportExportCell>>;
};

type ReportExportActionsProps = {
  filename: string;
  title: string;
  subtitle?: string;
  sections: ReportExportSection[];
};

const buttonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 text-xs font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]";

function normalizeFilename(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function cellValue(value: ReportExportCell) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function csvCell(value: ReportExportCell) {
  const text = cellValue(value);

  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildCsv({
  title,
  subtitle,
  sections,
}: Pick<ReportExportActionsProps, "title" | "subtitle" | "sections">) {
  const lines = [
    [csvCell(title)],
    subtitle ? [csvCell(subtitle)] : [],
    [`Generated at: ${new Date().toLocaleString("en")}`],
    [],
  ];

  for (const section of sections) {
    lines.push([csvCell(section.title)]);

    const headers = [
      ...new Set(section.rows.flatMap((row) => Object.keys(row))),
    ];

    if (headers.length === 0) {
      lines.push(["No records"]);
      lines.push([]);
      continue;
    }

    lines.push(headers.map(csvCell));
    for (const row of section.rows) {
      lines.push(headers.map((header) => csvCell(row[header])));
    }
    lines.push([]);
  }

  return lines.map((line) => line.join(",")).join("\r\n");
}

function pdfSafe(value: ReportExportCell) {
  return cellValue(value)
    .replaceAll("₦", "NGN ")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("≥", ">=")
    .replace(/[^\x20-\x7E]/g, "");
}

function escapePdfText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function wrapLine(line: string, max = 96) {
  if (line.length <= max) {
    return [line];
  }

  const words = line.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function buildPdfTextLines({
  title,
  subtitle,
  sections,
}: Pick<ReportExportActionsProps, "title" | "subtitle" | "sections">) {
  const lines = [
    pdfSafe(title),
    subtitle ? pdfSafe(subtitle) : "",
    `Generated at: ${new Date().toLocaleString("en")}`,
    "",
  ];

  for (const section of sections) {
    lines.push(pdfSafe(section.title).toUpperCase());

    if (section.rows.length === 0) {
      lines.push("No records");
      lines.push("");
      continue;
    }

    for (const row of section.rows) {
      const detail = Object.entries(row)
        .map(([key, value]) => `${key}: ${pdfSafe(value)}`)
        .join(" | ");
      lines.push(...wrapLine(detail));
    }
    lines.push("");
  }

  return lines;
}

function buildPdf(props: Pick<ReportExportActionsProps, "title" | "subtitle" | "sections">) {
  const lines = buildPdfTextLines(props);
  const linesPerPage = 44;
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }

  if (pages.length === 0) {
    pages.push(["No records"]);
  }

  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length + 2;
  };
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];

  for (const pageLines of pages) {
    const escapedLines = pageLines.map(
      (line) => `(${escapePdfText(line)}) Tj T*`,
    );
    const stream = [
      "BT",
      "/F1 10 Tf",
      "50 780 Td",
      "14 TL",
      ...escapedLines,
      "ET",
    ].join("\n");
    const contentId = addObject(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
    const pageId = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  const pagesId = 2;
  const catalogId = 1;
  const catalog = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  const pagesObject = `<< /Type /Pages /Kids [${pageIds
    .map((id) => `${id} 0 R`)
    .join(" ")}] /Count ${pageIds.length} >>`;
  const orderedObjects = [catalog, pagesObject, ...objects];
  const pdfParts = ["%PDF-1.4\n"];
  const offsets: number[] = [0];

  orderedObjects.forEach((body, index) => {
    offsets.push(pdfParts.join("").length);
    pdfParts.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  });

  const xrefOffset = pdfParts.join("").length;
  pdfParts.push(`xref\n0 ${orderedObjects.length + 1}\n`);
  pdfParts.push("0000000000 65535 f \n");

  for (let index = 1; index < offsets.length; index += 1) {
    pdfParts.push(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
  }

  pdfParts.push(
    `trailer\n<< /Size ${orderedObjects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  );

  return pdfParts.join("");
}

export function ReportExportActions({
  filename,
  title,
  subtitle,
  sections,
}: ReportExportActionsProps) {
  const safeFilename = normalizeFilename(filename || title) || "report";

  function downloadCsv() {
    downloadBlob(
      new Blob([buildCsv({ title, subtitle, sections })], {
        type: "text/csv;charset=utf-8",
      }),
      `${safeFilename}.csv`,
    );
  }

  function downloadPdf() {
    downloadBlob(
      new Blob([buildPdf({ title, subtitle, sections })], {
        type: "application/pdf",
      }),
      `${safeFilename}.pdf`,
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={buttonClass} onClick={downloadCsv} type="button">
        <Download aria-hidden className="size-4" />
        CSV
      </button>
      <button className={buttonClass} onClick={downloadPdf} type="button">
        <Download aria-hidden className="size-4" />
        PDF
      </button>
    </div>
  );
}
