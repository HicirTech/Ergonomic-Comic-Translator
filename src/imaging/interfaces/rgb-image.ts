/** 8-bit interleaved RGB raster, row-major. */
export interface RgbImage {
  data: Uint8Array;
  width: number;
  height: number;
}
