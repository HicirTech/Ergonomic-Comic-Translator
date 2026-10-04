import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { rgbToGray } from "../imaging/gray.ts";
import { decodeRgb } from "../imaging/page-image.ts";
import { planInpaintTiles } from "../stages/clean/inpaint-tiles.ts";
import { canMembraneFill, membraneFill } from "../stages/clean/membrane-fill.ts";
import { isColoured, sameInk } from "../stages/mask/ink.ts";
import { addToPageMask, regionTextMask } from "../stages/mask/text-mask.ts";
import { classifyRegion } from "../stages/regions/classify.ts";
import type { LetteringCues } from "../stages/regions/interfaces/index.ts";
import type { OrientedRegion, RegionResult, StageTimer, UtteranceResult, VisionClient } from "./interfaces/index.ts";

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[sorted.length >> 1]! : null;
};

/**
 * S5/S6 for one page: build the stroke mask of every region, classify the regions (how a text is drawn is
 * one of the cues), restore plain and smooth paper with the membrane fill in this process and send strokes
 * on finely textured paper to the inpainting engine. SFX and art lettering are kept. Writes
 * `<pageKey>.filled.png` and, when inpainting ran, `<pageKey>.mask.bin` and `<pageKey>.clean.png` into
 * `workDirectory`.
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
  const smooth = new Uint8Array(width * height);
  let smoothPixels = 0;
  const textured = new Uint8Array(width * height);
  let texturedPixels = 0;

  const regions = await timed("mask_fill", async () => {
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
    const results = oriented.map(({ region, orientation }, regionIndex): RegionResult => {
      const utterances = utterancesOf(regionIndex);
      const text = utterances.map((utterance) => utterance.text).join("");
      const classification = classifyRegion(region, orientation, text, width, height, dialogueThickness, cuesOf(regionIndex));
      let clean: RegionResult["clean"] = "none";
      let paper: RegionResult["paper"] = null;
      let ink: RegionResult["ink"] = null;
      let outline: RegionResult["outline"] = null;
      if (classification.policy === "keep") {
        clean = "kept";
      } else {
        const mask = masks[regionIndex];
        if (mask && mask.strokePixels > 0) {
          paper = mask.ringMedian;
          ink = mask.inkMedian;
          outline = mask.outlineMedian;
          if (canMembraneFill(mask)) {
            addToPageMask(smooth, width, mask);
            smoothPixels += mask.strokePixels;
            clean = "membrane";
          } else {
            addToPageMask(textured, width, mask);
            texturedPixels += mask.strokePixels;
            clean = "inpaint";
          }
        }
      }
      return { box: region.box, cls: region.cls, bubble: region.bubble, lines: region.lines, orientation, classification, utterances, clean, paper, ink, outline };
    });
    if (smoothPixels > 0) membraneFill(rgb, smooth);
    return results;
  });

  // sharp does not create the parent. The web job never mkdir'd volumes/<id>/work, so every page died here.
  mkdirSync(workDirectory, { recursive: true });
  const filledPath = join(workDirectory, `${pageKey}.filled.png`);
  await sharp(rgb.data, { raw: { width, height, channels: 3 } }).png().toFile(filledPath);
  if (texturedPixels === 0) {
    return { regions, cleanedPath: filledPath };
  }
  const maskPath = join(workDirectory, `${pageKey}.mask.bin`);
  writeFileSync(maskPath, textured);
  const cleanedPath = join(workDirectory, `${pageKey}.clean.png`);
  const tiles = planInpaintTiles(textured, width, height);
  await timed("inpaint", () => client.inpaint({ imagePath: filledPath, maskPath, width, height, tiles, outputPath: cleanedPath }));
  return { regions, cleanedPath };
};
