export interface RuntimeAsset {
  url: string;
  size: number;
  sha256: string;
  /** Other assets of the same runtime that must be installed alongside, e.g. the CUDA runtime DLLs. */
  requires?: string[];
}
