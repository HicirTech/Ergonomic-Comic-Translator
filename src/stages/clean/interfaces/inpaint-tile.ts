/**
 * One fixed-size model input at (x, y). Only the inner cell writes results back, so every masked pixel is
 * produced by exactly one tile and always has context around it.
 */
export interface InpaintTile {
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  cellWidth: number;
  cellHeight: number;
}
