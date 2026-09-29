import { writeFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { rgbToGray } from "../imaging/gray.ts";
import { decodeRgb } from "../imaging/page-image.ts";
import { canFlatFill, flatFill } from "../stages/clean/flat-fill.ts";
import { planInpaintTiles } from "../stages/clean/inpaint-tiles.ts";
import { addToPageMask, regionTextMask } from "../stages/mask/text-mask.ts";
import { classifyRegion } from "../stages/regions/classify.ts";
import type { OrientedRegion, RegionResult, StageTimer, UtteranceResult, VisionClient } from "./interfaces/index.ts";

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[sorted.length >> 1]! : null;
};

/**
 * S5/S6 for one page: classify each region, build stroke masks, flat-fill plain paper in this process and
 * send the remaining strokes to the inpainting engine. SFX are kept. Writes `<pageKey>.flat.png` and, when
 * inpainting ran, `<pageKey>.mask.bin` and `<pageKey>.clean.png` into `workDirectory`.
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
  const residual = new Uint8Array(width * height);
  let residualPixels = 0;

  const regions = await timed("mask_flat", async () =>
    oriented.map(({ region, orientation }, regionIndex): RegionResult => {
      const utterances = utterancesOf(regionIndex);
      const text = utterances.map((utterance) => utterance.text).join("");
      const classification = classifyRegion(region, orientation, text, width, height, dialogueThickness);
      let clean: RegionResult["clean"] = "none";
      if (classification.policy === "keep") {
        clean = "kept";
      } else {
        const mask = regionTextMask(rgb, gray, region.lines);
        if (mask && mask.strokePixels > 0) {
          if (canFlatFill(mask)) {
            flatFill(rgb, mask);
            clean = "flat";
          } else {
            addToPageMask(residual, width, mask);
            residualPixels += mask.strokePixels;
            clean = "inpaint";
          }
        }
      }
      return { box: region.box, cls: region.cls, bubble: region.bubble, lines: region.lines, orientation, classification, utterances, clean };
    }));

  const flatPath = join(workDirectory, `${pageKey}.flat.png`);
  await sharp(rgb.data, { raw: { width, height, channels: 3 } }).png().toFile(flatPath);
  if (residualPixels === 0) {
    return { regions, cleanedPath: flatPath };
  }
  const maskPath = join(workDirectory, `${pageKey}.mask.bin`);
  writeFileSync(maskPath, residual);
  const cleanedPath = join(workDirectory, `${pageKey}.clean.png`);
  const tiles = planInpaintTiles(residual, width, height);
  await timed("inpaint", () => client.inpaint({ imagePath: flatPath, maskPath, width, height, tiles, outputPath: cleanedPath }));
  return { regions, cleanedPath };
};
