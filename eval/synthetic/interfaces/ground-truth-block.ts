import type { Quad } from "./quad.ts";
import type { GroundTruthLine } from "./ground-truth-line.ts";
import type { LayoutKind } from "./layout-kind.ts";

/**
 * One text block. `polygon` is the layout box (width edge first), the sentence-reader crop.
 * Direction is the writing mode. The quarter turn the product used is scored from the pipeline.
 */
export interface GroundTruthBlock {
  id: string;
  kind: LayoutKind;
  direction: "h" | "v";
  angle: number;
  readingOrder: number;
  sentenceKey: string;
  bubble: boolean;
  fontSize: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
  polygon: Quad;
  lines: GroundTruthLine[];
}
