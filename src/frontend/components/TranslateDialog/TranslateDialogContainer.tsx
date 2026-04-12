import React, { useState } from "react";
import { enqueueTranslation, enqueueTranslationPage, fetchTranslationJobStatus } from "../../api/index.ts";
import TranslateDialogView, { type TranslateScope } from "./TranslateDialogView.tsx";

export interface TranslateDialogProps {
  open: boolean;
  uploadId: string;
  /** 0-based current page index, used when scope is "page" */
  pageIndex: number;
  /** If "page", scope selector is hidden and only this page is translated */
  initialScope: TranslateScope;
  onClose: () => void;
  onSuccess: () => void;
}

const TranslateDialogContainer: React.FC<TranslateDialogProps> = ({
  open,
  uploadId,
  pageIndex,
  initialScope,
  onClose,
  onSuccess,
}) => {
  const [model, setModel] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("Chinese");
  const [scope, setScope] = useState<TranslateScope>(initialScope === "page" ? "all" : initialScope);
  const [pagesInput, setPagesInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

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
    try {
      const opts = {
        targetLanguage: targetLanguage.trim() || "Chinese",
        model: model.trim() || undefined,
      };

      const effectiveScope = initialScope === "page" ? "page" : scope;

      if (effectiveScope === "page") {
        const targetPage = pageIndex + 1;
        await enqueueTranslationPage(uploadId, targetPage, opts);
        let polling = true;
        while (polling) {
          await new Promise((r) => setTimeout(r, 1500));
          const status = await fetchTranslationJobStatus(uploadId);
          const pageStatus = status.pageStatuses.find((p) => p.pageNumber === targetPage)?.status;
          const done = pageStatus === "completed" || pageStatus === "failed";
          if (done) setProgress({ current: 1, total: 1 });
          if (status.status !== "Queued" && status.status !== "Processing") polling = false;
        }
      } else if (effectiveScope === "specific") {
        const targetPages = parsePages(pagesInput);
        for (let i = 0; i < targetPages.length; i++) {
          await enqueueTranslationPage(uploadId, targetPages[i], opts);
          setProgress({ current: i + 1, total: targetPages.length });
        }
        // wait for all to finish
        let polling = true;
        while (polling) {
          await new Promise((r) => setTimeout(r, 1500));
          const status = await fetchTranslationJobStatus(uploadId);
          const pageStatusMap = new Map(status.pageStatuses.map((p) => [p.pageNumber, p.status] as const));
          const done = targetPages.filter((p) => {
            const s = pageStatusMap.get(p);
            return s === "completed" || s === "failed";
          }).length;
          setProgress({ current: done, total: targetPages.length });
          if (status.status !== "Queued" && status.status !== "Processing") polling = false;
        }
      } else {
        await enqueueTranslation(uploadId, opts);
        let polling = true;
        while (polling) {
          await new Promise((r) => setTimeout(r, 1500));
          const status = await fetchTranslationJobStatus(uploadId);
          if (status.pageStatuses.length > 0) {
            if (status.pagesDone !== null && status.pagesTotal !== null && status.pagesTotal > 0) {
              setProgress({ current: status.pagesDone, total: status.pagesTotal });
            }
          }
          if (status.status !== "Queued" && status.status !== "Processing") polling = false;
        }
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error("[translate-dialog]", err);
    } finally {
      setIsSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <TranslateDialogView
      open={open}
      isSubmitting={isSubmitting}
      progress={progress}
      initialScope={initialScope}
      model={model}
      targetLanguage={targetLanguage}
      scope={scope}
      pagesInput={pagesInput}
      onModelChange={setModel}
      onTargetLanguageChange={setTargetLanguage}
      onScopeChange={setScope}
      onPagesInputChange={setPagesInput}
      onConfirm={() => { void handleConfirm(); }}
      onClose={onClose}
    />
  );
};

export default TranslateDialogContainer;
