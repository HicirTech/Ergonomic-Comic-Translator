import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

/**
 * Renders the text overlay with resvg (glyphs are already paths, so no system fonts are loaded) and
 * composites it onto the cleaned page. Rendering the same SVG twice gives identical bytes.
 */
export const composePage = async (cleanedPath: string, overlaySvg: string, outputPath: string) => {
  const overlay = new Resvg(overlaySvg, { fitTo: { mode: "original" }, font: { loadSystemFonts: false } }).render().asPng();
  await sharp(cleanedPath).composite([{ input: overlay }]).png().toFile(outputPath);
};
