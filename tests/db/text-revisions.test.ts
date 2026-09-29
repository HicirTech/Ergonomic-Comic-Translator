import { describe, expect, it } from "bun:test";
import { openDatabase } from "../../src/db/database.ts";
import { migrations } from "../../src/db/migrations.ts";
import { createTextRevisions } from "../../src/db/text-revisions.ts";
import { seededDatabase } from "./fixtures.ts";

const machine = { utteranceId: "u1", field: "target" as const, origin: "mt_l1" as const, createdBy: "machine" as const };
const user = { utteranceId: "u1", field: "target" as const, origin: "user" as const, createdBy: "user" as const };

describe("text revisions", () => {
  it("moves the head with each revision and increments the version", () => {
    const revisions = createTextRevisions(seededDatabase());
    expect(revisions.apply({ ...machine, value: "你好" }, 0)).toMatchObject({ kind: "applied", version: 1 });
    expect(revisions.apply({ ...machine, value: "您好", origin: "mt_l1r" }, 1)).toMatchObject({ kind: "applied", version: 2 });
  });

  it("rejects a stale base version (optimistic lock)", () => {
    const revisions = createTextRevisions(seededDatabase());
    revisions.apply({ ...user, value: "改过的" }, 0);
    expect(revisions.apply({ ...user, value: "再改" }, 0)).toEqual({ kind: "conflict", currentVersion: 1 });
  });

  it("never lets a machine revision replace the user's edit, even on a re-run", () => {
    const db = seededDatabase();
    const revisions = createTextRevisions(db);
    revisions.apply({ ...machine, value: "机器译文" }, 0);
    revisions.apply({ ...user, value: "用户改的" }, 1);
    expect(revisions.apply({ ...machine, value: "重跑的机器译文" }, 2)).toEqual({ kind: "protected" });
    const head = db.query("SELECT text_rev.value FROM utterance_head JOIN text_rev ON text_rev.id = utterance_head.target_rev").get();
    expect(head).toEqual({ value: "用户改的" });
    // The trigger enforces the rule for any writer, not only this module.
    const machineRevision = (db.query("SELECT id FROM text_rev WHERE value = '机器译文'").get() as { id: string }).id;
    expect(() => db.run("UPDATE utterance_head SET target_rev = ?, version = version + 1", [machineRevision])).toThrow("user revision");
  });

  it("keeps history append-only", () => {
    const db = seededDatabase();
    createTextRevisions(db).apply({ ...machine, value: "一" }, 0);
    expect(() => db.run("UPDATE text_rev SET value = '二'")).toThrow("append-only");
    expect(() => db.run("DELETE FROM text_rev")).toThrow("append-only");
  });

  it("requires the version to step by exactly one", () => {
    const db = seededDatabase();
    createTextRevisions(db).apply({ ...machine, value: "一" }, 0);
    expect(() => db.run("UPDATE utterance_head SET version = 7")).toThrow("exactly 1");
  });
});

describe("openDatabase", () => {
  it.if(process.platform === "win32")("refuses a database on a network share", () => {
    expect(() => openDatabase("\\\\nas\\share\\ct.sqlite")).toThrow("local disk");
  });

  it("migrates to the latest schema version", () => {
    const db = openDatabase(":memory:");
    expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: migrations.length });
  });
});
