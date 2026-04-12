import { extname } from "path";
import type { CompletedOcrJob, OcrOutput, PreparedOcrJob } from "../interfaces";

export const isPdfInput = (filePath: string) => extname(filePath).toLowerCase() === ".pdf";

export const sortOcrResults = (results: CompletedOcrJob[]): CompletedOcrJob[] =>
  [...results].sort((left, right) =>
    left.job.sourceIndex !== right.job.sourceIndex
      ? left.job.sourceIndex - right.job.sourceIndex
      : left.job.sourcePageNumber - right.job.sourcePageNumber,
  );

export const formatJobLabel = (job: PreparedOcrJob) => (
  job.sourceType === "pdf"
    ? `${job.sourceFileName} [page ${job.sourcePageNumber}/${job.sourcePageCount}]`
    : job.sourceFileName
);

export const formatDuration = (durationMs: number) => `${(durationMs / 1000).toFixed(1)}s`;

export const countOutputLines = (output: OcrOutput) => output.pages.reduce((sum, page) => sum + page.lines.length, 0);
