import type { GroundTruthBlock } from "./ground-truth-block.ts";

/** Ground truth for one generated page, before pixels are painted. */
export interface SyntheticPage {
  id: string;
  seed: number;
  index: number;
  width: number;
  height: number;
  /** paper: light noise; dark: outlined art; texture: mixed page. */
  background: "paper" | "dark" | "texture";
  blocks: GroundTruthBlock[];
}
