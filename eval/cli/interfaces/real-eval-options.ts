import type { LineModel } from "../../../src/stages/lines/interfaces/index.ts";

/** Arguments for the textless-pair eval. `pages` null means every confirmed pair; `lines` picks the DB line detector. */
export interface RealEvalOptions {
  out: string | null;
  pages: number | null;
  lines: LineModel;
  gpu: boolean;
  positionals: string[];
}
