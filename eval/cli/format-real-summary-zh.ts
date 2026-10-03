import type { RealGroundTruth } from "../ground-truth/interfaces/index.ts";
import type { RealEvalReport } from "./interfaces/index.ts";

const ratio = (value: number) => value.toFixed(3);

/** How the textless pairs were found; also printed alone by --ground-truth-only. */
export const formatGroundTruthZh = (groundTruth: RealGroundTruth) => {
  const noTextless = groundTruth.excluded.no_textless_member;
  const fewReadable = groundTruth.excluded.too_few_readable_boxes;
  return [
    `页数 ${groundTruth.pageCount}  相似页簇 ${groundTruth.clusterCount}（共 ${groundTruth.clusteredPageCount} 页，已核对 ${groundTruth.checkedClusterCount} 簇）  OCR 确认配对 ${groundTruth.confirmedPairCount}`,
    `排除：簇内没有无字页 ${noTextless.clusters} 簇 ${noTextless.members} 页 ${noTextless.pairs} 对；可读框不足 ${fewReadable.members} 页 ${fewReadable.pairs} 对`,
  ].join("\n");
};

/** Metrics only. Page text and images stay out of the terminal. */
export const formatRealSummaryZh = (report: RealEvalReport) => {
  const { summary, groundTruth } = report;
  const lines = [
    `行检测模型 ${report.lines}`,
    formatGroundTruthZh(groundTruth),
    `配对数 ${report.pairCount}  顺序不一致 ${report.orderDisagreements}`,
    `检测召回 ${ratio(summary.detectionRecall)}  检测精度 ${ratio(summary.detectionPrecision)}  不含保留精度 ${ratio(summary.detectionPrecisionExcludingKeep)}`,
    `区域加行召回 ${ratio(summary.regionLineRecall)}  仅行召回 ${ratio(summary.lineRecall)}`,
    `页面行 ${summary.lineCount} 条  触及真值框占比 ${ratio(summary.lineTouchShare)}  整页行检测均耗时 ${summary.pageLineMs.toFixed(0)} ms/页`,
    `漏检区域 ${summary.missedCount}  漏检面积占比 ${ratio(summary.missedAreaShare)}`,
    `损伤像素 ${summary.damageCount.toFixed(1)}  占页 ${ratio(summary.damageShare)}  区域内 ${summary.damageInsideRegion.toFixed(1)}  区域外 ${summary.damageOutsideRegion.toFixed(1)}`,
    `笔画残留 ${ratio(summary.residualStrokeShare)}`,
  ];
  return lines.join("\n");
};
