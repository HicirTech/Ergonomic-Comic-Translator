import { readFileSync } from "fs";
import sharp from "sharp";
import { writeFileAtomically } from "../core/atomic-write.ts";
import { buildCbz } from "./cbz.ts";
import { buildPdf } from "./pdf.ts";

/** Lettering stays crisp with full-resolution chroma; quality 90 keeps a volume PDF at a few MB per page at most. */
const pdfJpeg = { quality: 90, chromaSubsampling: "4:4:4" } as const;

/** S11 exports: a CBZ of the rendered PNG pages and a PDF of the same pages as JPEG, in reading order. */
export const exportVolume = async (title: string, pagePaths: readonly string[], manga: boolean, cbzPath: string, pdfPath: string) => {
  const pages = pagePaths.map((path) => new Uint8Array(readFileSync(path)));
  writeFileAtomically(cbzPath, buildCbz(title, pages.map((data) => ({ extension: ".png", data })), manga));
  const pdfPages = await Promise.all(pages.map(async (page) => {
    const { data, info } = await sharp(page).jpeg(pdfJpeg).toBuffer({ resolveWithObject: true });
    return { jpeg: new Uint8Array(data), width: info.width, height: info.height };
  }));
  writeFileAtomically(pdfPath, await buildPdf(title, pdfPages, manga));
};
