import type { LetteringStyle } from "./interfaces/index.ts";

type Rgb = readonly [number, number, number];

const darkInk: Rgb = [17, 17, 17];
const lightInk: Rgb = [255, 255, 255];
/** Relative luminance at which white text and black text contrast equally with the paper (WCAG contrast ratio). */
const equalContrastLuminance = 0.179;
/**
 * Ink closer than this to the paper on every channel is a measuring error, and the measured colour is not
 * used. Kept low on purpose: black text on a night-scene box only 22 levels brighter is the author's choice.
 */
const minInkDistance = 12;

const linear = (channel: number) => {
  const share = channel / 255;
  return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of an sRGB colour, 0 (black) to 1 (white). */
export const relativeLuminance = ([red, green, blue]: Rgb) =>
  0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);

const hex = (colour: Rgb) => `#${colour.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;

/**
 * Colours of a lettered block: the ink of the text it replaces and that text's outline, when it had one, so
 * the page keeps the look its author gave it. Without a measured ink, or with one that cannot be told from
 * the paper, the ink is the one of dark and light that contrasts more with the paper; unknown paper gets
 * dark ink.
 */
export const letteringStyle = (ink: Rgb | null, paper: Rgb | null, outline: Rgb | null): LetteringStyle => {
  const readable = ink !== null && (paper === null || ink.some((channel, index) => Math.abs(channel - paper[index]!) >= minInkDistance));
  const fill = readable ? ink : paper !== null && relativeLuminance(paper) < equalContrastLuminance ? lightInk : darkInk;
  return { fill: hex(fill), outline: outline === null ? null : hex(outline) };
};
