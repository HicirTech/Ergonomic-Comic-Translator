import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, fetchStatus, fetchVolumes, startVolume, useServerEvents } from "../../api/index.ts";
import type { ImportResult } from "../../../server/interfaces/import-result.ts";
import type { ResourceStatus } from "../../../server/interfaces/resource-status.ts";
import type { VolumeSummary } from "../../../server/interfaces/volume-summary.ts";
import LibraryPageView from "./LibraryPageView.tsx";

/** Job events arrive after every task; the list is refreshed at most this often. */
const refreshDelayMs = 500;

const LibraryPageContainer: React.FC = () => {
  const navigate = useNavigate();
  const [volumes, setVolumes] = useState<VolumeSummary[] | null>(null);
  const [status, setStatus] = useState<ResourceStatus | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [modelsMessageZh, setModelsMessageZh] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [errorZh, setErrorZh] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setVolumes(await fetchVolumes());
      const current = await fetchStatus();
      setStatus(current.resources);
      setMissing([...current.missing.models, ...current.missing.runtimes]);
    } catch (error) {
      setErrorZh(error instanceof ApiError ? error.messageZh : String(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useServerEvents((event) => {
    if (event.type === "status") {
      setStatus(event.status);
    } else if (event.type === "models") {
      setModelsMessageZh(event.state === "unloaded" ? null : event.messageZh);
    } else if (event.type === "job" && refreshTimer.current === null) {
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        void load();
      }, refreshDelayMs);
    }
  });

  const onStart = useCallback(async () => {
    if (!imported) return;
    setStarting(true);
    try {
      await startVolume(imported.volumeId);
      navigate(`/volumes/${imported.volumeId}`);
    } catch (error) {
      setErrorZh(error instanceof ApiError ? error.messageZh : String(error));
      setImported(null);
      void load();
    } finally {
      setStarting(false);
    }
  }, [imported, load, navigate]);

  return (
    <LibraryPageView
      volumes={volumes}
      status={status}
      missing={missing}
      modelsMessageZh={modelsMessageZh}
      imported={imported}
      starting={starting}
      errorZh={errorZh}
      onImported={(result) => {
        setImported(result);
        void load();
      }}
      onStart={() => void onStart()}
      onLater={() => setImported(null)}
      onChanged={() => void load()}
    />
  );
};

export default LibraryPageContainer;
