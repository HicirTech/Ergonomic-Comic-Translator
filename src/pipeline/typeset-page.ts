import { boxHeight, boxWidth, expandBox } from "../geometry/box.ts";
import type { Box } from "../geometry/interfaces/index.ts";
import { rotatePoint } from "../geometry/rotated-rect.ts";
import { textThickness } from "../stages/lines/text-thickness.ts";
import { unifyEllipses } from "../typeset/ellipsis.ts";
import type { Shaper, TextLayout } from "../typeset/interfaces/index.ts";
import { layoutText } from "../typeset/layout.ts";
import { letteringStyle } from "../typeset/lettering-style.ts";
import { pageOverlaySvg, placedBlockSvg } from "../typeset/svg.ts";
import type { PageTranslationResult, PageVisionResult, RegionResult, UtteranceResult, VolumePageText } from "./interfaces/index.ts";

/** The lettering box is the text frame grown by this much, where the bubble and the page leave room. */
const frameGrowth = 1.15;
/** Lettering stays this far inside the bubble box, as a share of the bubble's shorter side, and inside the page. */
const bubbleInsetShare = 0.04;
const pageInsetPx = 6;
/**
 * Lettering also stays this share of its own type size away from the bubble's frame. Measured on one volume
 * the source text stands 0.76 of its type size from the frame at the median and 0.52 at the lower quartile;
 * lettering held only by the fixed inset stood a third of its size from the frame where it filled a box.
 * The margin is never asked to be more than this share of the bubble's shorter side: a shout set as large as
 * its box allows fills half of the box.
 */
const framePaddingShare = 0.75;
const framePaddingLimitShare = 0.25;
/** Tall boxes get vertical Chinese. */
const verticalAspect = 1.3;
/** Slanted text is re-typeset at its angle; below this it is set upright (as BallonsTranslator, MIT, koharu do). */
const uprightBelowDegrees = 3;
const minFontSize = 12;
/**
 * Font size of the text in a DB line rectangle, as a share of the rectangle's thickness, for text whose ink
 * was not measured. Measured on the synthetic pages (known font sizes): the rectangle is 1.38 times the font
 * size at the median, 1.30 for plain text of 40 px and more.
 */
const glyphShareOfLine = 0.74;
const fallbackFontSize = 20;
/** Text holds type when it has a letter or a digit; a long vowel mark or a wave dash is a stroke, like a row of dots. */
const typeCharacter = /[\p{L}\p{N}]/u;
const strokeCharacters = /[ーｰ〜～]/gu;
/** Shown where a translation failed every retry, so a cleaned bubble is never left empty. */
export const untranslatedPlaceholderZh = "（这句没能翻译）";

const overlap = (box: Box, limit: Box): Box =>
  ({ x0: Math.max(box.x0, limit.x0), y0: Math.max(box.y0, limit.y0), x1: Math.min(box.x1, limit.x1), y1: Math.min(box.y1, limit.y1) });
const holdsType = (box: Box) => boxWidth(box) >= minFontSize && boxHeight(box) >= minFontSize;
/** The part of an upright box inside the limit, or the box itself when hardly anything of it is inside. */
const clipTo = (box: Box, limit: Box): Box => (holdsType(overlap(box, limit)) ? overlap(box, limit) : box);

/**
 * The size of the type an utterance is set in: the height its ink stands across its lines, namely the
 * tallest height that half of the text, by length, reaches (a line of dots beside a line of type does not
 * halve it). Hanzi fill their em box and kana do not, so Chinese set at the height of the source's ink
 * reads as large as the source. The line rectangles say less: on two volumes the ink stands 0.72 and 0.60
 * of the rectangle's thickness at the median, and under half of it where the detector drew the rectangle
 * around more than the text, which set such lines twice too large. The rectangles are the measure where
 * the ink was not measured, and for text without type: the ink of a row of dots says nothing about the
 * size it was set in.
 */
const sourceTypeSize = (region: RegionResult, utterance: UtteranceResult) => {
  const thickness = utterance.lineThickness ?? textThickness(region.lines);
  const byRectangle = thickness === null ? fallbackFontSize : thickness * glyphShareOfLine;
  const { inkHeights } = region;
  if (!inkHeights || !typeCharacter.test(utterance.text.replace(strokeCharacters, ""))) return byRectangle;
  const indexes = utterance.lineIndexes.length > 0 ? utterance.lineIndexes : region.lines.map((_line, index) => index);
  const measured = indexes
    .flatMap((index) => {
      const height = inkHeights[index] ?? null;
      return height === null ? [] : [{ height, length: region.lines[index]!.rect.long }];
    })
    .sort((a, b) => b.height - a.height);
  const half = measured.reduce((sum, line) => sum + line.length, 0) / 2;
  let reached = 0;
  for (const line of measured) {
    reached += line.length;
    if (reached >= half) return line.height;
  }
  return byRectangle;
};

/**
 * S10 for one page: every translated utterance is laid out in its box (the region frame, or its own
 * slot when a bubble was split), rotated back to the original angle, in the ink of the text it replaces
 * and with that text's outline when it had one.
 * An upright box never leaves its bubble or the page, the lettering keeps a margin of its own size to the
 * bubble's frame, and it is set no larger than the text it replaces. Units without a translation get a
 * Chinese placeholder. Returns the overlay SVG and the ids that overflowed at the minimum size.
 */
export const typesetPage = (shaper: Shaper, vision: PageVisionResult, text: VolumePageText, translation: PageTranslationResult) => {
  const blocks: string[] = [];
  const overflow: string[] = [];
  for (const unit of text.units) {
    const ref = text.refs[unit.id];
    if (!ref) continue;
    const accepted = translation.targets[unit.id];
    const target = accepted === undefined ? untranslatedPlaceholderZh : unifyEllipses(accepted, unit.source);
    const region = vision.regions[ref.regionIndex]!;
    const utterance = region.utterances[ref.utteranceIndex]!;
    const { frame } = region.orientation;
    const translated = region.utterances.filter((other) => other.text.trim() !== "").length;
    const slot = translated > 1 ? utterance.box : null;
    const grownCenter = slot
      ? rotatePoint({ x: (slot.x0 + slot.x1) / 2, y: (slot.y0 + slot.y1) / 2 }, { x: frame.cx, y: frame.cy }, frame.angle)
      : { x: frame.cx, y: frame.cy };
    const grownWidth = (slot ? slot.x1 - slot.x0 : frame.w) * frameGrowth;
    const grownHeight = (slot ? slot.y1 - slot.y0 : frame.h) * frameGrowth;
    const angle = Math.abs(frame.angle) < uprightBelowDegrees ? 0 : frame.angle;
    let box: Box = { x0: grownCenter.x - grownWidth / 2, y0: grownCenter.y - grownHeight / 2, x1: grownCenter.x + grownWidth / 2, y1: grownCenter.y + grownHeight / 2 };
    // Inside the bubble's frame where the page shows one beside the text; the detector's box also holds the tail.
    const bubbleFrame = angle === 0 && region.bubble ? region.inside ?? region.bubble : null;
    if (angle === 0) {
      if (region.bubble && bubbleFrame) box = clipTo(box, expandBox(bubbleFrame, -bubbleInsetShare * Math.min(boxWidth(region.bubble), boxHeight(region.bubble))));
      box = clipTo(box, expandBox({ x0: 0, y0: 0, x1: vision.width, y1: vision.height }, -pageInsetPx));
    }
    const direction = boxHeight(box) > verticalAspect * boxWidth(box) ? "v" : "h";
    const paddingLimit = bubbleFrame ? framePaddingLimitShare * Math.min(boxWidth(bubbleFrame), boxHeight(bubbleFrame)) : 0;
    /** The room type of this size has, and the text laid out in it; null when it does not fit. */
    const setAt = (size: number): { room: Box; layout: TextLayout } | null => {
      const room = bubbleFrame ? overlap(box, expandBox(bubbleFrame, -Math.min(framePaddingShare * size, paddingLimit))) : box;
      if (!holdsType(room)) return null;
      const layout = layoutText(shaper, target, direction, boxWidth(room), boxHeight(room), size, size);
      return layout.overflow ? null : { room, layout };
    };
    // The largest size that fits the room it leaves itself, up to the size of the text it replaces.
    let low = minFontSize;
    let high = Math.floor(Math.max(minFontSize, sourceTypeSize(region, utterance)));
    let set: ReturnType<typeof setAt> = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const attempt = setAt(middle);
      if (attempt) {
        set = attempt;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (!set) overflow.push(unit.id);
    const { room, layout } = set ?? { room: box, layout: layoutText(shaper, target, direction, boxWidth(box), boxHeight(box), minFontSize, minFontSize) };
    const style = letteringStyle(region.ink ?? null, region.paper ?? null, region.outline ?? null);
    blocks.push(placedBlockSvg(shaper, layout, { cx: (room.x0 + room.x1) / 2, cy: (room.y0 + room.y1) / 2, width: boxWidth(room), height: boxHeight(room), angle }, style));
  }
  return { svg: pageOverlaySvg(vision.width, vision.height, blocks), overflow };
};
