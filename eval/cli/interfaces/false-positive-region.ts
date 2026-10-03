import type { RegionClass } from "../../../src/stages/regions/interfaces/index.ts";
import type { PaintedSurface } from "../../synthetic/painted-surface.ts";

/** A predicted region that covers no ground-truth block. */
export interface FalsePositiveRegion {
  cls: "text_bubble" | "text_free" | null;
  classification: RegionClass;
  clean: "membrane" | "inpaint" | "kept" | "none";
  width: number;
  height: number;
  area: number;
  /** Where the generator painted the centre of this box. */
  surface: PaintedSurface;
}
