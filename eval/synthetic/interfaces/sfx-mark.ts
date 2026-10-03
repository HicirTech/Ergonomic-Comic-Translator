import type { Quad } from "./quad.ts";

/**
 * Art lettering painted into the clean background across a bubble outline. The owner's rule leaves art
 * text alone, so it is never part of the text mask: the pipeline must not read, translate or erase it.
 */
export interface SfxMark {
  id: string;
  text: string;
  fontSize: number;
  angle: number;
  cx: number;
  cy: number;
  /** Layout box, outline included, before the rotation. */
  width: number;
  height: number;
  /** The layout box after the same rotation placedBlockSvg applies. */
  polygon: Quad;
}
