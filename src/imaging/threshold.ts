import type { GrayImage } from "./interfaces/index.ts";

/** Otsu's threshold: the gray level that maximises between-class variance. */
export const otsuThreshold = (image: GrayImage) => {
  const histogram = new Float64Array(256);
  for (const value of image.data) histogram[value]! += 1;
  const total = image.data.length;
  let sum = 0;
  for (let level = 0; level < 256; level += 1) sum += level * histogram[level]!;

  let sumBackground = 0;
  let weightBackground = 0;
  let bestVariance = -1;
  let threshold = 127;
  for (let level = 0; level < 256; level += 1) {
    weightBackground += histogram[level]!;
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += level * histogram[level]!;
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = level;
    }
  }
  return threshold;
};
