import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { boundingBoxOfPoints, expandBox } from "../../src/geometry/box.ts";
import type { RgbImage } from "../../src/imaging/interfaces/index.ts";
import type { Shaper } from "../../src/typeset/interfaces/index.ts";
import { layoutText } from "../../src/typeset/layout.ts";
import { pageOverlaySvg, placedBlockSvg } from "../../src/typeset/svg.ts";
import {
  bubbleFillRgb,
  bubblePadPx,
  bubbleStrokePx,
  bubbleStrokeRgb,
  darkNoiseAmp,
  darkRgb,
  outlinedKinds,
  pageHeightPx,
  noisePageStride,
  pageWidthPx,
  panelPadPx,
  paperNoiseAmp,
  paperRgb,
  textureBlotchAmp,
  textureNoiseAmp,
  textureRgb,
} from "./constants.ts";
import type { SyntheticPage } from "./interfaces/index.ts";
import { mixHash } from "./rng.ts";

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const noiseAt = (seed: number, x: number, y: number, amp: number, blotch: number) => {
  const fine = ((mixHash(seed, x, y) & 255) - 128) / 128;
  const low = ((mixHash(seed ^ 0x5a5a5a5a, x >> 4, y >> 4) & 255) - 128) / 128;
  return fine * amp + low * blotch;
};

const fillBase = (page: SyntheticPage): RgbImage => {
  const base = page.background === "dark" ? darkRgb : page.background === "texture" ? textureRgb : paperRgb;
  const amp = page.background === "dark" ? darkNoiseAmp : page.background === "texture" ? textureNoiseAmp : paperNoiseAmp;
  const blotch = page.background === "texture" ? textureBlotchAmp : 0;
  const data = new Uint8Array(pageWidthPx * pageHeightPx * 3);
  for (let y = 0; y < pageHeightPx; y += 1) {
    for (let x = 0; x < pageWidthPx; x += 1) {
      const delta = noiseAt(page.seed + page.index * noisePageStride, x, y, amp, blotch);
      const offset = (y * pageWidthPx + x) * 3;
      data[offset] = clampByte(base[0] + delta);
      data[offset + 1] = clampByte(base[1] + delta);
      data[offset + 2] = clampByte(base[2] + delta);
    }
  }
  return { data, width: pageWidthPx, height: pageHeightPx };
};

const paintRect = (image: RgbImage, x0: number, y0: number, x1: number, y1: number, rgb: readonly [number, number, number]) => {
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(image.width, Math.ceil(x1));
  const bottom = Math.min(image.height, Math.ceil(y1));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * image.width + x) * 3;
      image.data[offset] = rgb[0];
      image.data[offset + 1] = rgb[1];
      image.data[offset + 2] = rgb[2];
    }
  }
};

/** White disc with a black rim, in the clean background so inpainting is not asked to remove the bubble. */
const paintBubble = (image: RgbImage, box: { x0: number; y0: number; x1: number; y1: number }) => {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const rx = (box.x1 - box.x0) / 2;
  const ry = (box.y1 - box.y0) / 2;
  if (rx <= bubbleStrokePx || ry <= bubbleStrokePx) return;
  const left = Math.max(0, Math.floor(box.x0));
  const top = Math.max(0, Math.floor(box.y0));
  const right = Math.min(image.width, Math.ceil(box.x1));
  const bottom = Math.min(image.height, Math.ceil(box.y1));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const inx = (x + 0.5 - cx) / (rx - bubbleStrokePx);
      const iny = (y + 0.5 - cy) / (ry - bubbleStrokePx);
      const rgb = inx * inx + iny * iny <= 1 ? bubbleFillRgb : bubbleStrokeRgb;
      const offset = (y * image.width + x) * 3;
      image.data[offset] = rgb[0];
      image.data[offset + 1] = rgb[1];
      image.data[offset + 2] = rgb[2];
    }
  }
};

const paintScenery = (page: SyntheticPage, image: RgbImage) => {
  for (const block of page.blocks) {
    if (outlinedKinds.has(block.kind)) {
      const panel = expandBox(boundingBoxOfPoints(block.polygon), panelPadPx);
      paintRect(image, panel.x0, panel.y0, panel.x1, panel.y1, darkRgb);
    }
  }
  for (const block of page.blocks) {
    if (!block.bubble) continue;
    paintBubble(image, expandBox(boundingBoxOfPoints(block.polygon), bubblePadPx));
  }
};

const textSvg = (shaper: Shaper, page: SyntheticPage) => {
  const blocks = page.blocks.flatMap((block) => block.lines.map((line) => {
    const layout = layoutText(shaper, line.text, block.direction, line.width, line.height, block.fontSize, block.fontSize);
    if (layout.lines !== 1 || layout.overflow) throw new Error(`Planned line no longer fits: ${block.id}#${line.order}`);
    return placedBlockSvg(
      shaper,
      layout,
      { cx: line.cx, cy: line.cy, width: line.width, height: line.height, angle: block.angle },
      outlinedKinds.has(block.kind),
    );
  }));
  return pageOverlaySvg(page.width, page.height, blocks);
};

interface PaintedPage {
  backgroundPng: Uint8Array;
  pagePng: Uint8Array;
  maskPng: Uint8Array;
  /** 0/1 mask of glyph and outline pixels, one byte per page pixel. */
  mask: Uint8Array;
}

/** Renders the clean background, the page with text, and the text mask. Resvg options match composePage. */
export const paintSyntheticPage = async (shaper: Shaper, page: SyntheticPage): Promise<PaintedPage> => {
  const background = fillBase(page);
  paintScenery(page, background);
  const overlay = new Resvg(textSvg(shaper, page), { fitTo: { mode: "original" }, font: { loadSystemFonts: false } }).render().asPng();
  const decoded = await sharp(overlay).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (decoded.info.width !== page.width || decoded.info.height !== page.height || decoded.info.channels !== 4) {
    throw new Error(`Text overlay is ${decoded.info.width}x${decoded.info.height}x${decoded.info.channels}, expected ${page.width}x${page.height}x4`);
  }
  const mask = new Uint8Array(page.width * page.height);
  for (let index = 0; index < mask.length; index += 1) {
    if (decoded.data[index * 4 + 3]! > 0) mask[index] = 255;
  }
  const backgroundPng = new Uint8Array(await sharp(background.data, { raw: { width: page.width, height: page.height, channels: 3 } }).png().toBuffer());
  const pagePng = new Uint8Array(await sharp(background.data, { raw: { width: page.width, height: page.height, channels: 3 } })
    .composite([{ input: overlay }])
    .png()
    .toBuffer());
  const maskPng = new Uint8Array(await sharp(mask, { raw: { width: page.width, height: page.height, channels: 1 } }).png().toBuffer());
  return { backgroundPng, pagePng, maskPng, mask };
};
