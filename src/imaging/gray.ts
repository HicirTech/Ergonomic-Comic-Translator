import type { Box } from "../geometry/interfaces/index.ts";
import type { GrayImage, RgbImage } from "./interfaces/index.ts";

/** ITU-R BT.601 luma, the weighting OpenCV and PIL use for grayscale conversion. */
export const rgbToGray = (image: RgbImage): GrayImage => {
  const data = new Uint8Array(image.width * image.height);
  for (let index = 0; index < data.length; index += 1) {
    const offset = index * 3;
    data[index] = Math.round(0.299 * image.data[offset]! + 0.587 * image.data[offset + 1]! + 0.114 * image.data[offset + 2]!);
  }
  return { data, width: image.width, height: image.height };
};

/** Copies an integer box out of a grayscale image; the box must lie inside the image. */
export const cropGray = (image: GrayImage, box: Box): GrayImage => {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  if (box.x0 < 0 || box.y0 < 0 || box.x1 > image.width || box.y1 > image.height || width <= 0 || height <= 0) {
    throw new Error(`cropGray: box ${JSON.stringify(box)} is outside ${image.width}x${image.height}`);
  }
  const data = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    const start = (box.y0 + row) * image.width + box.x0;
    data.set(image.data.subarray(start, start + width), row * width);
  }
  return { data, width, height };
};

/** Median of the outermost ring of pixels: the background tone used to pad and fill around a crop. */
export const borderMedian = (image: GrayImage) => {
  const histogram = new Uint32Array(256);
  let count = 0;
  const add = (value: number) => {
    histogram[value]! += 1;
    count += 1;
  };
  for (let x = 0; x < image.width; x += 1) {
    add(image.data[x]!);
    if (image.height > 1) add(image.data[(image.height - 1) * image.width + x]!);
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    add(image.data[y * image.width]!);
    if (image.width > 1) add(image.data[y * image.width + image.width - 1]!);
  }
  let seen = 0;
  for (let value = 0; value < 256; value += 1) {
    seen += histogram[value]!;
    if (seen * 2 >= count) {
      return value;
    }
  }
  return 255;
};

/** Places an image on a larger canvas of `fill`, `pad` pixels in from the top-left corner. */
export const padGray = (image: GrayImage, pad: number, fill: number, width: number, height: number): GrayImage => {
  if (width < image.width + pad || height < image.height + pad) {
    throw new Error("padGray: canvas smaller than image plus padding");
  }
  const data = new Uint8Array(width * height).fill(fill);
  for (let row = 0; row < image.height; row += 1) {
    data.set(image.data.subarray(row * image.width, (row + 1) * image.width), (row + pad) * width + pad);
  }
  return { data, width, height };
};
