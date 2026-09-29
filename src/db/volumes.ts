import type { Database } from "bun:sqlite";
import { basename } from "path";
import { nowIso } from "../core/time-utils.ts";
import { ulid } from "../core/ulid.ts";
import type { SourceLanguage } from "../translate/interfaces/index.ts";
import type { JobSummary, NewVolume, PageRecord, VolumeRecord } from "./interfaces/index.ts";

const volumeColumns = "id, title, source_lang, lang_confidence, reading_direction, created_at";
const jobColumns = [
  "job_state.job_id", "job_state.volume_id", "job.kind", "job.created_at", "job.cancel_requested_at",
  "job_state.tasks", "job_state.done", "job_state.failed", "job_state.state",
].join(", ");

/**
 * Volumes, their pages and their jobs. A volume is created with all its pages in one transaction;
 * deleting only marks it, so its files can be cleaned up later without breaking a running job.
 */
export const createVolumeStore = (db: Database) => {
  const insertVolume = db.prepare(`
    INSERT INTO volume (id, title, source_lang, reading_direction, created_at)
    VALUES ($id, $title, $sourceLang, $readingDirection, $createdAt)
  `);
  const insertPage = db.prepare(`
    INSERT INTO page (id, volume_id, ordinal, image_sha256, image_file, display_name, width, height, kind, variant_of)
    VALUES ($id, $volumeId, $ordinal, $sha256, $imageFile, $displayName, $width, $height, $kind, $variantOf)
  `);
  const insertJob = db.prepare(`
    INSERT INTO job (id, volume_id, kind, params_json, created_at) VALUES ($id, $volumeId, $kind, $paramsJson, $createdAt)
  `);
  const selectVolume = db.prepare(`SELECT ${volumeColumns} FROM volume WHERE id = $id AND deleted_at IS NULL`);
  const selectVolumes = db.prepare(`SELECT ${volumeColumns} FROM volume WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC`);
  const selectPages = db.prepare(`SELECT * FROM page WHERE volume_id = $volumeId ORDER BY ordinal`);
  const selectJob = db.prepare(`
    SELECT ${jobColumns} FROM job_state JOIN job ON job.id = job_state.job_id WHERE job_state.job_id = $jobId
  `);
  const selectLatestJob = db.prepare(`
    SELECT ${jobColumns} FROM job_state JOIN job ON job.id = job_state.job_id WHERE job_state.volume_id = $volumeId
    ORDER BY job.created_at DESC, job.id DESC LIMIT 1
  `);
  const selectActiveJobs = db.prepare(`
    SELECT job_state.job_id FROM job_state JOIN job ON job.id = job_state.job_id
    JOIN volume ON volume.id = job.volume_id
    WHERE job.cancel_requested_at IS NULL AND volume.deleted_at IS NULL AND job_state.state IN ('queued', 'running')
    ORDER BY job.created_at, job.id
  `);
  const updateLanguage = db.prepare(`
    UPDATE volume SET source_lang = $language, lang_confidence = $confidence,
      reading_direction = COALESCE(reading_direction, $direction)
    WHERE id = $id
  `);
  const markDeleted = db.prepare(`UPDATE volume SET deleted_at = $now WHERE id = $id AND deleted_at IS NULL`);

  return {
    create: db.transaction((volume: NewVolume) => {
      const volumeId = ulid();
      const createdAt = nowIso();
      insertVolume.run({ id: volumeId, title: volume.title, sourceLang: volume.sourceLanguage, readingDirection: volume.readingDirection, createdAt });
      const pageIds = new Map<number, string>();
      for (const { page, kind } of [...volume.pages].sort((a, b) => a.page.ordinal - b.page.ordinal)) {
        const id = ulid();
        pageIds.set(page.ordinal, id);
        insertPage.run({
          id,
          volumeId,
          ordinal: page.ordinal,
          sha256: page.sha256,
          imageFile: basename(page.storedPath),
          displayName: page.displayName,
          width: page.width,
          height: page.height,
          kind: kind.kind,
          variantOf: kind.kind === "textless_variant" ? pageIds.get(kind.variantOf) ?? null : null,
        });
      }
      return volumeId;
    }),

    volume: (id: string) => (selectVolume.get({ id }) as VolumeRecord | null) ?? null,

    list: () => selectVolumes.all() as VolumeRecord[],

    pages: (volumeId: string) => selectPages.all({ volumeId }) as PageRecord[],

    /** Records the detected language; the reading direction is only filled in when nobody chose one. */
    setLanguage: (id: string, language: SourceLanguage, confidence: number, defaultDirection: "rtl" | "ltr") => {
      updateLanguage.run({ id, language, confidence, direction: defaultDirection });
    },

    createJob: (volumeId: string, kind: "translate_volume" | "pages", params: Record<string, unknown>) => {
      const id = ulid();
      insertJob.run({ id, volumeId, kind, paramsJson: JSON.stringify(params), createdAt: nowIso() });
      return id;
    },

    job: (jobId: string) => (selectJob.get({ jobId }) as JobSummary | null) ?? null,

    latestJob: (volumeId: string) => (selectLatestJob.get({ volumeId }) as JobSummary | null) ?? null,

    /** Jobs that still have work to plan or run, oldest first. */
    activeJobIds: () => (selectActiveJobs.all() as { job_id: string }[]).map((row) => row.job_id),

    markDeleted: (id: string) => markDeleted.run({ id, now: nowIso() }).changes === 1,
  };
};

export type VolumeStore = ReturnType<typeof createVolumeStore>;
