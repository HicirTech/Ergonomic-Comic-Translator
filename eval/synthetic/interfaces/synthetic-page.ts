import type { GroundTruthBlock } from "./ground-truth-block.ts";
import type { SfxMark } from "./sfx-mark.ts";

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
  /** Art lettering in the background; empty on pages without a bubble. */
  sfx: SfxMark[];
}
