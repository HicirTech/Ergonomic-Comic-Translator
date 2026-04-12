import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { type UploadBatch, getUploadCoverUrl } from "../../api/index.ts";
import DeleteConfirmDialog from "../DeleteConfirmDialog/index.tsx";
import UploadCardView from "./UploadCardView.tsx";

export interface UploadCardProps {
  batch: UploadBatch;
  onDeleted: () => void;
}

const UploadCardContainer: React.FC<UploadCardProps> = ({ batch, onDeleted }) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [hasCoverError, setHasCoverError] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const coverUrl = getUploadCoverUrl(batch.uploadId);
  // Prefer prepared page count (accurate for PDFs/ZIPs); fall back to loose upload records
  const fileCount =
    batch.pageCount ?? batch.records.filter((r) => r.sourceType !== "zip").length;
  const displayDate = new Intl.DateTimeFormat(i18n.language, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(batch.createdAt));

  const handleClick = () => navigate(`/upload/${batch.uploadId}`);
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteOpen(true);
  };

  return (
    <>
      <UploadCardView
        uploadId={batch.uploadId}
        coverUrl={coverUrl}
        displayDate={displayDate}
        fileCount={fileCount}
        filesLabel={t("uploadCard.files", { count: fileCount })}
        deleteLabel={t("uploadCard.delete")}
        hasCoverError={hasCoverError}
        onCoverError={() => setHasCoverError(true)}
        onClick={handleClick}
        onDeleteClick={handleDeleteClick}
      />
      <DeleteConfirmDialog
        open={deleteOpen}
        uploadId={batch.uploadId}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => { setDeleteOpen(false); onDeleted(); }}
      />
    </>
  );
};

export default UploadCardContainer;
