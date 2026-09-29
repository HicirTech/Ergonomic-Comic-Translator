/**
 * Binary dilation with a (2r+1) x (2r+1) square, done as two separable 1-D passes so the cost does not
 * grow with the radius squared.
 */
export const dilateSquare = (mask: Uint8Array, width: number, height: number, radius: number) => {
  if (radius <= 0) {
    return mask.slice();
  }
  const horizontal = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let lastSet = -Infinity;
    // left-to-right: distance to the nearest set pixel on the left; right-to-left for the other side
    for (let x = 0; x < width; x += 1) {
      if (mask[row + x]) lastSet = x;
      if (x - lastSet <= radius) horizontal[row + x] = 1;
    }
    lastSet = Infinity;
    for (let x = width - 1; x >= 0; x -= 1) {
      if (mask[row + x]) lastSet = x;
      if (lastSet - x <= radius) horizontal[row + x] = 1;
    }
  }
  const result = new Uint8Array(mask.length);
  for (let x = 0; x < width; x += 1) {
    let lastSet = -Infinity;
    for (let y = 0; y < height; y += 1) {
      if (horizontal[y * width + x]) lastSet = y;
      if (y - lastSet <= radius) result[y * width + x] = 1;
    }
    lastSet = Infinity;
    for (let y = height - 1; y >= 0; y -= 1) {
      if (horizontal[y * width + x]) lastSet = y;
      if (lastSet - y <= radius) result[y * width + x] = 1;
    }
  }
  return result;
};

/** Binary erosion with a (2r+1) x (2r+1) square; pixels beyond the border count as set. */
export const erodeSquare = (mask: Uint8Array, width: number, height: number, radius: number) => {
  const inverted = mask.map((value) => (value ? 0 : 1));
  return dilateSquare(inverted, width, height, radius).map((value) => (value ? 0 : 1));
};
