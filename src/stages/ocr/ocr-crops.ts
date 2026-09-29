import type { GrayImage, RgbImage } from "../../imaging/interfaces/index.ts";
import { rotateQuarter, warpGray, warpRgb } from "../../imaging/warp.ts";
import type { OcrCrop } from "./interfaces/index.ts";

/** Upright gray images of a crop, one per requested quarter turn. */
export const grayCandidates = (page: GrayImage, crop: OcrCrop) => {
  const upright = warpGray(page, crop.corners, crop.width, crop.height);
  return crop.quarterTurns.map((quarterTurns) => ({ quarterTurns, image: rotateQuarter(upright, quarterTurns, 1) }));
};

/** Upright RGB images of a crop, one per requested quarter turn. */
export const rgbCandidates = (page: RgbImage, crop: OcrCrop) => {
  const upright = warpRgb(page, crop.corners, crop.width, crop.height);
  return crop.quarterTurns.map((quarterTurns) => ({ quarterTurns, image: rotateQuarter(upright, quarterTurns, 3) }));
};
