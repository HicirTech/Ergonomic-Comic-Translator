import type { RgbImage } from "../../imaging/interfaces/index.ts";
import type { InpaintTile } from "./interfaces/index.ts";

/** Fixed model input: one shape avoids DirectML recompiles and keeps each call well under a second. */
export const inpaintTileSize = 512;
/** Context kept on every side of the written cell. */
export const inpaintContext = 128;
const cellSize = inpaintTileSize - 2 * inpaintContext;

/**
 * Covers the page with a grid of 256 px cells; every cell containing mask pixels gets a 512 px tile
 * centred on it (shifted inwards at page edges, so context is lost only at the border itself).
 * Each masked pixel lies in exactly one cell, so tiles never write over each other.
 */
export const planInpaintTiles = (mask: Uint8Array, width: number, height: number): InpaintTile[] => {
  const tiles: InpaintTile[] = [];
  for (let cellY = 0; cellY < height; cellY += cellSize) {
    for (let cellX = 0; cellX < width; cellX += cellSize) {
      const cellWidth = Math.min(cellSize, width - cellX);
      const cellHeight = Math.min(cellSize, height - cellY);
      let masked = false;
      for (let y = cellY; y < cellY + cellHeight && !masked; y += 1) {
        for (let x = cellX; x < cellX + cellWidth; x += 1) {
          if (mask[y * width + x]) {
            masked = true;
            break;
          }
        }
      }
      if (!masked) continue;
      const clamp = (value: number, extent: number) => Math.max(0, Math.min(value, Math.max(0, extent - inpaintTileSize)));
      tiles.push({
        x: clamp(cellX - inpaintContext, width),
        y: clamp(cellY - inpaintContext, height),
        cellX,
        cellY,
        cellWidth,
        cellHeight,
      });
    }
  }
  return tiles;
};

/** Copies a tile out of the page; outside the page (pages smaller than a tile) edge pixels are repeated. */
export const extractTile = (rgb: RgbImage, mask: Uint8Array, tile: InpaintTile) => {
  const size = inpaintTileSize;
  const image = new Uint8Array(size * size * 3);
  const holes = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const sy = Math.min(rgb.height - 1, tile.y + y);
    for (let x = 0; x < size; x += 1) {
      const sx = Math.min(rgb.width - 1, tile.x + x);
      const source = sy * rgb.width + sx;
      image.set(rgb.data.subarray(source * 3, source * 3 + 3), (y * size + x) * 3);
      holes[y * size + x] = mask[source] ? 1 : 0;
    }
  }
  return { image, holes };
};

/**
 * Writes a model result back: only pixels that are both masked and inside the tile's cell change.
 * This is the "zero change outside the mask" guarantee of the cleaning stage.
 */
export const compositeTile = (rgb: RgbImage, mask: Uint8Array, tile: InpaintTile, result: Uint8Array) => {
  for (let y = tile.cellY; y < tile.cellY + tile.cellHeight; y += 1) {
    for (let x = tile.cellX; x < tile.cellX + tile.cellWidth; x += 1) {
      const page = y * rgb.width + x;
      if (!mask[page]) continue;
      const local = ((y - tile.y) * inpaintTileSize + (x - tile.x)) * 3;
      rgb.data[page * 3] = result[local]!;
      rgb.data[page * 3 + 1] = result[local + 1]!;
      rgb.data[page * 3 + 2] = result[local + 2]!;
    }
  }
};

/** Runs `inpaint` (tile RGB + holes -> tile RGB) over all tiles and composites the results in place. */
export const applyInpaint = async (
  rgb: RgbImage,
  mask: Uint8Array,
  tiles: readonly InpaintTile[],
  inpaint: (image: Uint8Array, holes: Uint8Array) => Promise<Uint8Array>,
) => {
  for (const tile of tiles) {
    const { image, holes } = extractTile(rgb, mask, tile);
    compositeTile(rgb, mask, tile, await inpaint(image, holes));
  }
};
