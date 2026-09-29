/** 8-bit single-channel raster, row-major. */
export interface GrayImage {
  data: Uint8Array;
  width: number;
  height: number;
}
