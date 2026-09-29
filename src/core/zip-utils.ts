import { unzipSync, type UnzipFileFilter } from "fflate";

export interface ExtractedZipEntry {
  name: string;
  data: Uint8Array;
}

/** `filter` sees each entry's name and sizes before it is inflated; it may throw to reject the archive. */
export const extractZipEntries = async (file: Blob, filter?: UnzipFileFilter): Promise<ExtractedZipEntry[]> => {
  const archiveBytes = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(archiveBytes, filter ? { filter } : undefined);

  return Object.entries(entries)
    .filter(([name]) => !name.endsWith("/"))
    .map(([name, data]) => ({ name, data }));
};
