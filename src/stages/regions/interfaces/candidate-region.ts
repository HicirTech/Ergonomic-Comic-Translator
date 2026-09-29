import type { Box } from "../../../geometry/interfaces/index.ts";
import type { DetectionClass } from "../../detect/interfaces/index.ts";

/** A text area after detector clean-up, before its lines are known. */
export interface CandidateRegion {
  box: Box;
  cls: Exclude<DetectionClass, "bubble">;
  score: number;
  /** Bubbles (by index into the consolidated bubble list) whose area this text touches. */
  bubbles: number[];
}
