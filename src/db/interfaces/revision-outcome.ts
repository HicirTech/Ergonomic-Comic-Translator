/**
 * Result of applying a revision to an utterance head:
 * - applied: the head now points at the new revision;
 * - conflict: someone else changed the head since baseVersion (optimistic lock, HTTP 409);
 * - protected: a machine revision tried to replace a user revision and was kept out.
 */
export type RevisionOutcome =
  | { kind: "applied"; revisionId: string; version: number }
  | { kind: "conflict"; currentVersion: number }
  | { kind: "protected" };
