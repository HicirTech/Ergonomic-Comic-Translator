/** Characters that must not start a line (Chinese 避头: closing marks and sentence punctuation). */
export const noLineStart = new Set([..."，。、．！？；：）」』》〉】〕］｝”’…‥～〜ー—・,.!?;:)]}"]);
/** Characters that must not end a line (避尾: opening brackets and quotes). */
export const noLineEnd = new Set([..."（「『《〈【〔［｛“‘([{"]);
/** Punctuation allowed to hang past the line end. */
const maxHanging = 2;

/**
 * Greedy line breaking over per-character advances with kinsoku: a line may take up to two more forbidden
 * starters (hanging punctuation, e.g. "……" or "！？") instead of pushing them to the next line, and never
 * ends on an opening mark.
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
    // Hang forbidden line starters on this line.
    for (let hung = 0; hung < maxHanging && end < chars.length && noLineStart.has(chars[end]!); hung += 1) {
      end += 1;
    }
    // Do not end on an opening mark when that leaves something on the line.
    while (end - index > 1 && end < chars.length && noLineEnd.has(chars[end - 1]!)) {
      end -= 1;
    }
    index = end;
  }
  return starts;
};
