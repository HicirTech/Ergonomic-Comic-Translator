/** One candidate page file read from an archive, a folder or a dropped image. */
export interface SourceEntry {
  /** Path inside the source, "/"-separated; used for ordering and display only, never as an identity. */
  name: string;
  data: Uint8Array;
}
