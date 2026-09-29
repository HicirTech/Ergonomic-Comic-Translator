/** ACK payload of a "load" request. */
export interface LoadResult {
  engine: string;
  ep: string;
  loadMs: number;
  inputNames: string[];
  outputNames: string[];
}
