import type { Database } from "bun:sqlite";
import { nowIso } from "../core/time-utils.ts";
import { ulid } from "../core/ulid.ts";
import type { NewTextRevision, RevisionOutcome, TextField } from "./interfaces/index.ts";

const headColumn: Record<TextField, "source_rev" | "target_rev" | "gloss_rev"> = {
  source: "source_rev",
  target: "target_rev",
  gloss: "gloss_rev",
};

/**
 * Append-only text history per utterance with a versioned head. Every change is a new revision;
 * the head moves with an optimistic version check, and a machine revision never displaces a user one
 * (the schema triggers enforce the same rule for any other writer).
 */
export const createTextRevisions = (db: Database) => {
  const insertRevision = db.prepare(`
    INSERT INTO text_rev (id, utterance_id, field, value, origin, created_by, model_sha, provider, backend, tier, input_key, seed, checks_json, created_at)
    VALUES ($id, $utteranceId, $field, $value, $origin, $createdBy, $modelSha, $provider, $backend, $tier, $inputKey, $seed, $checksJson, $createdAt)
  `);
  const readHead = db.prepare(`SELECT * FROM utterance_head WHERE utterance_id = $utteranceId`);
  const readCreator = db.prepare(`SELECT created_by FROM text_rev WHERE id = $id`);
  const insertHead = db.prepare(`INSERT INTO utterance_head (utterance_id, version) VALUES ($utteranceId, 0)`);
  const updateHead = Object.fromEntries(
    Object.entries(headColumn).map(([field, column]) => [
      field,
      db.prepare(`UPDATE utterance_head SET ${column} = $revisionId, version = version + 1 WHERE utterance_id = $utteranceId AND version = $baseVersion`),
    ]),
  ) as Record<TextField, ReturnType<Database["prepare"]>>;

  /**
   * Appends a revision and points the head at it. `baseVersion` is the head version the writer saw
   * (0 for an utterance without a head yet); machine writers pass the version they read before working.
   */
  const apply = db.transaction((revision: NewTextRevision, baseVersion: number): RevisionOutcome => {
    let head = readHead.get({ utteranceId: revision.utteranceId }) as Record<string, string | number | null> | null;
    if (!head) {
      insertHead.run({ utteranceId: revision.utteranceId });
      head = { version: 0, source_rev: null, target_rev: null, gloss_rev: null };
    }
    if (head.version !== baseVersion) {
      return { kind: "conflict", currentVersion: head.version as number };
    }
    const currentRevision = head[headColumn[revision.field]] as string | null;
    if (revision.createdBy === "machine" && currentRevision !== null) {
      const current = readCreator.get({ id: currentRevision }) as { created_by: string };
      if (current.created_by === "user") {
        return { kind: "protected" };
      }
    }

    const revisionId = ulid();
    insertRevision.run({
      id: revisionId,
      utteranceId: revision.utteranceId,
      field: revision.field,
      value: revision.value,
      origin: revision.origin,
      createdBy: revision.createdBy,
      modelSha: revision.modelSha ?? null,
      provider: revision.provider ?? null,
      backend: revision.backend ?? null,
      tier: revision.tier ?? null,
      inputKey: revision.inputKey ?? null,
      seed: revision.seed ?? null,
      checksJson: revision.checksJson ?? null,
      createdAt: nowIso(),
    });
    updateHead[revision.field].run({ revisionId, utteranceId: revision.utteranceId, baseVersion });
    return { kind: "applied", revisionId, version: baseVersion + 1 };
  });

  return { apply };
};
