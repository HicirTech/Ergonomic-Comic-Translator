/**
 * Why pages left the ground truth:
 * - no_textless_member: every page of the cluster has readable text, so none can stand in for the clean picture;
 * - too_few_readable_boxes: next to a textless member, the page has fewer readable boxes than a text page needs.
 */
export type ExclusionReason = "no_textless_member" | "too_few_readable_boxes";
