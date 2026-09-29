/** tg_3s: generation speed over the last 3 s, from token arrival times. */
const windowMs = 3000;

/**
 * Collects token arrival times during one streamed completion and reports tokens per second over the
 * last 3 s (or since the first token, while fewer than 3 s have passed) at most once per `everyMs`.
 */
export const createTokenRateMeter = (report: (atMs: number, tokensPerSecond: number) => void, everyMs = 1000) => {
  const arrivals: number[] = [];
  let firstMs: number | null = null;
  let lastReportMs = -Infinity;
  return (atMs: number) => {
    firstMs ??= atMs;
    arrivals.push(atMs);
    while (arrivals.length > 0 && arrivals[0]! <= atMs - windowMs) arrivals.shift();
    if (atMs - lastReportMs >= everyMs && atMs > firstMs) {
      lastReportMs = atMs;
      const span = Math.min(windowMs, atMs - firstMs) / 1000;
      report(atMs, arrivals.length / span);
    }
  };
};
