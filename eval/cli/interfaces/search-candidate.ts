/** One turn of a multi-turn utterance search, read on the crop the pipeline planned. */
export interface SearchCandidate {
  /** Index into the block's pipelineUtterances. */
  utteranceIndex: number;
  quarterTurns: number;
  /** Mean token probability from the engine the pipeline called for this utterance. */
  meanProb: number;
  /** CER of this turn's text against the whole block reference. */
  cer: number;
}
