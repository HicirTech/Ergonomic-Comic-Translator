import type { LockedFile } from "./locked-file.ts";

/** One model pinned to a Hugging Face revision; every file is verified by size and sha256. */
export interface LockedModel {
  role: string;
  repo: string;
  revision: string;
  license: string;
  files: LockedFile[];
}
