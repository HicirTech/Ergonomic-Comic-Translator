import type { Shaper } from "../../src/typeset/interfaces/index.ts";
import { layoutText } from "../../src/typeset/layout.ts";
import { artOutlineWidthPx, hangingSlackChars, minFontSizePx } from "./constants.ts";

/**
 * Smallest box in which layoutText keeps the sentence on one line at exactly `fontSize`.
 * Art text grows by the outline width so the polygon covers the white stroke.
 */
export const fitLine = (shaper: Shaper, text: string, direction: "h" | "v", fontSize: number, outline: boolean) => {
  const limit = Math.max(minFontSizePx, fontSize * ([...text].length + hangingSlackChars + 1));
  let low = 1;
  let high = limit;
  let best: number | null = null;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const width = direction === "h" ? mid : fontSize;
    const height = direction === "h" ? fontSize : mid;
    const layout = layoutText(shaper, text, direction, width, height, fontSize, fontSize);
    if (layout.lines === 1 && !layout.overflow) {
      best = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  if (best === null) throw new Error(`Line does not fit at ${fontSize}px: ${text}`);
  const pad = outline ? artOutlineWidthPx(fontSize) : 0;
  return {
    text,
    width: (direction === "h" ? best : fontSize) + pad * 2,
    height: (direction === "h" ? fontSize : best) + pad * 2,
  };
};
