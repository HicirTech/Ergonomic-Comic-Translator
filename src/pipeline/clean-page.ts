import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { rgbToGray } from "../imaging/gray.ts";
import { decodeRgb } from "../imaging/page-image.ts";
import { planInpaintTiles } from "../stages/clean/inpaint-tiles.ts";
import { canMembraneFill, membraneFill } from "../stages/clean/membrane-fill.ts";
import { addToPageMask, regionTextMask } from "../stages/mask/text-mask.ts";
import { classifyRegion } from "../stages/regions/classify.ts";
import type { OrientedRegion, RegionResult, StageTimer, UtteranceResult, VisionClient } from "./interfaces/index.ts";

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[sorted.length >> 1]! : null;
};

/**
 * S5/S6 for one page: classify each region, build stroke masks, restore plain and smooth paper with the
 * membrane fill in this process and send strokes on finely textured paper to the inpainting engine. SFX are
 * kept. Writes `<pageKey>.filled.png` and, when inpainting ran, `<pageKey>.mask.bin` and
 * `<pageKey>.clean.png` into `workDirectory`.
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
    const results = oriented.map(({ region, orientation }, regionIndex): RegionResult => {
      const utterances = utterancesOf(regionIndex);
      const text = utterances.map((utterance) => utterance.text).join("");
      const classification = classifyRegion(region, orientation, text, width, height, dialogueThickness);
      let clean: RegionResult["clean"] = "none";
      let paper: RegionResult["paper"] = null;
      if (classification.policy === "keep") {
        clean = "kept";
      } else {
        const mask = regionTextMask(rgb, gray, region.lines, region.bubble);
        if (mask && mask.strokePixels > 0) {
          paper = mask.ringMedian;
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
      return { box: region.box, cls: region.cls, bubble: region.bubble, lines: region.lines, orientation, classification, utterances, clean, paper };
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
