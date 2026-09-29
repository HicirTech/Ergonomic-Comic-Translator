import { clampToImage, expandBox } from "../../geometry/box.ts";
import type { Box, Point } from "../../geometry/interfaces/index.ts";
import type { DbCropPlan } from "./interfaces/index.ts";

/** Context around a region crop, so strokes touching the box edge are not cut. */
const cropMargin = 8;
/** Background border added around the crop; DB needs quiet space around each line. */
const backgroundPad = 16;
/** Crops with a shorter side are upscaled 2x; tiny text otherwise drops below the DB stride. */
const upscaleBelowSide = 40;
const strideAlign = 32;

export const planDbCrop = (region: Box, pageWidth: number, pageHeight: number): DbCropPlan => {
  const box = clampToImage(expandBox(region, cropMargin), pageWidth, pageHeight);
  const cropWidth = box.x1 - box.x0;
  const cropHeight = box.y1 - box.y0;
  const scale = Math.min(cropWidth, cropHeight) < upscaleBelowSide ? 2 : 1;
  const scaledWidth = Math.round(cropWidth * scale);
  const scaledHeight = Math.round(cropHeight * scale);
  return {
    box,
    scale,
    pad: backgroundPad,
    scaledWidth,
    scaledHeight,
    width: Math.ceil((scaledWidth + 2 * backgroundPad) / strideAlign) * strideAlign,
    height: Math.ceil((scaledHeight + 2 * backgroundPad) / strideAlign) * strideAlign,
  };
};

/** Whole-page plan (for text the detector missed): no margin, no scaling, only stride alignment. */
export const planDbPage = (pageWidth: number, pageHeight: number): DbCropPlan => ({
  box: { x0: 0, y0: 0, x1: pageWidth, y1: pageHeight },
  scale: 1,
  pad: 0,
  scaledWidth: pageWidth,
  scaledHeight: pageHeight,
  width: Math.ceil(pageWidth / strideAlign) * strideAlign,
  height: Math.ceil(pageHeight / strideAlign) * strideAlign,
});

export const dbMapToPage = (plan: DbCropPlan) => (point: Point): Point => ({
  x: (point.x - plan.pad) / plan.scale + plan.box.x0,
  y: (point.y - plan.pad) / plan.scale + plan.box.y0,
});
