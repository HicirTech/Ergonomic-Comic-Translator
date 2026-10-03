/** Characters that must not start a line (Chinese 避头: closing marks and sentence punctuation). */
export const noLineStart = new Set([..."，。、．！？；：）」』》〉】〕］｝”’…‥～〜ー—・,.!?;:)]}"]);
/** Characters that must not end a line (避尾: opening brackets and quotes). */
export const noLineEnd = new Set([..."（「『《〈【〔［｛“‘([{"]);
/** At most this many characters move down to the next line to keep a forbidden starter off its start. */
const maxPulledDown = 2;

/**
 * Greedy line breaking over per-character advances with kinsoku. No line is longer than `limit` (unless one
 * character alone is): the box is the bubble, so nothing hangs past it. A forbidden line starter is kept
 * off the line start by moving up to two characters down with it; a longer run of marks (e.g. "………")
 * breaks where it must. A line never ends on an opening mark.
 * Returns the index where each line starts; `limit` is the line length in the same unit as `advances`.
 */
export const breakLines = (chars: readonly string[], advances: readonly number[], limit: number) => {
  const starts: number[] = [];
  let index = 0;
  while (index < chars.length) {
    starts.push(index);
    let used = 0;
    let end = index;
    while (end < chars.length && (end === index || used + advances[end]! <= limit)) {
      used += advances[end]!;
      end += 1;
    }
    // Move characters down so that the next line does not start with a forbidden starter.
    let pulled = end;
    while (pulled - index > 1 && pulled < chars.length && noLineStart.has(chars[pulled]!) && end - pulled < maxPulledDown) {
      pulled -= 1;
    }
    if (pulled >= chars.length || !noLineStart.has(chars[pulled]!)) end = pulled;
    // Do not end on an opening mark when that leaves something on the line.
    while (end - index > 1 && end < chars.length && noLineEnd.has(chars[end - 1]!)) {
      end -= 1;
    }
    index = end;
  }
  return starts;
};
