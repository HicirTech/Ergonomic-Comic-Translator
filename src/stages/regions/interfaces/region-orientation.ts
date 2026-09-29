import type { OrientedFrame } from "./oriented-frame.ts";

export interface RegionOrientation {
  /** Length-weighted residual tilt of the lines, degrees in (-45, 45]. */
  tilt: number;
  /** 1 when all lines agree on the tilt. */
  consistency: number;
  /** null when no line is elongated enough to tell. */
  writingMode: "h" | "v" | null;
  /** Geometry cannot decide the direction (short lines only, or tilt near 45 degrees); OCR must try both. */
  ambiguous: boolean;
  frame: OrientedFrame;
}
