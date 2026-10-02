/** Four-rotation CER of one ground-truth line, read with the pipeline's line crop. */
export interface OcrLineRotation {
  blockId: string;
  lineOrder: number;
  reference: string;
  hypotheses: [string, string, string, string];
  cerByTurn: [number, number, number, number];
  bestTurn: number;
  chosenTurn: number;
  chosenIsBest: boolean;
}
