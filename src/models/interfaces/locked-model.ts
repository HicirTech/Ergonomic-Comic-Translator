import type { LockedFile } from "./locked-file.ts";

/**
 * One pinned asset (model weights, fonts, dictionaries): a repository at a full commit revision, or at a release
 * tag for a release asset; every file is verified by size and sha256. `source` defaults to Hugging Face; fonts
 * come from GitHub, dictionaries from GitHub releases.
 */
export interface LockedModel {
  role: string;
  source?: "huggingface" | "github" | "github-release";
  repo: string;
  revision: string;
  license: string;
  files: LockedFile[];
}
