/**
 * The height of a line's ink is read without the twentieth of its pixels that lies furthest out on either
 * side: a bracket that stands taller than the type, or a few pixels of a frame the mask kept, hold next to
 * none of the ink and do not count.
 */
const tailShare = 0.05;
/** A line with fewer ink pixels than this has no height to speak of. */
const minInkPixels = 12;

/**
 * How tall the type of a line stands: the extent across the line of the middle of its ink, scaled up to
 * the whole of it. `ink` and `polygon` (the line's rectangle) share a window `width` pixels wide; `angle` is
 * that of the line's long axis in degrees. Null when the rectangle holds hardly any ink.
 */
export const inkHeight = (ink: Uint8Array, polygon: Uint8Array, angle: number, width: number): number | null => {
  const radians = (angle * Math.PI) / 180;
  const acrossX = -Math.sin(radians);
  const acrossY = Math.cos(radians);
  const positions: number[] = [];
  for (let index = 0; index < ink.length; index += 1) {
    if (ink[index] && polygon[index]) positions.push((index % width) * acrossX + Math.floor(index / width) * acrossY);
  }
  if (positions.length < minInkPixels) return null;
  positions.sort((a, b) => a - b);
  const tail = Math.floor(tailShare * positions.length);
  return (positions[positions.length - 1 - tail]! - positions[tail]! + 1) / (1 - 2 * tailShare);
};
