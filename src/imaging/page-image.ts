import sharp from "sharp";
import { rgbToGray } from "./gray.ts";
import type { GrayImage, RgbImage } from "./interfaces/index.ts";

const asBytes = (buffer: Buffer) => new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

/** Decodes any supported image file to 8-bit sRGB without alpha. */
export const decodeRgb = async (path: string): Promise<RgbImage> => {
  const { data, info } = await sharp(path).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) {
    throw new Error(`Expected 3 channels after decoding ${path}, got ${info.channels}`);
  }
  return { data: asBytes(data), width: info.width, height: info.height };
};

/** Stretches an RGB image to exactly width x height; bilinear matches PIL resample=2, cubic PIL BICUBIC. */
export const resizeRgb = async (image: RgbImage, width: number, height: number, kernel: "linear" | "cubic" = "linear"): Promise<RgbImage> => {
  const data = await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 3 } })
    .resize(width, height, { fit: "fill", kernel })
    .raw()
    .toBuffer();
  return { data: asBytes(data), width, height };
};

export const resizeGray = async (image: GrayImage, width: number, height: number): Promise<GrayImage> => {
  const data = await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 1 } })
    .resize(width, height, { fit: "fill", kernel: "linear" })
    .extractChannel(0)
    .raw()
    .toBuffer();
  return { data: asBytes(data), width, height };
};

/** One decoded page kept per worker: stages send several tasks per page in a row. */
export const createPageCache = () => {
  let cached: { path: string; rgb: RgbImage; gray: GrayImage } | null = null;
  return async (path: string) => {
    if (cached?.path !== path) {
      const rgb = await decodeRgb(path);
      cached = { path, rgb, gray: rgbToGray(rgb) };
    }
    return cached;
  };
};
