import type { Box } from "../../../geometry/interfaces/index.ts";

/** How one region crop is prepared for the DB line detector, and how map points go back to the page. */
export interface DbCropPlan {
  box: Box;
  scale: number;
  pad: number;
  /** Scaled crop size before padding. */
  scaledWidth: number;
  scaledHeight: number;
  /** Tensor size: scaled crop plus padding, rounded up to the model stride. */
  width: number;
  height: number;
}
