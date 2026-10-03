import type { LineModel } from "../../stages/lines/interfaces/index.ts";

/** Choices that change which models a worker-backed vision client loads and calls. */
export interface WorkerVisionClientOptions {
  /** DB detector behind `lines`, for the crop and the page passes. Defaults to "mobile". */
  lineModel?: LineModel;
}
