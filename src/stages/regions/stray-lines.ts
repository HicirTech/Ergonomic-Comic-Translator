import type { TextLine } from "../lines/interfaces/index.ts";

/** A line of the other tone is stray when it is shorter than this share of the region's longest line. */
const strayLengthShare = 0.25;

/**
 * The lines of a region that are its text, and the stray lines among them: short lines set light where the
 * region's text is dark, or dark where it is light. A dialogue is set in one ink; a short line of the other
 * tone in its box is a piece of art lettering that crosses the box, a highlight or an ornament. Kept as
 * text it is erased, and with it every blob of its tone around it, as its marks: on one page that took the
 * white strokes of lettering drawn across a dialogue box. `toneOf(line, paper)` tells whether a line is set
 * dark on light and on which paper tone; with `paper` given it judges the line against that paper, null
 * when it cannot be measured. Two lines of similar length in opposite tones both stay: a region can hold a
 * dark and a light caption.
 */
export const splitStrayLines = (
  lines: readonly TextLine[],
  toneOf: (line: TextLine, paper: number | null) => { dark: boolean; paper: number } | null,
) => {
  const longest = lines.reduce<TextLine | null>((best, line) => (best === null || line.rect.long > best.rect.long ? line : best), null);
  const tone = longest === null || lines.length < 2 ? null : toneOf(longest, null);
  if (longest === null || tone === null) return { text: [...lines], stray: [] };
  const stray = lines.filter((line) => line.rect.long < strayLengthShare * longest.rect.long && toneOf(line, tone.paper)?.dark === !tone.dark);
  return { text: lines.filter((line) => !stray.includes(line)), stray };
};
