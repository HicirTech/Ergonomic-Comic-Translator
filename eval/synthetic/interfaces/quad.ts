import type { Point } from "../../../src/geometry/interfaces/index.ts";

/** Four page-pixel corners. Line polygons use rectCorners order (first edge along the long side). */
export type Quad = [Point, Point, Point, Point];
