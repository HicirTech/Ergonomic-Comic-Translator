export interface LockedFile {
  /** Path inside the repository, also the path under the model's install directory. */
  path: string;
  size: number;
  sha256: string;
}
