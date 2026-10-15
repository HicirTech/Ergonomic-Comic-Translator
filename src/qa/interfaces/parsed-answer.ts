/** An answer read into values by unit id; `extraKeys` when it also named ids that were not asked for. */
export interface ParsedAnswer {
  values: Record<string, unknown>;
  extraKeys: boolean;
}
