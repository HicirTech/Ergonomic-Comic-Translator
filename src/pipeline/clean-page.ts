import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { rgbToGray } from "../imaging/gray.ts";
import { dilateSquare } from "../imaging/morphology.ts";
import { decodeRgb } from "../imaging/page-image.ts";
import { bubbleInside } from "../stages/clean/bubble-inside.ts";
import { planInpaintTiles } from "../stages/clean/inpaint-tiles.ts";
import { membraneFill } from "../stages/clean/membrane-fill.ts";
import { pictureShare } from "../stages/clean/picture-share.ts";
import { isColoured, sameInk } from "../stages/mask/ink.ts";
import type { RegionMask } from "../stages/mask/interfaces/index.ts";
import { addToPageMask, regionTextMask } from "../stages/mask/text-mask.ts";
import { classifyRegion } from "../stages/regions/classify.ts";
import type { LetteringCues } from "../stages/regions/interfaces/index.ts";
import type { OrientedRegion, RegionResult, StageTimer, UtteranceResult, VisionClient } from "./interfaces/index.ts";

/**
 * The model reads the rim of its holes, and the last trace of ink there darkens what it paints: its mask is
 * the stroke mask grown by this much. Measured on dialogue panels whose clean picture is known: the fill
 * error falls from 7.1 to 3.3 levels with one pixel and rises again with two.
 */
const modelMaskGrowPixels = 1;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[sorted.length >> 1]! : null;
};

/** True when the picture shows at one of the region's stroke pixels. */
const meetsPicture = (share: Float32Array, pageWidth: number, region: RegionMask) => {
  const width = region.window.x1 - region.window.x0;
  return region.stroke.some((value, index) => value === 1 && share[(region.window.y0 + Math.floor(index / width)) * pageWidth + region.window.x0 + (index % width)]! > 0);
};

/**
 * S5/S6 for one page: build the stroke mask of every region, classify the regions (how a text is drawn is
 * one of the cues), then restore the paper under the text that is translated, and find the inside of each
 * bubble around its text for the lettering. SFX and art lettering are kept. The strokes are filled twice
 * from the page as it is, by the membrane fill in this process and, where the picture meets them, by the
 * inpainting engine; each pixel takes the engine's fill by the share of the picture around it. The engine
 * sees every stroke as a hole: on a page where some are already filled smoothly it continues the smoothness
 * instead of the picture (measured: 19 against 16 levels of error on the picture's edges, 31 against 22 on
 * a second volume). Writes `<pageKey>.filled.png`, or, when the engine ran, `<pageKey>.mask.bin`,
 * `<pageKey>.model.png` and `<pageKey>.clean.png` into `workDirectory`.
 */
export const cleanPage = async (
  client: VisionClient,
  imagePath: string,
  pageKey: string,
  workDirectory: string,
  oriented: readonly OrientedRegion[],
  utterancesOf: (regionIndex: number) => UtteranceResult[],
  timed: StageTimer,
) => {
  const rgb = await timed("decode", () => decodeRgb(imagePath));
  const { width, height } = rgb;
  const gray = rgbToGray(rgb);
  const dialogueThickness = median(oriented.filter(({ region }) => region.bubble).flatMap(({ region }) => region.lines.map((line) => line.rect.short)));

  const { regions, strokes, share } = await timed("mask_fill", async () => {
    const masks = oriented.map(({ region }) => regionTextMask(rgb, gray, region.lines, region.bubble));
    const textLength = oriented.map(({ region }) => region.lines.reduce((sum, line) => sum + line.rect.long, 0));
    // The dialogue of a bubble is the region in it with the most text.
    const cuesOf = (regionIndex: number): LetteringCues | null => {
      const mask = masks[regionIndex];
      if (!mask) return null;
      const { bubble } = oriented[regionIndex]!.region;
      const dialogue = oriented.reduce<number | null>((best, other, index) => {
        const longer = index !== regionIndex && bubble !== null && other.region.bubble === bubble && masks[index] && textLength[index]! > textLength[regionIndex]!;
        return longer && (best === null || textLength[index]! > textLength[best]!) ? index : best;
      }, null);
      return {
        coloured: isColoured(mask.inkMedian) || (mask.outlineMedian !== null && isColoured(mask.outlineMedian)),
        outlined: mask.outlineMedian !== null,
        otherInkThanBubble: dialogue !== null && !sameInk(mask.inkMedian, masks[dialogue]!.inkMedian),
      };
    };
    const classifications = oriented.map(({ region, orientation }, regionIndex) =>
      classifyRegion(region, orientation, utterancesOf(regionIndex).map((utterance) => utterance.text).join(""), width, height, dialogueThickness, cuesOf(regionIndex)));

    const pageStrokes = new Uint8Array(width * height);
    const erased = masks.map((mask, regionIndex) => (mask && mask.strokePixels > 0 && classifications[regionIndex]!.policy !== "keep" ? mask : null));
    for (const mask of erased) if (mask) addToPageMask(pageStrokes, width, mask);
    const pictured = pictureShare(gray, pageStrokes);
    membraneFill(rgb, pageStrokes);
    const cleared = rgbToGray(rgb);

    const results = oriented.map(({ region, orientation }, regionIndex): RegionResult => {
      const classification = classifications[regionIndex]!;
      const mask = erased[regionIndex];
      const clean = classification.policy === "keep" ? "kept" : !mask ? "none" : meetsPicture(pictured, width, mask) ? "inpaint" : "membrane";
      const { frame } = orientation;
      const textBox = { x0: frame.cx - frame.w / 2, y0: frame.cy - frame.h / 2, x1: frame.cx + frame.w / 2, y1: frame.cy + frame.h / 2 };
      return {
        box: region.box,
        cls: region.cls,
        bubble: region.bubble,
        lines: region.lines,
        orientation,
        classification,
        utterances: utterancesOf(regionIndex),
        clean,
        paper: mask ? mask.ringMedian : null,
        ink: mask ? mask.inkMedian : null,
        outline: mask ? mask.outlineMedian : null,
        // Read on the page without its text: other text of the bubble is no frame.
        inside: region.bubble ? bubbleInside(cleared, textBox, region.bubble) : null,
      };
    });
    return { regions: results, strokes: pageStrokes, share: pictured };
  });

  // sharp does not create the parent. The web job never mkdir'd volumes/<id>/work, so every page died here.
  mkdirSync(workDirectory, { recursive: true });
  const write = (name: string) => {
    const path = join(workDirectory, `${pageKey}.${name}.png`);
    return sharp(rgb.data, { raw: { width, height, channels: 3 } }).png().toFile(path).then(() => path);
  };
  const meetsPictureAt = Uint8Array.from(share, (value) => (value > 0 ? 1 : 0));
  if (!meetsPictureAt.includes(1)) {
    return { regions, cleanedPath: await write("filled") };
  }
  const maskPath = join(workDirectory, `${pageKey}.mask.bin`);
  writeFileSync(maskPath, dilateSquare(strokes, width, height, modelMaskGrowPixels));
  const modelPath = join(workDirectory, `${pageKey}.model.png`);
  // Only the 256 px cells in which the picture meets the text are worth a model call.
  const tiles = planInpaintTiles(meetsPictureAt, width, height);
  await timed("inpaint", () => client.inpaint({ imagePath, maskPath, width, height, tiles, outputPath: modelPath }));
  const cleanedPath = await timed("blend", async () => {
    const model = await decodeRgb(modelPath);
    for (let index = 0; index < share.length; index += 1) {
      const weight = share[index]!;
      if (weight === 0) continue;
      for (let offset = index * 3; offset < index * 3 + 3; offset += 1) {
        rgb.data[offset] = Math.round(rgb.data[offset]! + weight * (model.data[offset]! - rgb.data[offset]!));
      }
    }
    return write("clean");
  });
  return { regions, cleanedPath };
};
