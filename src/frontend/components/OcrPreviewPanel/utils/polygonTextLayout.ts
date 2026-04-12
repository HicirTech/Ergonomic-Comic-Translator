/**
 * Entry point for polygon text layout.
 *
 * Re-exports types and the main `fitTextInPolygon` function.
 * Implementation is split across:
 *  - polygonGeometry.ts  — bounds, scanline, measurement
 *  - horizontalLayout.ts — horizontal text fitting
 *  - verticalLayout.ts   — vertical text fitting (CJK + rotated non-CJK)
 */

export { polyBounds } from "./polygonGeometry.ts";
export type { PolyBounds } from "./polygonGeometry.ts";

export type { HorizontalLayout, HorizontalLayoutRow } from "./horizontalLayout.ts";
export type { VerticalLayout, VerticalLayoutColumn, VerticalCjkLayout, VerticalRotatedLayout } from "./verticalLayout.ts";

import { polyBounds } from "./polygonGeometry.ts";
import { fitHorizontal } from "./horizontalLayout.ts";
import type { HorizontalLayout } from "./horizontalLayout.ts";
import { fitVertical } from "./verticalLayout.ts";
import type { VerticalLayout } from "./verticalLayout.ts";

export type PolygonTextLayout = HorizontalLayout | VerticalLayout;

export function fitTextInPolygon(
  text: string,
  polygon: [number, number][],
  orientation: "horizontal" | "vertical",
): PolygonTextLayout {
  const bounds = polyBounds(polygon);
  if (orientation === "vertical") return fitVertical(text, polygon, bounds);
  return fitHorizontal(text, polygon, bounds);
}
