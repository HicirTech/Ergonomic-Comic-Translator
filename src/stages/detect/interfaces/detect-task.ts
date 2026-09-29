export interface DetectTask {
  imagePath: string;
  /** Detections below this score are dropped. */
  minScore: number;
}
