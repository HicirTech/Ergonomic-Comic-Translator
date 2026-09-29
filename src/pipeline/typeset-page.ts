import { rotatePoint } from "../geometry/rotated-rect.ts";
import type { Shaper } from "../typeset/interfaces/index.ts";
import { layoutText } from "../typeset/layout.ts";
import { pageOverlaySvg, placedBlockSvg } from "../typeset/svg.ts";
import type { PageTranslationResult, PageVisionResult, VolumePageText } from "./interfaces/index.ts";

/** Chinese text is usually a little longer than the lines it replaces; the frame grows by this much. */
const frameGrowth = 1.15;
/** Tall boxes get vertical Chinese. */
const verticalAspect = 1.3;
/** Slanted text is re-typeset at its angle; below this it is set upright (as BallonsTranslator, MIT, koharu do). */
const uprightBelowDegrees = 3;
const minFontSize = 12;
const maxFontSize = 72;
/** Unclipped DB rectangles are about this much thicker than the glyphs they hold. */
const glyphShareOfLine = 0.9;
const fallbackFontSize = 20;
/** Shown where a translation failed every retry, so a cleaned bubble is never left empty. */
export const untranslatedPlaceholderZh = "（这句没能翻译）";

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[sorted.length >> 1]! : null;
};

/**
 * S10 for one page: every translated utterance is laid out in its box (the region frame, or its own
 * slot when a bubble was split), rotated back to the original angle, outlined when it sits on art.
 * Units without a translation get a Chinese placeholder. Returns the overlay SVG and the ids that
 * overflowed at the minimum size.
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
    const center = slot
      ? rotatePoint({ x: (slot.x0 + slot.x1) / 2, y: (slot.y0 + slot.y1) / 2 }, { x: frame.cx, y: frame.cy }, frame.angle)
      : { x: frame.cx, y: frame.cy };
    const width = (slot ? slot.x1 - slot.x0 : frame.w) * frameGrowth;
    const height = (slot ? slot.y1 - slot.y0 : frame.h) * frameGrowth;
    const direction = height > verticalAspect * width ? "v" : "h";
    const sourceSize = median(region.lines.map((line) => line.rect.short * glyphShareOfLine)) ?? fallbackFontSize;
    const layout = layoutText(shaper, target, direction, width, height, minFontSize, Math.min(maxFontSize, Math.max(minFontSize, sourceSize * 1.1)));
    if (layout.overflow) overflow.push(unit.id);
    const angle = Math.abs(frame.angle) < uprightBelowDegrees ? 0 : frame.angle;
    blocks.push(placedBlockSvg(shaper, layout, { cx: center.x, cy: center.y, width, height, angle }, region.bubble === null));
  }
  return { svg: pageOverlaySvg(vision.width, vision.height, blocks), overflow };
};
