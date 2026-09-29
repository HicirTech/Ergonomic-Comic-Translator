import { zipSync } from "fflate";

const escapeXml = (text: string) =>
  text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");

/** Minimal ComicInfo.xml (the de-facto CBZ metadata) for a translated volume. */
export const comicInfoXml = (title: string, pageCount: number, manga: boolean) =>
  [
    "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
    "<ComicInfo xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\">",
    `  <Title>${escapeXml(title)}</Title>`,
    `  <PageCount>${pageCount}</PageCount>`,
    "  <LanguageISO>zh</LanguageISO>",
    `  <Manga>${manga ? "YesAndRightToLeft" : "No"}</Manga>`,
    "</ComicInfo>",
    "",
  ].join("\n");

/**
 * Packs rendered pages into a CBZ: zero-padded names keep reader order, images are stored without
 * recompression (they are already compressed), and ComicInfo.xml comes first.
 */
export const buildCbz = (title: string, pages: readonly { extension: string; data: Uint8Array }[], manga: boolean) => {
  const digits = Math.max(3, String(pages.length).length);
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {
    "ComicInfo.xml": [new TextEncoder().encode(comicInfoXml(title, pages.length, manga)), { level: 0 }],
  };
  pages.forEach((page, index) => {
    entries[`${String(index + 1).padStart(digits, "0")}${page.extension}`] = [page.data, { level: 0 }];
  });
  return zipSync(entries);
};
