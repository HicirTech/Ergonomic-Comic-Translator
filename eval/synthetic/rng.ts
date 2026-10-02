/** Mulberry32. The planner takes a fixed number of draws per page so a seed replays exactly. */
export const createRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const rngInt = (rng: () => number, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

/** Integer hash for pixel noise. Independent of the rng stream so paint order cannot move the plan. */
export const mixHash = (seed: number, x: number, y: number) => {
  let hash = (seed >>> 0) ^ Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
};
