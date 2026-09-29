import { mkdirSync, renameSync, writeFileSync } from "fs";
import { dirname } from "path";

/**
 * Writes to a temporary file next to `path` and renames it into place, so a reader or a crash never
 * sees half a file. Creates the parent folder when needed.
 */
export const writeFileAtomically = (path: string, data: string | Uint8Array) => {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, data);
  renameSync(temporary, path);
};
