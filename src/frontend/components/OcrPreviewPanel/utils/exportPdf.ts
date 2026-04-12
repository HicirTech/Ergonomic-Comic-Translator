/// <reference lib="dom" />
/**
 * WYSIWYG export of all upload pages to a single PDF.
 *
 * Each page is rendered at its native pixel resolution:
 *   1. The page image (text or textless variant based on current imageMode)
 *   2. The SVG overlay (polygon outlines and/or translation text) if enabled
 *
 * No external PDF library required — pages are encoded as JPEG blobs and
 * assembled into a minimal valid PDF using the DCTDecode filter, which embeds
 * JPEG bytes raw without re-encoding.
 *
 * PDF dimensions: 1 point = 1 pixel (72 dpi page box). The image is stored at
 * full resolution; PDF readers can zoom in without any quality loss.
 */

import type { OcrLineItem, TranslatedLine } from "../../../api/index.ts";
import { fitTextInPolygon } from "./polygonTextLayout.ts";
import { DEFAULT_POLYGON_BG_COLOR, PDF_EXPORT_PAGE_CONCURRENCY, polygonTextColor } from "../../../config.ts";

// ── SVG overlay generator ─────────────────────────────────────────────────────
// Mirrors SvgOverlay.tsx but produces a plain SVG string instead of React VDOM.

function escapeSvg(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildOverlaySvgString(
  lines: OcrLineItem[],
  translatedLines: TranslatedLine[],
  naturalW: number,
  naturalH: number,
  showBoxes: boolean,
  showTranslation: boolean,
  polygonBgColor: string,
): string {
  if (!showBoxes && !showTranslation) return "";

  const translationMap = new Map<number, string>();
  if (showTranslation) {
    for (const tl of translatedLines) {
      if (tl.translated.trim()) translationMap.set(tl.lineIndex, tl.translated);
    }
  }

  let defs = "";
  let body = "";

  for (const line of lines) {
    const polygon = line.polygon;
    if (!polygon || polygon.length < 3) continue;

    const pts = polygon.map((p) => `${p[0]},${p[1]}`).join(" ");
    const text = showTranslation ? translationMap.get(line.lineIndex) : undefined;
    const layout = text ? fitTextInPolygon(text, polygon, (line.orientation === "vertical" ? "vertical" : "horizontal")) : undefined;

    if (layout) {
      defs += `<clipPath id="clip-${line.lineIndex}"><polygon points="${pts}"/></clipPath>`;
    }

    if (showBoxes) {
      body += `<polygon points="${pts}" fill="rgba(255,152,0,0.25)" stroke="rgba(255,152,0,0.65)" stroke-width="1.5"/>`;
    }

    if (layout) {
      body += `<g clip-path="url(#clip-${line.lineIndex})">`;
      body += `<polygon points="${pts}" fill="${polygonBgColor}"/>`;

      if (layout.kind === "horizontal") {
        for (let i = 0; i < layout.lines.length; i++) {
          const y = layout.startY + i * layout.lineHeight;
          body += `<text x="${layout.cx}" y="${y}" text-anchor="middle" font-size="${layout.fontSize}" fill="${polygonTextColor(polygonBgColor)}" font-family="sans-serif">${escapeSvg(layout.lines[i])}</text>`;
        }
      } else {
        for (let ci = 0; ci < layout.columns.length; ci++) {
          const x = layout.startX - ci * layout.columnWidth;
          const chars = layout.columns[ci].split("");
          for (let ri = 0; ri < chars.length; ri++) {
            const y = layout.startY + ri * (layout.fontSize * 1.1);
            body += `<text x="${x}" y="${y}" text-anchor="middle" font-size="${layout.fontSize}" fill="${polygonTextColor(polygonBgColor)}" font-family="sans-serif">${escapeSvg(chars[ri])}</text>`;
          }
        }
      }

      body += "</g>";
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${naturalW} ${naturalH}" ` +
    `width="${naturalW}" height="${naturalH}">` +
    (defs ? `<defs>${defs}</defs>` : "") +
    body +
    "</svg>"
  );
}

// ── Per-page canvas renderer ──────────────────────────────────────────────────

async function renderPageToJpeg(
  imgUrl: string,
  lines: OcrLineItem[],
  translatedLines: TranslatedLine[],
  showBoxes: boolean,
  showTranslation: boolean,
  quality: number,
  polygonBgColor: string,
): Promise<{ jpeg: Blob; width: number; height: number }> {
  const imgResponse = await fetch(imgUrl);
  if (!imgResponse.ok) throw new Error(`Image fetch failed: ${imgResponse.status}`);
  const imgBlob = await imgResponse.blob();

  const bitmap = await createImageBitmap(imgBlob);
  const { width, height } = bitmap;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const svgStr = buildOverlaySvgString(lines, translatedLines, width, height, showBoxes, showTranslation, polygonBgColor);
  if (svgStr) {
    const svgUrl = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }));
    await new Promise<void>((resolve, reject) => {
      const img = new Image(width, height);
      img.onload = () => { ctx.drawImage(img, 0, 0); URL.revokeObjectURL(svgUrl); resolve(); };
      img.onerror = () => { URL.revokeObjectURL(svgUrl); reject(new Error("SVG overlay load failed")); };
      img.src = svgUrl;
    });
  }

  const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality });
  return { jpeg, width, height };
}

// ── Minimal PDF encoder ───────────────────────────────────────────────────────
// Object layout (3 objects per page):
//   1          = Catalog
//   2          = Pages tree
//   3 + i*3    = Image XObject for page i  (DCTDecode / raw JPEG)
//   4 + i*3    = Content stream for page i
//   5 + i*3    = Page dictionary for page i

async function buildPdf(pages: Array<{ jpeg: Blob; width: number; height: number }>): Promise<Blob> {
  const n = pages.length;
  const totalObjs = 2 + n * 3;
  const enc = new TextEncoder();
  const rawParts: Uint8Array[] = [];
  const objOffsets: number[] = new Array(totalObjs + 1).fill(0);
  let pos = 0;

  const write = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    rawParts.push(bytes);
    pos += bytes.byteLength;
  };
  const beginObj = (id: number) => { objOffsets[id] = pos; write(`${id} 0 obj\n`); };

  const jpegBuffers = await Promise.all(pages.map(async (p) => new Uint8Array(await p.jpeg.arrayBuffer())));

  write("%PDF-1.4\n%\xFF\xFF\xFF\n");

  // Catalog
  beginObj(1);
  write("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // Pages tree
  const pageKids = Array.from({ length: n }, (_, i) => 5 + i * 3);
  beginObj(2);
  write(`<< /Type /Pages /Kids [${pageKids.map((id) => `${id} 0 R`).join(" ")}] /Count ${n} >>\nendobj\n`);

  for (let i = 0; i < n; i++) {
    const { width, height } = pages[i];
    const jpegBytes = jpegBuffers[i];
    const imgId = 3 + i * 3;
    const contentId = 4 + i * 3;
    const pageId = 5 + i * 3;

    // Image XObject — JPEG bytes embedded raw via DCTDecode
    objOffsets[imgId] = pos;
    write(
      `${imgId} 0 obj\n` +
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.byteLength} >>\n` +
      `stream\n`,
    );
    write(jpegBytes);
    write("\nendstream\nendobj\n");

    // Content stream: scale image to fill the page
    const contentStr = `q ${width} 0 0 ${height} 0 0 cm /Im${i} Do Q\n`;
    const contentBytes = enc.encode(contentStr);
    objOffsets[contentId] = pos;
    write(
      `${contentId} 0 obj\n` +
      `<< /Length ${contentBytes.byteLength} >>\n` +
      `stream\n`,
    );
    write(contentBytes);
    write("\nendstream\nendobj\n");

    // Page dictionary
    objOffsets[pageId] = pos;
    write(
      `${pageId} 0 obj\n` +
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Resources << /XObject << /Im${i} ${imgId} 0 R >> >> ` +
      `/Contents ${contentId} 0 R >>\n` +
      `endobj\n`,
    );
  }

  // Cross-reference table
  const xrefOffset = pos;
  write(`xref\n0 ${totalObjs + 1}\n`);
  write("0000000000 65535 f \n");
  for (let id = 1; id <= totalObjs; id++) {
    write(`${String(objOffsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  write(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\n`);
  write(`startxref\n${xrefOffset}\n%%EOF\n`);

  const total = rawParts.reduce((s, p) => s + p.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of rawParts) { result.set(part, offset); offset += part.byteLength; }
  return new Blob([result], { type: "application/pdf" });
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ExportPdfOptions {
  pageCount: number;
  /** Returns the image URL for a page (0-based index). */
  getImageUrl: (pageIndex: number) => string;
  /** OCR lines per page (keyed by 1-based pageNumber). */
  ocrPageLines: Map<number, OcrLineItem[]>;
  /** Translation lines per page (keyed by 1-based pageNumber). */
  translationPageLines: Map<number, TranslatedLine[]>;
  showBoxes: boolean;
  showTranslation: boolean;
  polygonBgColor?: string;
  filename: string;
  jpegQuality?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function exportAllPagesAsPdf(opts: ExportPdfOptions): Promise<void> {
  const {
    pageCount, getImageUrl, ocrPageLines, translationPageLines,
    showBoxes, showTranslation, polygonBgColor = DEFAULT_POLYGON_BG_COLOR, filename, jpegQuality = 0.92, onProgress,
  } = opts;

  // Render pages with bounded concurrency to keep memory usage predictable
  // while still saturating network and GPU. Tune via PDF_EXPORT_PAGE_CONCURRENCY.
  const renderedPages: Array<{ jpeg: Blob; width: number; height: number }> = new Array(pageCount);
  let done = 0;

  for (let start = 0; start < pageCount; start += PDF_EXPORT_PAGE_CONCURRENCY) {
    const batch = Array.from(
      { length: Math.min(PDF_EXPORT_PAGE_CONCURRENCY, pageCount - start) },
      (_, j) => {
        const i = start + j;
        const pageNumber = i + 1;
        return renderPageToJpeg(
          getImageUrl(i),
          ocrPageLines.get(pageNumber) ?? [],
          translationPageLines.get(pageNumber) ?? [],
          showBoxes, showTranslation, jpegQuality, polygonBgColor,
        ).then((result) => {
          renderedPages[i] = result;
          onProgress?.(++done, pageCount);
        });
      },
    );
    await Promise.all(batch);
  }

  const pdfBlob = await buildPdf(renderedPages);
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
