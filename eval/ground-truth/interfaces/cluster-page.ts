/** A cluster member by its ordinal in this ingest and by its content, which stays the same across ingests. */
export interface ClusterPage {
  ordinal: number;
  sha256: string;
}
