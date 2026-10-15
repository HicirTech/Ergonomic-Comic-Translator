import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { zipSync } from "fflate";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadJmdict } from "../../src/terms/jmdict.ts";

const words = [
  { kanji: [{ text: "霞" }], kana: [{ text: "かすみ" }] },
  { kanji: [], kana: [{ text: "ピンポーン" }] },
];

let root = "";
let zipPath = "";
let cachePath = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ct-jmdict-"));
  zipPath = join(root, "jmdict.zip");
  cachePath = join(root, "cache", "forms.txt");
  writeFileSync(zipPath, zipSync({ "jmdict-test.json": new TextEncoder().encode(JSON.stringify({ words })) }));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("loadJmdict", () => {
  it("answers for spellings and for readings in either kana", () => {
    const dictionary = loadJmdict(zipPath, cachePath);
    expect(["霞", "かすみ", "カスミ", "ピンポーン", "ピンホーン"].map((form) => dictionary.has(form))).toEqual([true, true, true, true, false]);
  });

  it("keeps the forms in the cache and reads them from there next time", () => {
    loadJmdict(zipPath, cachePath);
    expect(existsSync(cachePath)).toBe(true);
    rmSync(zipPath);
    expect(loadJmdict(zipPath, cachePath).has("ピンポーン")).toBe(true);
  });
});
