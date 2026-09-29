/** An input exceeded the ingest limits (entry count, total size or compression ratio). */
export class IngestLimitError extends Error {
  readonly code = "INGEST_LIMIT";
}
