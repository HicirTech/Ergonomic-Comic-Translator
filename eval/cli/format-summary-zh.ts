import type { LayoutKind } from "../synthetic/interfaces/index.ts";
import type { OcrEvalReport } from "./interfaces/index.ts";

const kindZh: Record<LayoutKind, string> = {
  "h-line": "横排单行",
  "h-block": "横排多行",
  "v-column": "竖排单栏",
  "v-block": "竖排多栏",
  "art-h": "横排白边",
  "art-v": "竖排白边",
  "slant-h": "横排倾斜",
  "slant-v": "竖排倾斜",
};

const displayWidth = (text: string) => [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 0xff ? 2 : 1), 0);

const pad = (text: string, width: number) => text + " ".repeat(Math.max(0, width - displayWidth(text)));

const ratio = (value: number) => value.toFixed(3);

const mark = (passed: boolean) => (passed ? "通过" : "未通过");

const columns: readonly [string, number][] = [
  ["种类", 12],
  ["块数", 6],
  ["单", 4],
  ["并", 4],
  ["拆", 4],
  ["漏", 4],
  ["召回", 8],
  ["送译CER", 10],
  ["书写方向", 10],
  ["行序", 8],
  ["逐行最佳CER", 14],
  ["Baberu产品CER", 16],
  ["Baberu最佳CER", 16],
  ["manga产品CER", 14],
  ["manga最佳CER", 14],
];

/** Metrics only: ground-truth sentences stay in report.json. */
export const formatSummaryZh = (report: OcrEvalReport) => {
  const header = columns.map(([label, width]) => pad(label, width)).join("");
  const rows = (Object.keys(kindZh) as LayoutKind[]).map((kind) => {
    const summary = report.summary.byKind[kind];
    const blank = summary.blocks === 0;
    const num = (value: number | null) => (blank || value === null ? "—" : ratio(value));
    const values = [
      kindZh[kind],
      String(summary.blocks),
      blank ? "—" : String(summary.single),
      blank ? "—" : String(summary.merged),
      blank ? "—" : String(summary.split),
      blank ? "—" : String(summary.missed),
      num(blank ? null : summary.recall),
      num(blank ? null : summary.cer),
      num(blank ? null : summary.writingModeAccuracy),
      num(summary.lineOrderAccuracy),
      num(summary.lineBestCer),
      num(summary.baberuProductCer),
      num(summary.baberuBestCer),
      num(summary.mangaOcrProductCer),
      num(summary.mangaOcrBestCer),
    ];
    return values.map((value, index) => pad(value, columns[index]![1])).join("");
  });
  const { summary, checks, thresholds } = report;
  const lines = [
    header,
    ...rows,
    "送译为送去翻译的字错率。产品为流水线所用转角，最佳为四向里最低。",
    "单、并、拆、漏是单块、合并、拆开、未中。未中不计入书写方向和句子旋转。",
    `检测召回 ${ratio(summary.detectionRecall)}  检测精度 ${ratio(summary.detectionPrecision)}`,
    `横向字错率 ${ratio(summary.horizontalCer)}  纵向字错率 ${ratio(summary.verticalCer)}  同句最大差 ${summary.worstVerticalGap === null ? "—" : ratio(summary.worstVerticalGap)}`,
    `逐行所选旋转为四向最佳 ${ratio(summary.rotationBestShare)}`,
    `句子所选旋转为该引擎四向最佳 ${ratio(summary.sentenceRotationBestShare)}`,
    `书写方向准确率 ${ratio(summary.writingModeAccuracy)}  行序准确率 ${ratio(summary.lineOrderAccuracy)}`,
    `扣字掩膜内MAE ${summary.meanMaskedMae.toFixed(2)}  膨胀掩膜外变化像素 ${summary.meanChangesOutside.toFixed(1)}  文字残留 ${ratio(summary.meanStrongResidual)}`,
    `误检 ${summary.falsePositiveCount}（气泡 ${summary.falsePositivesOnBubble}，纹理或噪声 ${summary.falsePositivesOnTextureOrNoise}，白纸 ${summary.falsePositivesOnPlainPaper}）`,
    `掩膜外变化归属：命中区域 ${summary.meanDamageInsideMatched.toFixed(1)}，误检区域 ${summary.meanDamageInsideFalsePositive.toFixed(1)}，区域外 ${summary.meanDamageOutsideRegions.toFixed(1)}；膜式填充 ${summary.meanDamageMembrane.toFixed(1)}，修补 ${summary.meanDamageInpaint.toFixed(1)}`,
    `横穿气泡的拟声词 ${summary.sfxMarks} 个：并进对白区域的行 ${summary.sfxAbsorbedLines}，单独成区送译 ${summary.sfxTranslatedRegions}、保留 ${summary.sfxKeptRegions}，被改动的像素 ${ratio(summary.sfxDamageShare)}`,
    `纵向字错率不超过横向 ${thresholds.verticalCerGapLimit}：${mark(checks.verticalCer)}`,
    `逐行所选旋转至少 ${thresholds.rotationBestShareMin}：${mark(checks.lineRotation)}`,
    `句子所选旋转至少 ${thresholds.sentenceRotationBestShareMin}：${mark(checks.sentenceRotation)}`,
    `书写方向准确率至少 ${thresholds.writingModeAccuracyMin}：${mark(checks.writingMode)}`,
    `行序准确率至少 ${thresholds.lineOrderAccuracyMin}：${mark(checks.lineOrder)}`,
    `总评：${mark(report.passed)}`,
  ];
  return lines.join("\n");
};
