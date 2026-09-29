import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiError, cancelVolume, exportUrl, fetchVolume, pageImageUrl, startVolume, useServerEvents } from "../../api/index.ts";
import type { VolumeDetail } from "../../../server/interfaces/volume-detail.ts";
import { pageStep } from "../../reader/page-step.ts";
import VolumePageView from "./VolumePageView.tsx";

/** Task events arrive quickly while a volume runs; the page list is refreshed at most this often. */
const refreshDelayMs = 700;

const VolumePageContainer: React.FC = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [volume, setVolume] = useState<VolumeDetail | null>(null);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"translated" | "original">("translated");
  const [stepZh, setStepZh] = useState<string | null>(null);
  const [modelsMessageZh, setModelsMessageZh] = useState<string | null>(null);
  const [errorZh, setErrorZh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A re-rendered page keeps its URL; the version makes the browser fetch it again.
  const [versions, setVersions] = useState<Record<number, number>>({});
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setVolume(await fetchVolume(id));
    } catch (error) {
      setErrorZh(error instanceof ApiError ? error.messageZh : String(error));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current !== null) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void load();
    }, refreshDelayMs);
  }, [load]);

  useServerEvents((event) => {
    if (event.type === "models") {
      setModelsMessageZh(event.state === "unloaded" || event.state === "loaded" ? null : event.messageZh);
    } else if (event.type === "task" && event.volumeId === id) {
      if (event.state === "running") setStepZh(t(`stage.${event.stage}`, { page: event.pageOrdinal }));
      if (event.stage === "render" && event.state === "done" && event.pageOrdinal !== null) {
        const ordinal = event.pageOrdinal;
        setVersions((current) => ({ ...current, [ordinal]: (current[ordinal] ?? 0) + 1 }));
      }
      scheduleRefresh();
    } else if (event.type === "job" && event.job.volume_id === id) {
      scheduleRefresh();
    }
  });

  const pageCount = volume?.pages.length ?? 0;
  const direction = volume?.readingDirection ?? "rtl";
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const step = pageStep(event.key, direction);
      if (step === 0 || pageCount === 0) return;
      event.preventDefault();
      setIndex((current) => Math.max(0, Math.min(pageCount - 1, current + step)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [direction, pageCount]);

  const act = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    setErrorZh(null);
    try {
      await action();
    } catch (error) {
      setErrorZh(error instanceof ApiError ? error.messageZh : String(error));
    } finally {
      setBusy(false);
      void load();
    }
  }, [load]);

  return (
    <VolumePageView
      volume={volume}
      index={Math.min(index, Math.max(0, pageCount - 1))}
      mode={mode}
      imageUrl={(ordinal, variant) => pageImageUrl(id, ordinal, variant, versions[ordinal] ?? 0)}
      exportUrl={(format) => exportUrl(id, format)}
      stepZh={stepZh}
      modelsMessageZh={modelsMessageZh}
      errorZh={errorZh}
      busy={busy}
      onBack={() => navigate("/")}
      onStart={() => void act(() => startVolume(id))}
      onStop={() => void act(() => cancelVolume(id))}
      onMode={setMode}
      onPage={setIndex}
    />
  );
};

export default VolumePageContainer;
