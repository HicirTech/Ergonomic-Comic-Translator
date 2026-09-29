import type { Database } from "bun:sqlite";
import { nowIso } from "../core/time-utils.ts";
import { ulid } from "../core/ulid.ts";
import type { NewFlag } from "./interfaces/index.ts";

/** QA flags per page. A stage that re-runs replaces its own open flags, so fixed problems disappear. */
export const createFlagStore = (db: Database) => {
  const insertFlag = db.prepare(`
    INSERT INTO flag (id, volume_id, page_id, code, severity, class, evidence_json, created_at)
    VALUES ($id, $volumeId, $pageId, $code, $severity, $class, $evidenceJson, $createdAt)
  `);
  const selectOpen = db.prepare(`SELECT id, code FROM flag WHERE page_id = $pageId AND status = 'open'`);
  const resolveFlag = db.prepare(`UPDATE flag SET status = 'auto_resolved' WHERE id = $id`);
  const countOpen = db.prepare(`
    SELECT page.ordinal AS ordinal, flag.severity AS severity, COUNT(*) AS count
    FROM flag JOIN page ON page.id = flag.page_id
    WHERE flag.volume_id = $volumeId AND flag.status = 'open'
    GROUP BY page.ordinal, flag.severity ORDER BY page.ordinal
  `);

  return {
    /** Auto-resolves the page's open flags whose code is in `ownedCodes`, then records `flags`. */
    replacePageFlags: db.transaction((volumeId: string, pageId: string, ownedCodes: readonly string[], flags: readonly NewFlag[]) => {
      for (const open of selectOpen.all({ pageId }) as { id: string; code: string }[]) {
        if (ownedCodes.includes(open.code)) resolveFlag.run({ id: open.id });
      }
      const createdAt = nowIso();
      for (const flag of flags) {
        insertFlag.run({
          id: ulid(),
          volumeId,
          pageId,
          code: flag.code,
          severity: flag.severity,
          class: flag.class,
          evidenceJson: JSON.stringify(flag.evidence),
          createdAt,
        });
      }
    }),

    /** Open flags per page ordinal and severity, for the reader's page markers. */
    openCounts: (volumeId: string) => countOpen.all({ volumeId }) as { ordinal: number; severity: NewFlag["severity"]; count: number }[],
  };
};

export type FlagStore = ReturnType<typeof createFlagStore>;
