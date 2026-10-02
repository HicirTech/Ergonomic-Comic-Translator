import type { RealEvalReport } from "./interfaces/index.ts";

const ratio = (value: number) => value.toFixed(3);

/** Metrics only. Page text and images stay out of the terminal. */
export const formatRealSummaryZh = (report: RealEvalReport) => {
  const { summary } = report;
  const lines = [
    `配对数 ${report.pairCount}  顺序不一致 ${report.orderDisagreements}`,
    `检测召回 ${ratio(summary.detectionRecall)}  检测精度 ${ratio(summary.detectionPrecision)}  不含保留精度 ${ratio(summary.detectionPrecisionExcludingKeep)}`,
    `漏检区域 ${summary.missedCount}  漏检面积占比 ${ratio(summary.missedAreaShare)}`,
    `损伤像素 ${summary.damageCount.toFixed(1)}  占页 ${ratio(summary.damageShare)}  区域内 ${summary.damageInsideRegion.toFixed(1)}  区域外 ${summary.damageOutsideRegion.toFixed(1)}`,
    `笔画残留 ${ratio(summary.residualStrokeShare)}`,
  ];
  return lines.join("\n");
};
