type QueueHandlers<TEntry extends { uploadId: string }> = {
  /**
   * Called once at startup. Receives a `push` helper and a `kick` helper so it
   * can re-queue any jobs that were in-flight when the server last shut down.
   */
  recoverPersistedJobs: (push: (entry: TEntry) => void, kick: () => void) => Promise<void>;
  /** Executes pipeline-specific work for one queue entry. If it throws, `onEntryError` is called. */
  processEntry: (entry: TEntry) => Promise<void>;
  /** Persists the error and resets the job record to a recoverable state. */
  onEntryError: (entry: TEntry, error: unknown) => Promise<void>;
};

/**
 * Creates the shared queue processing infrastructure used by all pipeline
 * queue services (OCR, textless, translation).
 *
 * The caller provides the three pipeline-specific handlers; this function
 * returns the shared state and control primitives.
 */
export const createQueueProcessor = <TEntry extends { uploadId: string }>(
  handlers: QueueHandlers<TEntry>,
) => {
  const pendingEntries: TEntry[] = [];
  let activeUploadId: string | null = null;
  let processingPromise: Promise<void> | null = null;
  let _initPromise: Promise<void> | undefined;

  const kickProcessor = () => {
    if (processingPromise) return;
    processingPromise = drainQueue().finally(() => {
      processingPromise = null;
      if (pendingEntries.length > 0) kickProcessor();
    });
  };

  const drainQueue = async (): Promise<void> => {
    while (pendingEntries.length > 0) {
      const entry = pendingEntries.shift();
      if (!entry) continue;
      activeUploadId = entry.uploadId;
      try {
        await handlers.processEntry(entry);
      } catch (error) {
        await handlers.onEntryError(entry, error);
      } finally {
        activeUploadId = null;
      }
    }
  };

  const initialize = (): Promise<void> => {
    _initPromise ??= handlers.recoverPersistedJobs(
      (entry) => pendingEntries.push(entry),
      kickProcessor,
    );
    return _initPromise;
  };

  return { pendingEntries, getActiveUploadId: () => activeUploadId, initialize, kickProcessor };
};
