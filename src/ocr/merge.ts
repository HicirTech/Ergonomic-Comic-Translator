import { getLogger } from "../logger.ts";
import type { CompletedOcrJob, OcrOutput, OcrPage } from "./interfaces";
import { ocrRuntimeConfig, sourceName } from "./runtime-context.ts";
import { sortOcrResults } from "./utils";

export const mergeOcrOutputs = (results: CompletedOcrJob[]): OcrOutput => {
  const logger = getLogger("merge");
  const sortedResults = sortOcrResults(results);

  const baseOutput = sortedResults[0]?.output;
  const pages: OcrPage[] = [];

  for (const result of sortedResults) {
    for (const outputPage of result.output.pages) {
      pages.push({
        ...outputPage,
        pageNumber: pages.length + 1,
        // fileName reflects the source document (e.g. "pdf.pdf") for display purposes,
        // but filePath must remain the actual rendered page image (PNG) so that
        // downstream consumers like textless can read the correct file.
        fileName: result.job.sourceFileName,
      });
    }
  }

  const totalLines = pages.reduce((sum, page) => sum + page.lines.length, 0);
  logger.debug(`Merged ${results.length} result(s) into ${pages.length} page(s) with ${totalLines} total line(s).`);

  return {
    source: baseOutput?.source ?? sourceName,
    ocrEngine: baseOutput?.ocrEngine ?? "",
    ocrModel: baseOutput?.ocrModel ?? "",
    language: baseOutput?.language ?? ocrRuntimeConfig.language,
    device: baseOutput?.device ?? ocrRuntimeConfig.device,
    generatedAt: new Date().toISOString(),
    pageCount: pages.length,
    pages,
  };
};
