/** First message of a worker after it verified its ONNX Runtime. */
export interface WorkerHello {
  kind: "hello";
  pid: number;
  ortVersion: string;
  /** Absolute path of the onnxruntime.dll the process holds (Windows), else null. */
  ortDllPath: string | null;
}
