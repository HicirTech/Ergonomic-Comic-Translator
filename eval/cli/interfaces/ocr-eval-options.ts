import type { LineModel } from "../../../src/stages/lines/interfaces/index.ts";

/** Parsed argv. `out` null means the CLI chooses a new folder under the data root. */
export interface OcrEvalOptions {
  out: string | null;
  seed: number;
  pages: number;
  lines: LineModel;
  gpu: boolean;
  positionals: string[];
}
