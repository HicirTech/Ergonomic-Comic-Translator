import React, { useCallback, useRef, useState } from "react";
import { ApiError, uploadVolume } from "../../api/index.ts";
import type { ImportResult } from "../../../server/interfaces/import-result.ts";
import { collectDroppedFiles, pickedFiles, type DroppedFile } from "../../reader/collect-dropped-files.ts";
import DropZoneView from "./DropZoneView.tsx";

export interface DropZoneProps {
  onImported: (result: ImportResult) => void;
}

const DropZoneContainer: React.FC<DropZoneProps> = ({ onImported }) => {
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [errorZh, setErrorZh] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (files: DroppedFile[]) => {
    if (files.length === 0) return;
    setImporting(true);
    setErrorZh(null);
    try {
      onImported(await uploadVolume(files));
    } catch (error) {
      setErrorZh(error instanceof ApiError ? error.messageZh : String(error));
    } finally {
      setImporting(false);
    }
  }, [onImported]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!importing) void collectDroppedFiles(event.dataTransfer).then(upload);
  }, [importing, upload]);

  const onPicked = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? pickedFiles(event.target.files) : [];
    // Reset so picking the same file again still fires a change.
    event.target.value = "";
    void upload(files);
  }, [upload]);

  return (
    <DropZoneView
      dragging={dragging}
      importing={importing}
      errorZh={errorZh}
      fileInput={fileInput}
      folderInput={folderInput}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onPicked={onPicked}
    />
  );
};

export default DropZoneContainer;
