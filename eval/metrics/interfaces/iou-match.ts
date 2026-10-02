/** One-to-one match of a ground-truth box index to a predicted box index. */
export interface IouMatch {
  referenceIndex: number;
  predictedIndex: number;
  iou: number;
}
