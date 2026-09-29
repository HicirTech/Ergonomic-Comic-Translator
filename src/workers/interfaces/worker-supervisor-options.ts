export interface WorkerSupervisorOptions {
  /** Shown in errors and logs, e.g. "vision-gpu". */
  name: string;
  /** Absolute path of the worker entry script. */
  entry: string;
  /** How long the worker may take to verify its runtime and say hello. */
  startTimeoutMs: number;
  env?: Record<string, string>;
  /** Called with the child pid on every (re)start and exit, e.g. to keep the governor's ownPids current. */
  onSpawn?: (pid: number) => void;
  onExit?: (pid: number) => void;
}
