const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/**
 * Detects a generation-speed cliff from tg_3s samples (tokens per second over the last 3 s, reported
 * about once per second while a request is streaming). In the 2026-09-29 incident speed fell from
 * 66-118 tok/s to a mean of 23.9 when VRAM spilled into RAM, about 54 s before the TDR.
 * Fires when every sample of the last `sustainMs` stayed below `ratio` x the median of the samples before them.
 */
export class ThroughputCliffDetector {
  private readonly samples: { atMs: number; tokensPerSecond: number }[] = [];

  constructor(
    private readonly options = { sustainMs: 6000, ratio: 0.4, historyMs: 60_000, minHistorySamples: 5 },
  ) {}

  /** Adds one tg_3s sample and returns true while the cliff condition holds. */
  add(atMs: number, tokensPerSecond: number) {
    this.samples.push({ atMs, tokensPerSecond });
    while (this.samples.length > 0 && this.samples[0]!.atMs < atMs - this.options.historyMs) {
      this.samples.shift();
    }
    return this.isCliff();
  }

  /** Call when a request ends or the model is reloaded, so idle gaps never look like a cliff. */
  reset() {
    this.samples.length = 0;
  }

  private isCliff() {
    const last = this.samples[this.samples.length - 1];
    if (!last) {
      return false;
    }
    const windowStart = last.atMs - this.options.sustainMs;
    const history = this.samples.filter((sample) => sample.atMs < windowStart);
    const recent = this.samples.filter((sample) => sample.atMs >= windowStart);
    if (history.length < this.options.minHistorySamples || recent.length < 2) {
      return false;
    }
    // The streak must cover the whole sustain window, not just its tail.
    const coversWindow = recent[0]!.atMs - windowStart <= 1000;
    const threshold = this.options.ratio * median(history.map((sample) => sample.tokensPerSecond));
    return coversWindow && recent.every((sample) => sample.tokensPerSecond < threshold);
  }
}
