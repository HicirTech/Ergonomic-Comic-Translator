import type { Box } from "../../../geometry/interfaces/index.ts";

/** Find text lines inside each region of one page; `regions: null` scans the whole page. */
export interface LineTask {
  imagePath: string;
  regions: Box[] | null;
}
