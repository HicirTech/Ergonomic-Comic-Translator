export interface SkippedEntry {
  name: string;
  reason: "unsupported_type" | "duplicate" | "undecodable" | "empty_path";
}
