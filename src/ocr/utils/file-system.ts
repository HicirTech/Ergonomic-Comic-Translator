import { mkdirSync, readdirSync, readFileSync } from "fs";
import { extname, resolve } from "path";
import type { OcrOutput } from "../interfaces";
import { supportedExtensions } from "../runtime-context.ts";

export const collectInputFiles = (dir: string): string[] => {
  const items = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const item of items) {
    const fullPath = resolve(dir, item.name);

    if (item.isDirectory()) {
      files.push(...collectInputFiles(fullPath));
      continue;
    }

    if (item.isFile() && supportedExtensions.has(extname(item.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files.sort();
};

export const ensureDirectory = (filePath: string) => {
  mkdirSync(resolve(filePath, ".."), { recursive: true });
};

export const readOcrOutput = (filePath: string): OcrOutput => JSON.parse(readFileSync(filePath, "utf8")) as OcrOutput;
