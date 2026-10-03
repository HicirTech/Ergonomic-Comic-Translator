/** Parsed argv. `out` null means the CLI chooses a new folder under the data root. */
export interface OcrEvalOptions {
  out: string | null;
  seed: number;
  pages: number;
  gpu: boolean;
  positionals: string[];
}
