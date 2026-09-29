const chunkPattern = /(\d+)/;

const compareDigitRuns = (left: string, right: string) => {
  const a = left.replace(/^0+(?=\d)/, "");
  const b = right.replace(/^0+(?=\d)/, "");
  if (a.length !== b.length) {
    return a.length - b.length;
  }
  return a < b ? -1 : a > b ? 1 : 0;
};

const compareCodeUnits = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

/**
 * Natural order for page file names: "page2" before "page10", full-width digits read as digits,
 * case-insensitive, and a final code-unit comparison so the order is total and locale-independent.
 */
export const compareNatural = (left: string, right: string) => {
  const a = left.normalize("NFKC").toLowerCase().split(chunkPattern);
  const b = right.normalize("NFKC").toLowerCase().split(chunkPattern);
  const length = Math.min(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const partA = a[index]!;
    const partB = b[index]!;
    // split() with a capture group puts digit runs at odd indexes
    const order = index % 2 === 1 ? compareDigitRuns(partA, partB) : compareCodeUnits(partA, partB);
    if (order !== 0) {
      return order;
    }
  }

  return a.length !== b.length ? a.length - b.length : compareCodeUnits(left, right);
};
