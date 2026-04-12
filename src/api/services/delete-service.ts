import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import {
  apiUploadsRootDir,
  ocrOutputRootDir,
  ocrPrepareRootDir,
  ocrQueueFile,
  textlessQueueFile,
  textlessRootDir,
  translateQueueFile,
  translatedRootDir,
  uploadRecordsFile,
} from "../../config.ts";

/** Remove all on-disk data and queue entries for a given uploadId. */
export const deleteUpload = async (uploadId: string): Promise<void> => {
  // ── 1. Delete directories ────────────────────────────────────────────────
  const dirsToRemove = [
    join(apiUploadsRootDir, uploadId),
    join(ocrPrepareRootDir, uploadId),
    join(ocrOutputRootDir, uploadId),
    join(textlessRootDir, uploadId),
    join(translatedRootDir, uploadId),
  ];

  for (const dir of dirsToRemove) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }

  // ── 2. Purge from JSON queue / record files ──────────────────────────────
  const jsonFilesToPurge = [
    uploadRecordsFile,
    ocrQueueFile,
    textlessQueueFile,
    translateQueueFile,
  ];

  for (const filePath of jsonFilesToPurge) {
    if (!existsSync(filePath)) continue;
    const raw = readFileSync(filePath, "utf8").trim();
    if (!raw) continue;
    const entries = JSON.parse(raw) as Array<{ uploadId: string }>;
    const filtered = entries.filter((e) => e.uploadId !== uploadId);
    if (filtered.length !== entries.length) {
      writeFileSync(filePath, JSON.stringify(filtered, null, 2), "utf8");
    }
  }
};
