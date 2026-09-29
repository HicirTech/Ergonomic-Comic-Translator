import type { GrayImage, RgbImage } from "./interfaces/index.ts";

export const imagenetMean = [0.485, 0.456, 0.406] as const;
export const imagenetStd = [0.229, 0.224, 0.225] as const;

/** RGB bytes to planar float32 in 0..1 without normalisation (the comic detector's expected input). */
export const rgbToUnitChw = (image: RgbImage) => {
  const plane = image.width * image.height;
  const tensor = new Float32Array(3 * plane);
  for (let index = 0; index < plane; index += 1) {
    tensor[index] = image.data[index * 3]! / 255;
    tensor[plane + index] = image.data[index * 3 + 1]! / 255;
    tensor[2 * plane + index] = image.data[index * 3 + 2]! / 255;
  }
  return tensor;
};

/**
 * A gray image replicated into three normalised planes: (v / 255 - mean[c]) / std[c].
 * Paddle models read BGR, so plane 0 is "blue"; with identical planes only the per-plane constants matter.
 */
export const grayToNormalizedChw = (
  image: GrayImage,
  mean: readonly number[] = imagenetMean,
  std: readonly number[] = imagenetStd,
) => {
  const plane = image.width * image.height;
  const tensor = new Float32Array(3 * plane);
  for (let channel = 0; channel < 3; channel += 1) {
    const offset = channel * plane;
    for (let index = 0; index < plane; index += 1) {
      tensor[offset + index] = (image.data[index]! / 255 - mean[channel]!) / std[channel]!;
    }
  }
  return tensor;
};

/** RGB bytes to normalised planes in RGB order: (v / 255 - mean[c]) / std[c]. */
export const rgbToNormalizedChw = (
  image: RgbImage,
  mean: readonly number[] = imagenetMean,
  std: readonly number[] = imagenetStd,
) => {
  const plane = image.width * image.height;
  const tensor = new Float32Array(3 * plane);
  for (let index = 0; index < plane; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      tensor[channel * plane + index] = (image.data[index * 3 + channel]! / 255 - mean[channel]!) / std[channel]!;
    }
  }
  return tensor;
};
