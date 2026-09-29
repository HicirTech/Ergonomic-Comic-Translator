/** A dropped or picked file with its path inside a dropped folder ("ch1/001.jpg"), or its name. */
export interface DroppedFile {
  file: File;
  path: string;
}

const readAllEntries = async (directory: FileSystemDirectoryEntry) => {
  const reader = directory.createReader();
  const entries: FileSystemEntry[] = [];
  // readEntries returns at most about 100 entries per call; an empty batch means the end.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
};

const walk = async (entry: FileSystemEntry, prefix: string, found: DroppedFile[]) => {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    found.push({ file, path: `${prefix}${entry.name}` });
  } else if (entry.isDirectory) {
    for (const child of await readAllEntries(entry as FileSystemDirectoryEntry)) {
      await walk(child, `${prefix}${entry.name}/`, found);
    }
  }
};

/** Files of a drop, descending into dropped folders. */
export const collectDroppedFiles = async (transfer: DataTransfer): Promise<DroppedFile[]> => {
  // Entries must be taken synchronously: the DataTransfer is emptied once the event handler yields.
  const entries = [...transfer.items].map((item) => item.webkitGetAsEntry()).filter((entry): entry is FileSystemEntry => entry !== null);
  const found: DroppedFile[] = [];
  for (const entry of entries) await walk(entry, "", found);
  return found;
};

/** Files from an <input type="file">, using the folder path when a folder was picked. */
export const pickedFiles = (files: FileList): DroppedFile[] =>
  [...files].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
