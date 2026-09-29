import type { Box } from "../../src/geometry/interfaces/index.ts";
import { labelComponents } from "../../src/imaging/components.ts";
import type { RgbImage } from "../../src/imaging/interfaces/index.ts";
import { dilateSquare, erodeSquare } from "../../src/imaging/morphology.ts";

/**
 * Reference text areas of a page from its textless variant (benchmark D1): the variant removes text
 * together with its box, so the difference marks "box + text". Level 24 and area 200 are first guesses
 * to be calibrated against 20 owner-checked pages.
 */
export const diffLevel = 24;
const closeRadius = 2;
const minArea = 200;

/** 3 x 3 median per channel; suppresses compression noise before differencing. */
export const median3x3 = (image: RgbImage): RgbImage => {
  const { width, height } = image;
  const out = new Uint8Array(image.data.length);
  const window = new Array<number>(9);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const sx = Math.min(width - 1, Math.max(0, x + dx));
            const sy = Math.min(height - 1, Math.max(0, y + dy));
            window[count++] = image.data[(sy * width + sx) * 3 + channel]!;
          }
        }
        window.sort((a, b) => a - b);
        out[(y * width + x) * 3 + channel] = window[4]!;
      }
    }
  }
  return { data: out, width, height };
};

/** Mask (1 = text or its box) and one box per connected area of at least 200 pixels. */
export const deriveTextAreas = (original: RgbImage, textless: RgbImage) => {
  if (original.width !== textless.width || original.height !== textless.height) {
    throw new Error("A page and its textless variant must have the same size");
  }
  const { width, height } = original;
  const a = median3x3(original);
  const b = median3x3(textless);
  const changed = new Uint8Array(width * height);
  for (let index = 0; index < changed.length; index += 1) {
    const offset = index * 3;
    const difference = Math.max(
      Math.abs(a.data[offset]! - b.data[offset]!),
      Math.abs(a.data[offset + 1]! - b.data[offset + 1]!),
      Math.abs(a.data[offset + 2]! - b.data[offset + 2]!),
    );
    changed[index] = difference > diffLevel ? 1 : 0;
  }
  const closed = erodeSquare(dilateSquare(changed, width, height, closeRadius), width, height, closeRadius);
  const { labels, components } = labelComponents(closed, width, height);
  const kept = new Set(components.filter((component) => component.pixels >= minArea).map((component) => component.label));
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    if (kept.has(labels[index]!)) mask[index] = 1;
  }
  const boxes: Box[] = components.filter((component) => kept.has(component.label)).map((component) => component.box);
  return { mask, boxes };
};
