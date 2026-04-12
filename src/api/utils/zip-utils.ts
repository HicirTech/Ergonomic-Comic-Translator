import { unzipSync } from "fflate";

export interface ExtractedZipEntry {
  name: string;
  data: Uint8Array;
}

export const extractZipEntries = async (file: File): Promise<ExtractedZipEntry[]> => {
  const archiveBytes = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(archiveBytes);

  return Object.entries(entries)
    .filter(([name]) => !name.endsWith("/"))
    .map(([name, data]) => ({ name, data }));
};
