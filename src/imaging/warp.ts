import type { Point } from "../geometry/interfaces/index.ts";
import type { GrayImage, RgbImage } from "./interfaces/index.ts";

/**
 * Samples the parallelogram spanned by corners[0] -> corners[1] (width direction) and
 * corners[0] -> corners[3] (height direction) into an upright width x height image with bilinear
 * filtering. Text rectangles from DB are exact rectangles, so an affine map is enough; pixels outside
 * the source take `fill`.
 */
const warp = (
  source: { data: Uint8Array; width: number; height: number },
  channels: number,
  corners: readonly [Point, Point, Point, Point],
  width: number,
  height: number,
  fill: number,
) => {
  const [origin, alongWidth, , alongHeight] = corners;
  const ux = (alongWidth.x - origin.x) / width;
  const uy = (alongWidth.y - origin.y) / width;
  const vx = (alongHeight.x - origin.x) / height;
  const vy = (alongHeight.y - origin.y) / height;
  const out = new Uint8Array(width * height * channels);

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      // sample at pixel centres
      const x = origin.x + (column + 0.5) * ux + (row + 0.5) * vx - 0.5;
      const y = origin.y + (column + 0.5) * uy + (row + 0.5) * vy - 0.5;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      for (let channel = 0; channel < channels; channel += 1) {
        const at = (px: number, py: number) =>
          px < 0 || py < 0 || px >= source.width || py >= source.height ? fill : source.data[(py * source.width + px) * channels + channel]!;
        const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
        const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
        out[(row * width + column) * channels + channel] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return out;
};

export const warpGray = (image: GrayImage, corners: readonly [Point, Point, Point, Point], width: number, height: number, fill = 255): GrayImage => ({
  data: warp(image, 1, corners, width, height, fill),
  width,
  height,
});

export const warpRgb = (image: RgbImage, corners: readonly [Point, Point, Point, Point], width: number, height: number, fill = 255): RgbImage => ({
  data: warp(image, 3, corners, width, height, fill),
  width,
  height,
});

/** Rotates by a multiple of 90 degrees clockwise (exact pixel moves, no resampling). */
export const rotateQuarter = <T extends GrayImage | RgbImage>(image: T, quarterTurns: number, channels: 1 | 3): T => {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) {
    return image;
  }
  const { width, height } = image;
  const outWidth = turns === 2 ? width : height;
  const outHeight = turns === 2 ? height : width;
  const data = new Uint8Array(image.data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [nx, ny] = turns === 1 ? [height - 1 - y, x] : turns === 2 ? [width - 1 - x, height - 1 - y] : [y, width - 1 - x];
      for (let channel = 0; channel < channels; channel += 1) {
        data[(ny * outWidth + nx) * channels + channel] = image.data[(y * width + x) * channels + channel]!;
      }
    }
  }
  return { ...image, data, width: outWidth, height: outHeight };
};
