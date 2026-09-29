/** Decoding settings of the published Baberu model (onnx_infer.py). */
export interface BaberuDecodeParams {
  maxNewTokens: number;
  repetitionPenalty: number;
  /** The same content character may repeat at most this many times in a row. */
  maxContentRun: number;
}
