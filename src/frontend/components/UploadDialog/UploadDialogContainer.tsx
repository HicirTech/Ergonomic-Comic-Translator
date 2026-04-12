import React, { useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useTranslation } from "react-i18next";
import { uploadFiles } from "../../api/index.ts";
import UploadDialogView, { type FileItem } from "./UploadDialogView.tsx";

export interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (uploadId: string) => void;
}

const detectTypeLabel = (
  file: File,
  t: (key: string) => string,
): string => {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))
    return t("uploadDialog.detectPdf");
  if (file.type.startsWith("image/")) return t("uploadDialog.detectImage");
  if (
    file.name.toLowerCase().endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  )
    return t("uploadDialog.detectZip");
  return t("uploadDialog.detectUnknown");
};

const toFileItems = (files: File[], t: (key: string) => string): FileItem[] =>
  files.map((file) => ({
    id: `${file.name}-${file.size}-${file.lastModified}`,
    file,
    typeLabel: detectTypeLabel(file, t),
  }));

const UploadDialogContainer: React.FC<UploadDialogProps> = ({ open, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const addFiles = (incoming: FileList | File[]) => {
    const newEntries = toFileItems(Array.from(incoming), t);
    setFileItems((prev) => {
      const existingIds = new Set(prev.map((fi) => fi.id));
      return [...prev, ...newEntries.filter((fi) => !existingIds.has(fi.id))];
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const handleBrowse = () => fileInputRef.current?.click();

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = "";
  };

  const handleRemoveFile = (id: string) =>
    setFileItems((prev) => prev.filter((fi) => fi.id !== id));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFileItems((items) => {
        const oldIndex = items.findIndex((fi) => fi.id === active.id);
        const newIndex = items.findIndex((fi) => fi.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleClose = () => {
    setFileItems([]);
    setIsDragOver(false);
    setUploadError(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (fileItems.length === 0) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const result = await uploadFiles(fileItems.map((fi) => fi.file));
      setFileItems([]);
      onSuccess(result.uploadId);
    } catch (err) {
      console.error("[upload]", err);
      setUploadError(err instanceof Error ? err.message : t("uploadDialog.uploadError"));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <UploadDialogView
        open={open}
        fileItems={fileItems}
        isDragOver={isDragOver}
        isUploading={isUploading}
        uploadError={uploadError}
        titleLabel={t("uploadDialog.title")}
        dropzoneLabel={t("uploadDialog.dropzoneLabel")}
        dropzoneDescLabel={t("uploadDialog.dropzoneDesc")}
        browseLabel={t("uploadDialog.browse")}
        uploadLabel={t("uploadDialog.upload")}
        cancelLabel={t("common.cancel")}
        fileCountLabel={t("uploadDialog.fileCount", { count: fileItems.length })}
        onClose={handleClose}
        onConfirm={() => { void handleConfirm(); }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onBrowse={handleBrowse}
        onRemoveFile={handleRemoveFile}
        fileInputRef={fileInputRef}
        onFileInputChange={handleFileInputChange}
      />
    </DndContext>
  );
};

export default UploadDialogContainer;
