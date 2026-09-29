const degrees = 180 / Math.PI;

/** Normalises a line direction to (-90, 90]; a line has no head, so theta and theta + 180 are the same. */
export const normalizeLineAngle = (angle: number) => {
  let value = ((angle % 180) + 180) % 180;
  if (value > 90) {
    value -= 180;
  }
  return value === -90 ? 90 : value;
};

/**
 * Splits a long-axis angle into writing family and residual tilt: |phi| <= 45 is a horizontal line tilted
 * by phi; otherwise a vertical line tilted by phi - 90 * sign(phi). Beyond 45 degrees the two families look
 * alike, which is why OCR later tries the other orientation too.
 */
export const lineFamily = (phi: number) =>
  Math.abs(phi) <= 45
    ? { family: "h" as const, tilt: phi }
    : { family: "v" as const, tilt: phi - 90 * Math.sign(phi) };

/**
 * Length-weighted mean of line tilts using doubled angles, so -89 and +89 average to 90 instead of 0.
 * `consistency` is 1 when all tilts agree and falls towards 0 as they spread.
 */
export const meanTilt = (tilts: readonly { tilt: number; weight: number }[]) => {
  let sin = 0;
  let cos = 0;
  let total = 0;
  for (const { tilt, weight } of tilts) {
    const doubled = (2 * tilt) / degrees;
    sin += weight * Math.sin(doubled);
    cos += weight * Math.cos(doubled);
    total += weight;
  }
  if (total === 0) {
    return { tilt: 0, consistency: 0 };
  }
  return {
    tilt: normalizeLineAngle((0.5 * Math.atan2(sin, cos)) * degrees),
    consistency: Math.hypot(sin, cos) / total,
  };
};

/** Smallest difference between two line angles, in [0, 90]. */
export const lineAngleDistance = (a: number, b: number) => {
  const difference = Math.abs(normalizeLineAngle(a - b));
  return Math.min(difference, 180 - difference);
};
