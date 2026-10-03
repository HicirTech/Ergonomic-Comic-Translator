import type { LineModel } from "../../../src/stages/lines/interfaces/index.ts";

/**
 * Arguments for the textless-pair eval. `pages` null means every confirmed pair; `lines` picks the DB line
 * detector; `groundTruthOnly` reads the clusters into the cache on the CPU and scores nothing.
 */
export interface RealEvalOptions {
  out: string | null;
  pages: number | null;
  lines: LineModel;
  gpu: boolean;
  groundTruthOnly: boolean;
  positionals: string[];
}
