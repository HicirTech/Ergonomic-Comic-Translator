/**
 * Evidence between two consecutive lines. Hard reasons start a new utterance: a blank-line gap,
 * a sentence end followed by an opening bracket, a name tag. Gaps and brackets never cut inside an
 * open bracket span. A font-size jump is soft: it only marks a style span inside the same utterance.
 */
export type CutReason = "gap" | "close_open" | "open_after_terminal" | "name_tag";
