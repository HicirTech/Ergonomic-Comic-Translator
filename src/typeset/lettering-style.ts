import type { LetteringStyle } from "./interfaces/index.ts";

const darkInk = "#111111";
const lightInk = "#ffffff";
/** Relative luminance at which white text and black text contrast equally with the paper (WCAG contrast ratio). */
const equalContrastLuminance = 0.179;

const linear = (channel: number) => {
  const share = channel / 255;
  return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of an sRGB colour, 0 (black) to 1 (white). */
export const relativeLuminance = ([red, green, blue]: readonly [number, number, number]) =>
  0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);

/**
 * Ink for lettering on `paper` (the tone around the text that was removed): the one of dark and light that
 * contrasts more, so a dark dialogue box gets light text as it had before. Unknown paper gets dark ink.
 * `outlined` adds a stroke in the other tone, for text that sits on art rather than on plain paper.
 */
export const letteringStyle = (paper: readonly [number, number, number] | null, outlined: boolean): LetteringStyle => {
  const light = paper !== null && relativeLuminance(paper) < equalContrastLuminance;
  return { fill: light ? lightInk : darkInk, outline: outlined ? (light ? darkInk : lightInk) : null };
};
