import type { RgbImage } from "../../../src/imaging/interfaces/index.ts";

/** One page of a cluster of near-identical pages. */
export interface ClusterMember {
  ordinal: number;
  /** Stored page file; the vision client reads it. */
  imagePath: string;
  /** The same page decoded, for the difference boxes. */
  image: RgbImage;
}
