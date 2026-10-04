import type { Shaper } from "./interfaces/index.ts";

const allOf = (marks: string, standIn: string) => [...marks].map((mark): [string, string] => [mark, standIn]);

/**
 * Marks of comic dialogue that a text font lacks, and the mark of the same meaning it has. Checked against
 * the pinned lettering font (Noto Sans SC Bold): it has every stand-in and none of the marks they stand for.
 */
const standIns = new Map<string, string>([
  ...allOf("❤❥❣💓💔💕💖💗💘💙💚💛💜💝💞💟🖤🤍🤎🧡", "♥"),
  ...allOf("✦✪⭐🌟", "★"),
  ...allOf("✧✩✨", "☆"),
  ...allOf("✔", "✓"),
  ...allOf("✕✖✗✘", "×"),
]);
/** Variation selectors and joiners shape nothing by themselves; left after a replaced mark they leave a gap. */
const selectors = /[︀-️‍]/gu;

const known = new WeakMap<Shaper, Map<string, boolean>>();

const hasGlyph = (shaper: Shaper, char: string) => {
  const cache = known.get(shaper) ?? new Map<string, boolean>();
  known.set(shaper, cache);
  let has = cache.get(char);
  if (has === undefined) {
    const glyphs = shaper.shape(char, "h");
    has = glyphs.length > 0 && glyphs.every((glyph) => glyph.id !== 0);
    cache.set(char, has);
  }
  return has;
};

/**
 * The text as the font can letter it: a character it has no glyph for would be drawn as an empty box, so
 * it gives way to its stand-in, or is left out when it has none the font holds. White space is the
 * layout's to deal with.
 */
export const letterable = (shaper: Shaper, text: string) =>
  [...text.replace(selectors, "")]
    .map((char) => {
      if (/\s/u.test(char) || hasGlyph(shaper, char)) return char;
      const standIn = standIns.get(char);
      return standIn !== undefined && hasGlyph(shaper, standIn) ? standIn : "";
    })
    .join("");
