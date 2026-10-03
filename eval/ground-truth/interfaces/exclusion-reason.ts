/**
 * Why text pages left the ground truth:
 * - no_textless_member: every page of the cluster has readable text, so none can stand in for the clean picture;
 * - picture_differs: even the closest textless page differs from the text page in more than text, as CG
 *   variants with another expression or pose do, so the difference would count art as text.
 */
export type ExclusionReason = "no_textless_member" | "picture_differs";
