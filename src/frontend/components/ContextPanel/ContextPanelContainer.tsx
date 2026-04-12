import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContextTerm, OcrPageLines } from "../../api/index.ts";
import {
  enqueueContext,
  fetchAllOcrPageLines,
  fetchContextJobStatus,
  fetchContextTerms,
  saveContextTerms,
} from "../../api/index.ts";
import { useTranslation } from "react-i18next";
import ContextPanelView from "./ContextPanelView.tsx";

export interface ContextPanelProps {
  uploadId: string;
  onSelectPage?: (pageIndex: number) => void;
}

const POLL_INTERVAL_MS = 2000;

const ContextPanelContainer: React.FC<ContextPanelProps> = ({ uploadId, onSelectPage }) => {
  const { t } = useTranslation();
  const [terms, setTerms] = useState<ContextTerm[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [chunkProgress, setChunkProgress] = useState<{ completed: number; total: number } | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [newTerm, setNewTerm] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("中文");
  const [ocrPages, setOcrPages] = useState<OcrPageLines[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load terms on mount
  useEffect(() => {
    fetchContextTerms(uploadId).then(setTerms).catch(() => {});
    fetchContextJobStatus(uploadId).then((r) => {
      if (r.status === "Queued" || r.status === "Processing") {
        setIsDetecting(true);
        if (r.chunksCompleted !== null && r.chunksTotal !== null) {
          setChunkProgress({ completed: r.chunksCompleted, total: r.chunksTotal });
        }
      }
    }).catch(() => {});
    fetchAllOcrPageLines(uploadId).then(setOcrPages).catch(() => {});
  }, [uploadId]);

  // Map each term to the first page index (0-based) where it appears in OCR
  const termPageMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const page of ocrPages) {
      const pageText = page.lines.map((l) => l.text).join("\n");
      for (const entry of terms) {
        if (!(entry.term in map) && pageText.includes(entry.term)) {
          map[entry.term] = page.pageNumber - 1;
        }
      }
    }
    return map;
  }, [ocrPages, terms]);

  // Poll while detecting
  useEffect(() => {
    if (!isDetecting) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    const poll = async () => {
      try {
        const status = await fetchContextJobStatus(uploadId);
        if (status.chunksCompleted !== null && status.chunksTotal !== null) {
          setChunkProgress({ completed: status.chunksCompleted, total: status.chunksTotal });
        }
        if (status.status === "Completed") {
          setIsDetecting(false);
          setChunkProgress(null);
          const updated = await fetchContextTerms(uploadId);
          setTerms(updated);
          fetchAllOcrPageLines(uploadId).then(setOcrPages).catch(() => {});
        } else if (status.status === "Ready") {
          setIsDetecting(false);
          setChunkProgress(null);
        }
      } catch {
        // swallow
      }
    };
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isDetecting, uploadId]);

  const handleDetect = useCallback(async () => {
    try {
      await enqueueContext(uploadId, { targetLanguage: targetLanguage.trim() || undefined });
      setIsDetecting(true);
      setChunkProgress(null);
    } catch {
      // swallow
    }
  }, [uploadId, targetLanguage]);

  const handleContextChange = useCallback(
    (index: number, value: string) => {
      setTerms((prev) => {
        const next = prev.map((t, i) => (i === index ? { ...t, context: value } : t));
        if (pendingSaveRef.current) clearTimeout(pendingSaveRef.current);
        pendingSaveRef.current = setTimeout(() => {
          setSaveState("saving");
          saveContextTerms(uploadId, next)
            .then(() => {
              setSaveState("saved");
              setTimeout(() => setSaveState("idle"), 1500);
            })
            .catch(() => setSaveState("idle"));
        }, 700);
        return next;
      });
    },
    [uploadId],
  );

  const handleDelete = useCallback(
    (index: number) => {
      setTerms((prev) => {
        const next = prev.filter((_, i) => i !== index);
        saveContextTerms(uploadId, next).catch(() => {});
        return next;
      });
    },
    [uploadId],
  );

  const handleAddTerm = useCallback(() => {
    const trimmed = newTerm.trim();
    if (!trimmed) return;
    setTerms((prev) => {
      if (prev.some((t) => t.term === trimmed)) return prev;
      const next = [...prev, { term: trimmed, context: "" }];
      saveContextTerms(uploadId, next).catch(() => {});
      return next;
    });
    setNewTerm("");
  }, [newTerm, uploadId]);

  const saveIndicator =
    saveState === "saving"
      ? t("contextPanel.saving")
      : saveState === "saved"
      ? t("contextPanel.saved")
      : null;

  return (
    <ContextPanelView
      terms={terms}
      termPageMap={termPageMap}
      isDetecting={isDetecting}
      chunkProgress={chunkProgress}
      saveIndicator={saveIndicator}
      targetLanguage={targetLanguage}
      newTerm={newTerm}
      onTargetLanguageChange={setTargetLanguage}
      onNewTermChange={setNewTerm}
      onDetect={handleDetect}
      onAddTerm={handleAddTerm}
      onContextChange={handleContextChange}
      onDelete={handleDelete}
      onSelectPage={onSelectPage}
    />
  );
};

export default memo(ContextPanelContainer);
