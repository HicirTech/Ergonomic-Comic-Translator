import React, { useEffect, useState } from "react";
import { enqueueOcr, enqueueOcrPage, fetchOcrConfig, fetchOcrJobStatus } from "../../api/index.ts";
import OcrDialogView, { type PageScope } from "./OcrDialogView.tsx";

export interface OcrDialogProps {
  open: boolean;
  uploadId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const OcrDialogContainer: React.FC<OcrDialogProps> = ({
  open,
  uploadId,
  onClose,
  onSuccess,
}) => {
  const [supportedModels, setSupportedModels] = useState<string[]>(["paddleocr", "paddleocr-vl-1.5"]);
  const [language, setLanguage] = useState("japan");
  const [model, setModel] = useState("paddleocr-vl-1.5");
  const [pageScope, setPageScope] = useState<PageScope>("all");
  const [pagesInput, setPagesInput] = useState("");
  const [force, setForce] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch OCR config when dialog opens
  useEffect(() => {
    if (!open) return;
    fetchOcrConfig()
      .then((cfg) => {
        setSupportedModels(cfg.supportedModels);
        setLanguage(cfg.currentLanguage);
        setModel(cfg.currentModel);
      })
      .catch(console.error);
  }, [open]);

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
      if (pageScope === "all") {
        await enqueueOcr(uploadId, { model, force, language });
        // Poll until the job leaves Processing/Queued; update progress from backend
        let lastError: string | null = null;
        let polling = true;
        while (polling) {
          await new Promise((r) => setTimeout(r, 1500));
          const result = await fetchOcrJobStatus(uploadId);
          if (result.pagesCompleted !== null && result.pagesTotal !== null && result.pagesTotal > 0) {
            setProgress({ current: result.pagesCompleted, total: result.pagesTotal });
          }
          if (result.status !== "Processing" && result.status !== "Queued") {
            lastError = result.lastError;
            polling = false;
          }
        }
        if (lastError) {
          setErrorMessage(lastError);
          return;
        }
      } else {
        const pages = parsePages(pagesInput);
        setProgress({ current: 0, total: pages.length });
        for (let i = 0; i < pages.length; i++) {
          await enqueueOcrPage(uploadId, pages[i], model, language);
          setProgress({ current: i + 1, total: pages.length });
        }
      }
      onSuccess();
      onClose();
    } catch (err) {
      console.error("[ocr-dialog]", err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <OcrDialogView
      open={open}
      isSubmitting={isSubmitting}
      progress={progress}
      errorMessage={errorMessage}
      supportedModels={supportedModels}
      language={language}
      model={model}
      pageScope={pageScope}
      pagesInput={pagesInput}
      force={force}
      onModelChange={setModel}
      onLanguageChange={setLanguage}
      onPageScopeChange={setPageScope}
      onPagesInputChange={setPagesInput}
      onForceChange={setForce}
      onConfirm={() => { void handleConfirm(); }}
      onClose={onClose}
    />
  );
};

export default OcrDialogContainer;
