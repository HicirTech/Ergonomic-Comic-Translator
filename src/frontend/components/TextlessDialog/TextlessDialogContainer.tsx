import React, { useState } from "react";
import { enqueueTextless, enqueueTextlessPage, fetchTextlessJobStatus } from "../../api/index.ts";
import TextlessDialogView, { type PageScope } from "./TextlessDialogView.tsx";

export interface TextlessDialogProps {
  open: boolean;
  uploadId: string;
  onClose: () => void;
  onSuccess: () => void;
  onBeforeStart?: () => Promise<void>;
}

const TextlessDialogContainer: React.FC<TextlessDialogProps> = ({
  open,
  uploadId,
  onClose,
  onSuccess,
  onBeforeStart,
}) => {
  const [pageScope, setPageScope] = useState<PageScope>("all");
  const [pagesInput, setPagesInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsePages = (input: string): number[] => {
    const raw = input.split(",").map((s) => s.trim()).filter(Boolean);
    const pages: number[] = [];
    for (const token of raw) {
      const n = parseInt(token, 10);
      if (Number.isFinite(n) && n >= 1) pages.push(n);
    }
    return [...new Set(pages)].sort((a, b) => a - b);
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setProgress(null);
    setErrorMessage(null);
    try {
      await onBeforeStart?.();
      const targetPages = pageScope === "all" ? null : parsePages(pagesInput);
      if (pageScope === "all") {
        await enqueueTextless(uploadId);
      } else {
        for (const page of targetPages!) {
          await enqueueTextlessPage(uploadId, page);
        }
      }

      let lastError: string | null = null;
      let polling = true;
      while (polling) {
        await new Promise((r) => setTimeout(r, 1500));
        const status = await fetchTextlessJobStatus(uploadId);

        if (status.pageStatuses.length > 0) {
          if (targetPages === null) {
            if (status.pagesDone !== null && status.pagesTotal !== null && status.pagesTotal > 0) {
              setProgress({ current: status.pagesDone, total: status.pagesTotal });
            }
          } else {
            const pageStatusMap = new Map(status.pageStatuses.map((p) => [p.pageNumber, p.status] as const));
            const done = targetPages.filter((p) => {
              const s = pageStatusMap.get(p);
              return s === "completed" || s === "failed";
            }).length;
            setProgress({ current: done, total: targetPages.length || 1 });
          }
        }

        if (status.status !== "Queued" && status.status !== "Processing") {
          lastError = status.lastError;
          polling = false;
        }
      }

      if (lastError) {
        setErrorMessage(lastError);
        onSuccess();
        return;
      }
      onSuccess();
      onClose();
    } catch (err) {
      console.error("[textless-dialog]", err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <TextlessDialogView
      open={open}
      isSubmitting={isSubmitting}
      progress={progress}
      errorMessage={errorMessage}
      pageScope={pageScope}
      pagesInput={pagesInput}
      onPageScopeChange={setPageScope}
      onPagesInputChange={setPagesInput}
      onConfirm={() => { void handleConfirm(); }}
      onClose={onClose}
    />
  );
};

export default TextlessDialogContainer;
