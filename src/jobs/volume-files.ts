import { join } from "path";
import type { DataPaths } from "../core/data-paths.ts";

const pageName = (ordinal: number) => String(ordinal).padStart(4, "0");

/** Where a volume's stage outputs live under the data directory. */
export const volumeFiles = (paths: DataPaths, volumeId: string) => {
  const root = join(paths.volumes, volumeId);
  return {
    root,
    work: join(root, "work"),
    vision: (ordinal: number) => join(root, "vision", `${pageName(ordinal)}.json`),
    /** Page texts in reading order plus the language and direction they were built with. */
    text: join(root, "text.json"),
    glossary: join(root, "glossary.json"),
    translation: (ordinal: number) => join(root, "translations", `${pageName(ordinal)}.json`),
    output: (ordinal: number) => join(root, "output", `${pageName(ordinal)}.png`),
    cbz: join(root, "export", "volume.cbz"),
    pdf: join(root, "export", "volume.pdf"),
  };
};

export type VolumeFiles = ReturnType<typeof volumeFiles>;
