/** Arguments for the textless-pair eval. `pages` null means every pair. */
export interface RealEvalOptions {
  out: string | null;
  pages: number | null;
  gpu: boolean;
  positionals: string[];
}
