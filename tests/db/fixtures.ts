import type { Database } from "bun:sqlite";
import { openDatabase } from "../../src/db/database.ts";

/** In-memory database with one volume, two pages, one region/utterance and one job. */
export const seededDatabase = () => {
  const db = openDatabase(":memory:");
  const now = "2026-09-29T00:00:00.000Z";
  db.run("INSERT INTO volume (id, title, created_at) VALUES ('v1', 'test', ?)", [now]);
  db.run("INSERT INTO page (id, volume_id, ordinal, image_sha256, display_name, width, height, kind) VALUES ('p1', 'v1', 1, 'a', '001.png', 10, 10, 'main')");
  db.run("INSERT INTO page (id, volume_id, ordinal, image_sha256, display_name, width, height, kind) VALUES ('p2', 'v1', 2, 'b', '002.png', 10, 10, 'main')");
  db.run("INSERT INTO region (id, page_id, bbox_json) VALUES ('r1', 'p1', '[0,0,5,5]')");
  db.run("INSERT INTO utterance (id, region_id, ordinal, line_ids_json) VALUES ('u1', 'r1', 1, '[]')");
  db.run("INSERT INTO job (id, volume_id, kind, params_json, created_at) VALUES ('j1', 'v1', 'translate_volume', '{}', ?)", [now]);
  return db;
};

export const jobState = (db: Database, jobId = "j1") =>
  (db.query("SELECT state FROM job_state WHERE job_id = ?").get(jobId) as { state: string }).state;
