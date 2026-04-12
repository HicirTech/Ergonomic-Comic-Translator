import { existsSync, mkdirSync, readFileSync } from "fs";
import { basename, resolve } from "path";
import { textlessRootDir } from "../../config.ts";
import { resolveOutputFileForScope } from "../../ocr/runtime-context.ts";
import type { OcrOutput } from "../../ocr/interfaces";
import { runTextCleaner } from "../../scripts/python-run.ts";

export const resolveTextlessDir = (scope: string) =>
  resolve(textlessRootDir, scope);

export interface TextlessPageInput {
  pageNumber: number;
  fileName: string;
  filePath: string;
}

export interface TextlessPageResult {
  pageNumber: number;
  fileName: string;
  success: boolean;
  error: string | null;
}

export const loadOcrOutput = (scope: string): OcrOutput | null => {
  const ocrFile = resolveOutputFileForScope(scope);
  if (!existsSync(ocrFile)) {
    return null;
  }
  return JSON.parse(readFileSync(ocrFile, "utf8")) as OcrOutput;
};

export const processTextlessPage = async (
  page: TextlessPageInput,
  outputDir: string,
  scope: string,
): Promise<TextlessPageResult> => {
  if (!existsSync(page.filePath)) {
    return {
      pageNumber: page.pageNumber,
      fileName: page.fileName,
      success: false,
      error: `Source image not found: ${page.filePath}`,
    };
  }

  const ocrJsonPath = resolveOutputFileForScope(scope);
  if (!existsSync(ocrJsonPath)) {
    return {
      pageNumber: page.pageNumber,
      fileName: page.fileName,
      success: false,
      error: `OCR output not found: ${ocrJsonPath}`,
    };
  }

  const outputFileName = basename(page.filePath);
  const outputPath = resolve(outputDir, outputFileName);
  mkdirSync(outputDir, { recursive: true });

  try {
    const result = await runTextCleaner({
      imagePath: page.filePath,
      ocrJsonPath,
      pageNumber: page.pageNumber,
      outputPath,
    });

    if (!result.success) {
      return {
        pageNumber: page.pageNumber,
        fileName: page.fileName,
        success: false,
        error: result.error ?? "Text cleaner returned failure",
      };
    }

    return {
      pageNumber: page.pageNumber,
      fileName: page.fileName,
      success: true,
      error: null,
    };
  } catch (error) {
    return {
      pageNumber: page.pageNumber,
      fileName: page.fileName,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
