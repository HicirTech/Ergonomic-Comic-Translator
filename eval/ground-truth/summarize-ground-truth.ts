import type { RealGroundTruth, TextlessConfirmation } from "./interfaces/index.ts";

const emptyTotal = () => ({ clusters: 0, members: 0, pairs: 0 });

/** The clusters found on the volume, and what the OCR check kept and removed in the ones it read. */
export const summarizeGroundTruth = (
  pageCount: number,
  clusters: readonly (readonly number[])[],
  confirmations: readonly TextlessConfirmation[],
): RealGroundTruth => {
  const excluded: RealGroundTruth["excluded"] = { no_textless_member: emptyTotal(), too_few_readable_boxes: emptyTotal() };
  for (const exclusion of confirmations.flatMap((confirmation) => confirmation.excluded)) {
    const total = excluded[exclusion.reason];
    total.clusters += 1;
    total.members += exclusion.ordinals.length;
    total.pairs += exclusion.pairCount;
  }
  return {
    pageCount,
    clusterCount: clusters.length,
    clusteredPageCount: clusters.reduce((sum, cluster) => sum + cluster.length, 0),
    checkedClusterCount: confirmations.length,
    confirmedPairCount: confirmations.reduce((sum, confirmation) => sum + confirmation.pairs.length, 0),
    excluded,
    clusters: [...confirmations],
  };
};
