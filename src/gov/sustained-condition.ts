/** Tracks whether a condition has held continuously for at least `holdMs`, e.g. external GPU load > 90 % for 30 s. */
export class SustainedCondition {
  private sinceMs: number | null = null;

  constructor(private readonly holdMs: number) {}

  update(atMs: number, holds: boolean) {
    if (!holds) {
      this.sinceMs = null;
      return false;
    }
    this.sinceMs ??= atMs;
    return atMs - this.sinceMs >= this.holdMs;
  }
}
