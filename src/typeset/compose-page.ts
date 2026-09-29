import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

/**
 * Renders the text overlay with resvg (glyphs are already paths, so no system fonts are loaded) and
 * composites it onto the cleaned page; returns the PNG. The same SVG always gives the same bytes.
 */
export const composePage = async (cleanedPath: string, overlaySvg: string) => {
  const overlay = new Resvg(overlaySvg, { fitTo: { mode: "original" }, font: { loadSystemFonts: false } }).render().asPng();
  return new Uint8Array(await sharp(cleanedPath).composite([{ input: overlay }]).png().toBuffer());
};
