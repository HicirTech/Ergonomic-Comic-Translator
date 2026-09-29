import type { RgbImage } from "../../imaging/interfaces/index.ts";
import type { RegionMask } from "../mask/interfaces/index.ts";

/**
 * Paper whose surrounding ring varies less than this (luma standard deviation) is restored with its
 * median colour; anything with texture, screentone or gradient goes to the inpainting model instead.
 */
export const flatFillMaxRingStd = 8;

export const canFlatFill = (region: RegionMask) => region.ringStd <= flatFillMaxRingStd;

/** Paints the region's stroke pixels with the ring's median colour, in place; nothing outside the mask changes. */
export const flatFill = (rgb: RgbImage, region: RegionMask) => {
  const width = region.window.x1 - region.window.x0;
  const [red, green, blue] = region.ringMedian;
  for (let index = 0; index < region.stroke.length; index += 1) {
    if (!region.stroke[index]) continue;
    const offset = ((region.window.y0 + Math.floor(index / width)) * rgb.width + region.window.x0 + (index % width)) * 3;
    rgb.data[offset] = red;
    rgb.data[offset + 1] = green;
    rgb.data[offset + 2] = blue;
  }
};
