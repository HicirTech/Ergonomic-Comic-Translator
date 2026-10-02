import type { LayoutKind } from "./interfaces/index.ts";

/** Comic page the detector and the inpainter both see at full resolution. */
export const pageWidthPx = 1280;
export const pageHeightPx = 1810;
export const pageMarginPx = 32;

export const minFontSizePx = 18;
export const maxFontSizePx = 48;

/** Slanted blocks only. Upright blocks stay at 0 so column order is measurable on x. */
export const minSlantDeg = 10;
export const maxSlantDeg = 35;

/**
 * Centre distance between stacked lines, in em. Matches the private pitch in layout.ts so a stack
 * occupies the same band as one layoutText block.
 */
export const stackedLinePitch = 1.25;

/** breakLines may hang two marks; the fit search allows that many extra em plus one. */
export const hangingSlackChars = 2;

/**
 * Pixel width of the white stroke placedBlockSvg paints under art text
 * (`max(2, fontSize * 0.12)`, already converted out of font units).
 */
export const artOutlineWidthPx = (fontSize: number) => Math.max(2, fontSize * 0.12);

/**
 * lineCrop asks for quarter turn 0 after readingCorners has put the long side on the width axis.
 * The four-rotation probe compares that choice with turns 0..3 of the same crop.
 */
export const lineRecognizerQuarterTurns = 0;

export const kindDirection: Readonly<Record<LayoutKind, "h" | "v">> = {
  "h-line": "h",
  "h-block": "h",
  "v-column": "v",
  "v-block": "v",
  "art-h": "h",
  "art-v": "v",
  "slant-h": "h",
  "slant-v": "v",
};

export const outlinedKinds: ReadonlySet<LayoutKind> = new Set(["art-h", "art-v"]);

/** Roles cycle in this order so a short run still pairs the same sentence horizontally and vertically. */
export const pageRoles = ["h-line", "v-column", "h-block", "v-block", "art-h", "art-v", "slant-h", "slant-v", "mixed"] as const;

type PageRole = (typeof pageRoles)[number];

export const multiLineRoles: ReadonlySet<PageRole | LayoutKind> = new Set(["h-block", "v-block", "slant-h", "slant-v"]);

export const bubbleRoles: ReadonlySet<PageRole | LayoutKind> = new Set(["h-line", "h-block", "v-column", "v-block"]);

/** Bubble and dark-panel padding around a block's axis-aligned bounds. */
export const bubblePadPx = 28;
export const bubbleStrokePx = 3;
export const panelPadPx = 24;

/** Bands closer than this share a row and are read right to left. */
export const readingBandPx = 80;

export const paperRgb = [244, 241, 232] as const;
export const darkRgb = [32, 34, 38] as const;
export const textureRgb = [206, 200, 188] as const;
export const bubbleFillRgb = [252, 252, 252] as const;
export const bubbleStrokeRgb = [20, 20, 20] as const;

/** Keeps each page's noise stream off the next page's seed. */
export const noisePageStride = 17;

/** High-frequency noise amplitude, and the blotch amplitude added on textured pages. */
export const paperNoiseAmp = 8;
export const darkNoiseAmp = 12;
export const textureNoiseAmp = 26;
export const textureBlotchAmp = 22;
