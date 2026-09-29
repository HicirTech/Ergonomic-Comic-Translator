/** Worker to parent: ACK with a result, or NACK with an error code and message. */
export type WorkerReply =
  | { seq: number; ok: true; result: unknown }
  | { seq: number; ok: false; error: { code: string; message: string } };
