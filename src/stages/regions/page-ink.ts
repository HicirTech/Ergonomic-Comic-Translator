import { sameInk } from "../mask/ink.ts";
import type { Rgb } from "../mask/ink.ts";
import { unsureReadingBelow } from "./classify.ts";

/** A region whose text is typeset by its own evidence holds at least this many letters, read with confidence. */
const typesetMinLetters = 8;

/** What a region tells about the inks a page sets its text in: its ink and how its text reads. */
export interface InkEvidence {
  ink: Rgb | null;
  letters: number;
  meanProb: number;
}

/**
 * The inks a page's typeset text is set in: the inks of the regions that are typeset text by their own
 * evidence (letters enough, read with confidence), one of each. A book may set its dialogue in a colour,
 * or its captions in another; against these inks a region's colour is a cue for lettering only when it is
 * none of them.
 */
export const pageTypesetInks = (regions: readonly InkEvidence[]): Rgb[] => {
  const inks: Rgb[] = [];
  for (const region of regions) {
    if (region.ink === null || region.letters < typesetMinLetters || region.meanProb < unsureReadingBelow) continue;
    if (!inks.some((ink) => sameInk(ink, region.ink!))) inks.push(region.ink);
  }
  return inks;
};
