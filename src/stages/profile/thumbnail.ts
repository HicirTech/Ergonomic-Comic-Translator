import sharp from "sharp";
import type { PageThumbnail } from "./interfaces/index.ts";
import { differenceHash } from "./page-profile.ts";

/** Thumbnail width for page comparisons; small enough to compare every pair of a volume quickly. */
const thumbWidth = 128;

export const makeThumbnail = async (path: string, ordinal: number, width: number, height: number): Promise<PageThumbnail> => {
  const thumbHeight = Math.max(1, Math.round((height * thumbWidth) / width));
  const gray = new Uint8Array(await sharp(path).grayscale().resize(thumbWidth, thumbHeight, { fit: "fill", kernel: "linear" }).raw().toBuffer());
  const tiny = new Uint8Array(await sharp(path).grayscale().resize(9, 8, { fit: "fill", kernel: "linear" }).raw().toBuffer());
  return { ordinal, width, height, gray, thumbWidth, thumbHeight, dhash: differenceHash(tiny) };
};
