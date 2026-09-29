/** Signals from outside the memory probes that feed the light assessment. */
export interface LightSignals {
  /** LLM generation speed fell off a cliff (see ThroughputCliffDetector). */
  throughputCliff: boolean;
  /** Three consecutive vision runs took longer than 3x their median. */
  slowVisionRuns: boolean;
  /** A TDR or DEVICE_REMOVED was observed. */
  deviceReset: boolean;
  /** Our shared GPU memory when our models finished loading, per adapter LUID. */
  ownSharedBaselineBytes: Map<string, number>;
  /** Available RAM about 10 s ago, to tell a falling trend on UMA machines. */
  availPhysTenSecondsAgoBytes: number | null;
}
