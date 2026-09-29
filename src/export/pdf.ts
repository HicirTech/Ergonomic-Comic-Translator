import { PDFDocument, ReadingDirection } from "pdf-lib";

/**
 * Builds a PDF with one JPEG page per image at its pixel size (1 px = 1 pt; readers scale to fit).
 * JPEG data is embedded as is, so building is fast and lossless with respect to the input. No dates or
 * producer are written, so the same pages always give the same bytes. Manga opens right to left.
 */
export const buildPdf = async (title: string, pages: readonly { jpeg: Uint8Array; width: number; height: number }[], manga: boolean) => {
  const document = await PDFDocument.create({ updateMetadata: false });
  document.setTitle(title, { showInWindowTitleBar: true });
  document.setLanguage("zh-Hans");
  if (manga) {
    document.catalog.getOrCreateViewerPreferences().setReadingDirection(ReadingDirection.R2L);
  }
  for (const page of pages) {
    const image = await document.embedJpg(page.jpeg);
    document.addPage([page.width, page.height]).drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
  }
  return document.save();
};
