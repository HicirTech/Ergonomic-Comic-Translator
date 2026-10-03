import { boxCenter, boxWidth } from "../../geometry/box.ts";
import { lineAngleDistance } from "../../geometry/angle.ts";
import type { PageRegion, RegionClass, RegionOrientation } from "./interfaces/index.ts";

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

/** A short text that repeats a character or ends in a sound mark reads like a sound effect. */
export const soundLike = (text: string) => {
  const chars = [...text.replace(/\s/gu, "")];
  if (chars.length === 0 || chars.length > sfxMaxChars) return false;
  const repeated = new Set(chars).size < chars.length;
  return repeated || /[ッっーｰ〜～!！]$/u.test(text.trim());
};

/**
 * S3c-2 rule classifier. `dialogueThickness` is the median line thickness of bubble text on the page
 * (null when the page has none); `text` is the region's best OCR so far (may be empty).
 */
export const classifyRegion = (
  region: PageRegion,
  orientation: RegionOrientation,
  text: string,
  pageWidth: number,
  pageHeight: number,
  dialogueThickness: number | null,
): RegionClass => {
  const thought = /^[（(][\s\S]*[）)]$/u.test(text.trim());
  if (region.bubble) {
    return { layout: "bubble", kind: thought ? "thought" : "dialogue", policy: "translate" };
  }
  const center = boxCenter(region.box);
  if (boxWidth(region.box) >= bottomBoxWidthShare * pageWidth && center.y >= bottomBoxCenterShare * pageHeight) {
    return { layout: "bottom_box", kind: thought ? "thought" : "dialogue", policy: "translate" };
  }

  const thickness = region.lines.length > 0 ? Math.max(...region.lines.map((line) => line.rect.short)) : 0;
  const angles = region.lines.map((line) => line.rect.angle);
  const spread = angles.length > 1 ? Math.max(...angles.map((angle) => lineAngleDistance(angle, angles[0]!))) : 0;
  const cues = [
    dialogueThickness !== null && thickness >= sfxSizeFactor * dialogueThickness,
    Math.abs(orientation.tilt) > sfxTilt || spread > sfxAngleSpread || region.lines.some((line) => line.curved),
    soundLike(text),
  ].filter(Boolean).length;
  return cues >= sfxMinCues
    ? { layout: "text_free", kind: "sfx", policy: "keep" }
    : { layout: "text_free", kind: thought ? "thought" : "free_text", policy: "translate" };
};
