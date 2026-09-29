import type { LockedFile } from "./locked-file.ts";

/**
 * One pinned asset (model weights, fonts): a repository at a full commit revision; every file is
 * verified by size and sha256. `source` defaults to Hugging Face; fonts come from GitHub.
 */
export interface LockedModel {
  role: string;
  source?: "huggingface" | "github";
  repo: string;
  revision: string;
  license: string;
  files: LockedFile[];
}
