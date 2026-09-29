import type { SessionFailure } from "./session-failure.ts";

export type SessionOpening<T> = { ok: true; session: T } | { ok: false; failure: SessionFailure };
