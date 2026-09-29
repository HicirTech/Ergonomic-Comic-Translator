/** Small grayscale rendition of a page used for cheap whole-page comparisons. */
export interface PageThumbnail {
  ordinal: number;
  width: number;
  height: number;
  /** Gray pixels of the thumbnail, row-major. */
  gray: Uint8Array;
  thumbWidth: number;
  thumbHeight: number;
  /** 64-bit difference hash of the page. */
  dhash: bigint;
}
