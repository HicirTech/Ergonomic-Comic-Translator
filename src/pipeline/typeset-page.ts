import { boxHeight, boxWidth, expandBox } from "../geometry/box.ts";
import type { Box } from "../geometry/interfaces/index.ts";
import { rotatePoint } from "../geometry/rotated-rect.ts";
import { textThickness } from "../stages/lines/text-thickness.ts";
import type { Shaper } from "../typeset/interfaces/index.ts";
import { layoutText } from "../typeset/layout.ts";
import { letteringStyle } from "../typeset/lettering-style.ts";
import { pageOverlaySvg, placedBlockSvg } from "../typeset/svg.ts";
import type { PageTranslationResult, PageVisionResult, VolumePageText } from "./interfaces/index.ts";

/** The lettering box is the text frame grown by this much, where the bubble and the page leave room. */
const frameGrowth = 1.15;
/** Lettering stays this far inside the bubble box, as a share of the bubble's shorter side, and inside the page. */
const bubbleInsetShare = 0.04;
const pageInsetPx = 6;
/** Tall boxes get vertical Chinese. */
const verticalAspect = 1.3;
/** Slanted text is re-typeset at its angle; below this it is set upright (as BallonsTranslator, MIT, koharu do). */
const uprightBelowDegrees = 3;
const minFontSize = 12;
/**
 * Font size of the text in a DB line rectangle, as a share of the rectangle's thickness. Measured on the
 * synthetic pages (known font sizes): the rectangle is 1.38 times the font size at the median, 1.30 for
 * plain text of 40 px and more.
 */
const glyphShareOfLine = 0.74;
/**
 * A translation that needs less room than its source may be set this much larger than the source text.
 * Without the headroom short translations came out smaller than the v1 lettering of the same bubbles.
 */
const sourceSizeHeadroom = 1.1;
const fallbackFontSize = 20;
/** Shown where a translation failed every retry, so a cleaned bubble is never left empty. */
export const untranslatedPlaceholderZh = "（这句没能翻译）";

/** The part of an upright box inside the limit, or the box itself when hardly anything of it is inside. */
const clipTo = (box: Box, limit: Box): Box => {
  const clipped = { x0: Math.max(box.x0, limit.x0), y0: Math.max(box.y0, limit.y0), x1: Math.min(box.x1, limit.x1), y1: Math.min(box.y1, limit.y1) };
  return boxWidth(clipped) >= minFontSize && boxHeight(clipped) >= minFontSize ? clipped : box;
};

/**
 * S10 for one page: every translated utterance is laid out in its box (the region frame, or its own
 * slot when a bubble was split), rotated back to the original angle, in the ink of the text it replaces
 * and with that text's outline when it had one.
 * An upright box never leaves its bubble or the page, and the text is set at most a little larger than
 * the text it replaces. Units without a translation get a Chinese placeholder. Returns the overlay SVG
 * and the ids that overflowed at the minimum size.
 */
export const typesetPage = (shaper: Shaper, vision: PageVisionResult, text: VolumePageText, translation: PageTranslationResult) => {
  const blocks: string[] = [];
  const overflow: string[] = [];
  for (const unit of text.units) {
    const ref = text.refs[unit.id];
    if (!ref) continue;
    const target = translation.targets[unit.id] ?? untranslatedPlaceholderZh;
    const region = vision.regions[ref.regionIndex]!;
    const { frame } = region.orientation;
    const translated = region.utterances.filter((utterance) => utterance.text.trim() !== "").length;
    const slot = translated > 1 ? region.utterances[ref.utteranceIndex]!.box : null;
    const grownCenter = slot
      ? rotatePoint({ x: (slot.x0 + slot.x1) / 2, y: (slot.y0 + slot.y1) / 2 }, { x: frame.cx, y: frame.cy }, frame.angle)
      : { x: frame.cx, y: frame.cy };
    const grownWidth = (slot ? slot.x1 - slot.x0 : frame.w) * frameGrowth;
    const grownHeight = (slot ? slot.y1 - slot.y0 : frame.h) * frameGrowth;
    const angle = Math.abs(frame.angle) < uprightBelowDegrees ? 0 : frame.angle;
    let box: Box = { x0: grownCenter.x - grownWidth / 2, y0: grownCenter.y - grownHeight / 2, x1: grownCenter.x + grownWidth / 2, y1: grownCenter.y + grownHeight / 2 };
    if (angle === 0) {
      if (region.bubble) box = clipTo(box, expandBox(region.bubble, -bubbleInsetShare * Math.min(boxWidth(region.bubble), boxHeight(region.bubble))));
      box = clipTo(box, expandBox({ x0: 0, y0: 0, x1: vision.width, y1: vision.height }, -pageInsetPx));
    }
    const width = boxWidth(box);
    const height = boxHeight(box);
    const direction = height > verticalAspect * width ? "v" : "h";
    // An utterance set larger or smaller than the rest of its bubble keeps its own size.
    const lineThickness = region.utterances[ref.utteranceIndex]!.lineThickness ?? textThickness(region.lines);
    const sourceSize = lineThickness === null ? fallbackFontSize : lineThickness * glyphShareOfLine;
    const layout = layoutText(shaper, target, direction, width, height, minFontSize, Math.max(minFontSize, sourceSize * sourceSizeHeadroom));
    if (layout.overflow) overflow.push(unit.id);
    const style = letteringStyle(region.ink ?? null, region.paper ?? null, region.outline ?? null);
    blocks.push(placedBlockSvg(shaper, layout, { cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2, width, height, angle }, style));
  }
  return { svg: pageOverlaySvg(vision.width, vision.height, blocks), overflow };
};
