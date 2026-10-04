import { boxCenter, boxWidth } from "../../geometry/box.ts";
import { lineAngleDistance } from "../../geometry/angle.ts";
import type { LetteringCues, PageRegion, RegionClass, RegionOrientation } from "./interfaces/index.ts";

/** Bottom narration bars span most of the page width and sit in its lower part (spike-multispeaker rule). */
const bottomBoxWidthShare = 0.6;
const bottomBoxCenterShare = 0.6;
/** SFX lettering is at least this many times taller than the page's dialogue text. */
const sfxSizeFactor = 2;
const sfxTilt = 20;
const sfxAngleSpread = 15;
const sfxMaxChars = 6;
/** Two independent cues are needed: slanted dialogue exists, so tilt alone never makes an SFX. */
const sfxMinCues = 2;
/**
 * Below this mean probability the reader is not sure of a text. Measured on two volumes: dialogue set large
 * in a box of its own reads at 0.81 and above, lettering drawn in a "bubble" of its own at 0.79 and below.
 */
export const unsureReadingBelow = 0.8;

/** A short text that repeats a character or ends in a sound mark reads like a sound effect. */
export const soundLike = (text: string) => {
  const chars = [...text.replace(/\s/gu, "")];
  if (chars.length === 0 || chars.length > sfxMaxChars) return false;
  const repeated = new Set(chars).size < chars.length;
  return repeated || /[ッっーｰ〜～!！]$/u.test(text.trim());
};

/**
 * S3c-2 rule classifier. `dialogueThickness` is the median line thickness of bubble text on the page
 * (null when the page has none); `text` is the region's best OCR so far (may be empty); `lettering` is how
 * the text is drawn, when its ink could be measured.
 *
 * Art lettering is kept, also inside a bubble: there it is what is not set in the ink of the bubble's
 * dialogue and is drawn rather than typeset (outlined, slanted or curved, or a sound). Lettering that
 * stands alone in what the detector took for a bubble is art when it is coloured and outlined, or coloured
 * or outlined and the reader is not sure of it; dialogue set large in a box of its own is black or white,
 * has no outline and reads well. Outside bubbles a coloured ink is one more cue, and a coloured ink with an
 * outline two. Measured on two volumes: this keeps the pieces of art lettering an earlier translation had
 * left alone, and none of the dialogue set in white in a bubble of its own, nor the captions set in black
 * with a white outline.
 */
export const classifyRegion = (
  region: PageRegion,
  orientation: RegionOrientation,
  text: string,
  pageWidth: number,
  pageHeight: number,
  dialogueThickness: number | null,
  lettering: LetteringCues | null = null,
): RegionClass => {
  const thought = /^[（(][\s\S]*[）)]$/u.test(text.trim());
  const angles = region.lines.map((line) => line.rect.angle);
  const spread = angles.length > 1 ? Math.max(...angles.map((angle) => lineAngleDistance(angle, angles[0]!))) : 0;
  const drawn = Math.abs(orientation.tilt) > sfxTilt || spread > sfxAngleSpread || region.lines.some((line) => line.curved);
  if (region.bubble) {
    const acrossDialogue = lettering !== null && lettering.otherInkThanBubble && (lettering.outlined || drawn || soundLike(text));
    const onItsOwn = lettering !== null && lettering.aloneInBubble
      && ((lettering.coloured && lettering.outlined) || ((lettering.coloured || lettering.outlined) && lettering.readUnsure));
    return acrossDialogue || onItsOwn
      ? { layout: "bubble", kind: "sfx", policy: "keep" }
      : { layout: "bubble", kind: thought ? "thought" : "dialogue", policy: "translate" };
  }
  const center = boxCenter(region.box);
  if (boxWidth(region.box) >= bottomBoxWidthShare * pageWidth && center.y >= bottomBoxCenterShare * pageHeight) {
    return { layout: "bottom_box", kind: thought ? "thought" : "dialogue", policy: "translate" };
  }

  const thickness = region.lines.length > 0 ? Math.max(...region.lines.map((line) => line.rect.short)) : 0;
  // An outline alone is no cue: captions on artwork are typeset in black or white with one.
  const cues = [
    dialogueThickness !== null && thickness >= sfxSizeFactor * dialogueThickness,
    drawn,
    soundLike(text),
    lettering?.coloured,
    lettering?.coloured && lettering.outlined,
  ].filter(Boolean).length;
  return cues >= sfxMinCues
    ? { layout: "text_free", kind: "sfx", policy: "keep" }
    : { layout: "text_free", kind: thought ? "thought" : "free_text", policy: "translate" };
};
