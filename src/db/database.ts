import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { isNetworkVolume } from "../platform/win32/kernel32.ts";
import { migrations } from "./migrations.ts";

/** Applies pending migrations, each in its own transaction together with the user_version bump. */
export const migrate = (db: Database) => {
  const { user_version: current } = db.query("PRAGMA user_version").get() as { user_version: number };
  if (current > migrations.length) {
    throw new Error(`Database schema version ${current} is newer than this build (${migrations.length})`);
  }
  for (let index = current; index < migrations.length; index += 1) {
    db.transaction(() => {
      db.exec(migrations[index]!);
      db.exec(`PRAGMA user_version = ${index + 1}`);
    })();
  }
};

/**
 * Opens the single-writer database: WAL, synchronous=NORMAL, 5 s busy timeout, foreign keys on.
 * WAL does not work on network file systems, so a database on a network drive is refused.
 * Pass ":memory:" for tests.
 */
export const openDatabase = (path: string) => {
  if (path !== ":memory:") {
    if (process.platform === "win32" && isNetworkVolume(path)) {
      throw new Error(`The database must be on a local disk, not a network drive: ${path}`);
    }
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
};
