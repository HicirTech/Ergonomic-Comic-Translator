import type { InpaintTile } from "./inpaint-tile.ts";

/** Inpaint one page: the mask is a raw file of width x height bytes (non-zero = remove). */
export interface InpaintTask {
  imagePath: string;
  maskPath: string;
  width: number;
  height: number;
  tiles: InpaintTile[];
  /** Lossless PNG written with the inpainted pixels composited inside the mask only. */
  outputPath: string;
}
