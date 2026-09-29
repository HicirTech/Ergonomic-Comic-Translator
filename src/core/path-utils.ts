import { existsSync } from "fs";
import { basename, dirname, extname, join, resolve } from "path";

const invalidSegmentPattern = /[<>:"|?*\x00-\x1F]/g;

export const sanitizePathSegment = (value: string) => {
  const sanitized = value
    .replace(/[\\/]+/g, "-")
    .replace(invalidSegmentPattern, "-")
    .trim();

  return sanitized || "file";
};

export const sanitizeFileName = (value: string) => sanitizePathSegment(basename(value));

export const sanitizeArchiveEntryPath = (entryPath: string) => {
  const parts = entryPath
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== "." && part !== "..")
    .map((part) => sanitizePathSegment(part));

  return parts.length > 0 ? parts.join("/") : null;
};

export const hasSupportedExtension = (fileName: string, extensions: readonly string[]) => (
  extensions.includes(extname(fileName).toLowerCase() as (typeof extensions)[number])
);

export const buildUniqueFilePath = (rootDir: string, relativePath: string) => {
  const safeRelativePath = relativePath.replace(/\\/g, "/");
  const targetDir = resolve(rootDir, dirname(safeRelativePath));
  const extension = extname(safeRelativePath);
  const baseName = basename(safeRelativePath, extension);

  let candidateName = `${baseName}${extension}`;
  let candidatePath = resolve(targetDir, candidateName);
  let counter = 1;

  while (existsSync(candidatePath)) {
    candidateName = `${baseName}-${counter}${extension}`;
    candidatePath = resolve(targetDir, candidateName);
    counter += 1;
  }

  return {
    absolutePath: candidatePath,
    relativePath: join(dirname(safeRelativePath), candidateName),
    storedName: candidateName,
  };
};
