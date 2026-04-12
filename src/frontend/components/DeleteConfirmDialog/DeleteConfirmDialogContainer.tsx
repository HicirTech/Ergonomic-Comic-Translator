import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { deleteUpload } from "../../api/index.ts";
import DeleteConfirmDialogView from "./DeleteConfirmDialogView.tsx";

export interface DeleteConfirmDialogProps {
  open: boolean;
  uploadId: string;
  onClose: () => void;
  onDeleted: () => void;
}

const DeleteConfirmDialogContainer: React.FC<DeleteConfirmDialogProps> = ({
  open,
  uploadId,
  onClose,
  onDeleted,
}) => {
  const { t } = useTranslation();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await deleteUpload(uploadId);
      onDeleted();
    } catch (err) {
      console.error("[delete]", err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <DeleteConfirmDialogView
      open={open}
      isDeleting={isDeleting}
      titleLabel={t("uploadCard.deleteConfirmTitle")}
      bodyLabel={t("uploadCard.deleteConfirmBody")}
      cancelLabel={t("common.cancel")}
      confirmLabel={isDeleting ? t("uploadCard.deleting") : t("uploadCard.delete")}
      onClose={onClose}
      onConfirm={() => { void handleConfirm(); }}
    />
  );
};

export default DeleteConfirmDialogContainer;
