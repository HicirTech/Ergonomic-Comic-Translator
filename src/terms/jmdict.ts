import { unzipSync } from "fflate";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { JapaneseDictionary } from "./interfaces/index.ts";
import { toKatakana } from "./norm-key.ts";

/** The forms a jmdict-simplified entry is written in: kanji spellings and kana readings. */
interface JmdictWord {
  kanji: { text: string }[];
  kana: { text: string }[];
}

const formsOf = (zipPath: string) => {
  const entries = unzipSync(new Uint8Array(readFileSync(zipPath)));
  const bytes = Object.values(entries)[0];
  if (!bytes) throw new Error(`${zipPath} holds no file`);
  const { words } = JSON.parse(new TextDecoder().decode(bytes)) as { words: JmdictWord[] };
  const forms = new Set<string>();
  for (const word of words) {
    for (const { text } of word.kanji) forms.add(text.normalize("NFKC"));
    for (const { text } of word.kana) forms.add(toKatakana(text.normalize("NFKC")));
  }
  return forms;
};

/**
 * Loads JMdict (the jmdict-simplified zip, one JSON file) as the set of its spellings and readings, readings in
 * katakana. The set is kept at `cachePath` after the first load, since the zip's JSON is slow to parse.
 */
export const loadJmdict = (zipPath: string, cachePath: string): JapaneseDictionary => {
  let forms: Set<string>;
  if (existsSync(cachePath)) {
    forms = new Set(readFileSync(cachePath, "utf8").split("\n").filter((line) => line !== ""));
  } else {
    forms = formsOf(zipPath);
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, [...forms].join("\n"));
  }
  return { has: (form) => forms.has(toKatakana(form.normalize("NFKC"))) };
};
