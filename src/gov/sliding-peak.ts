/** Maximum of the values observed within the last `windowMs`, e.g. the 120 s peak of external VRAM usage. */
export class SlidingPeak {
  private readonly samples: { atMs: number; value: number }[] = [];

  constructor(private readonly windowMs: number) {}

  add(atMs: number, value: number) {
    // Keep a decreasing deque: an older sample smaller than the new one can never be the peak again.
    while (this.samples.length > 0 && this.samples[this.samples.length - 1]!.value <= value) {
      this.samples.pop();
    }
    this.samples.push({ atMs, value });
    this.evict(atMs);
  }

  /** Peak over the window ending at `nowMs`; null when nothing was observed in the window. */
  peak(nowMs: number) {
    this.evict(nowMs);
    return this.samples.length > 0 ? this.samples[0]!.value : null;
  }

  private evict(nowMs: number) {
    while (this.samples.length > 0 && this.samples[0]!.atMs <= nowMs - this.windowMs) {
      this.samples.shift();
    }
  }
}
