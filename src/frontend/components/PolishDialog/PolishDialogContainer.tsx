import React, { useState } from "react";
import { enqueuePolish, fetchPolishJobStatus } from "../../api/index.ts";
import PolishDialogView from "./PolishDialogView.tsx";

export interface PolishDialogProps {
  open: boolean;
  uploadId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const PolishDialogContainer: React.FC<PolishDialogProps> = ({
  open,
  uploadId,
  onClose,
  onSuccess,
}) => {
  const [model, setModel] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("Chinese");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setProgress(null);
    try {
      const opts = {
        targetLanguage: targetLanguage.trim() || "Chinese",
        model: model.trim() || undefined,
      };

      await enqueuePolish(uploadId, opts);

      let polling = true;
      while (polling) {
        await new Promise((r) => setTimeout(r, 1500));
        const status = await fetchPolishJobStatus(uploadId);
        if (status.pageStatuses.length > 0) {
          if (status.pagesDone !== null && status.pagesTotal !== null && status.pagesTotal > 0) {
            setProgress({ current: status.pagesDone, total: status.pagesTotal });
          }
        }
        if (status.status !== "Queued" && status.status !== "Processing") polling = false;
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error("[polish-dialog]", err);
    } finally {
      setIsSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <PolishDialogView
      open={open}
      isSubmitting={isSubmitting}
      progress={progress}
      model={model}
      targetLanguage={targetLanguage}
      onModelChange={setModel}
      onTargetLanguageChange={setTargetLanguage}
      onConfirm={() => { void handleConfirm(); }}
      onClose={onClose}
    />
  );
};

export default PolishDialogContainer;
