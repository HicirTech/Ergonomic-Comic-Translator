import { existsSync, readFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { writeFileAtomically } from "../core/atomic-write.ts";
import type { DataPaths } from "../core/data-paths.ts";
import { sha256Hex } from "../core/hash.ts";
import type { FlagStore } from "../db/flags.ts";
import type { PageRecord, VolumeRecord } from "../db/interfaces/index.ts";
import type { VolumeStore } from "../db/volumes.ts";
import { exportVolume } from "../export/export-volume.ts";
import { buildGlossary } from "../pipeline/build-glossary.ts";
import type { PageTranslationResult, PageVisionResult, VolumeGlossary } from "../pipeline/interfaces/index.ts";
import { translateVolumePage } from "../pipeline/translate-volume.ts";
import { typesetPage } from "../pipeline/typeset-page.ts";
import { runVisionPage } from "../pipeline/vision-page.ts";
import { pageText } from "../pipeline/volume-text.ts";
import { translationFlagCodes, translationFlags } from "../qa/translation-flags.ts";
import { defaultReadingDirection, detectSourceLanguage } from "../stages/lang/detect-language.ts";
import { freezeGlossary } from "../terms/freeze.ts";
import { composePage } from "../typeset/compose-page.ts";
import type { Shaper } from "../typeset/interfaces/index.ts";
import type { ModelHost, StageContext, StageRun, VolumeStage, VolumeText } from "./interfaces/index.ts";
import { needsReading } from "./plan-volume-tasks.ts";
import { volumeFiles } from "./volume-files.ts";

/** Source tokens of earlier pages carried as translation history. */
const historyBudget = 2000;
/** Used when there is too little text to tell; manga is the common case. */
const fallbackLanguage = "ja";
const fitFlagCodes = ["FIT_OVERFLOW"] as const;

const readJson = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const readJsonIfExists = <T>(path: string) => (existsSync(path) ? readJson<T>(path) : null);

const pageOf = (context: StageContext): PageRecord => {
  if (!context.page) throw new Error(`Stage ${context.task.stage} needs a page`);
  return context.page;
};

/** Vertical text is the better first guess unless the volume is known to be Korean, English or left to right. */
const writingPrior = (volume: VolumeRecord) => {
  if (volume.source_lang === "ko" || volume.source_lang === "en") return "h";
  return volume.source_lang === null && volume.reading_direction === "ltr" ? "h" : "v";
};

/**
 * The five stages of a translate_volume job over files in the volume folder. Model stages use whatever
 * `host` has loaded (the runner loads the right lane first); `shaper` loads the lettering font once.
 */
export const createVolumeStages = (
  paths: DataPaths,
  volumes: VolumeStore,
  flags: FlagStore,
  host: ModelHost,
  shaper: () => Promise<Shaper>,
): Record<VolumeStage, StageRun> => {
  const imagePath = (page: PageRecord) => join(paths.pages, page.image_file);
  const originalAsPng = async (page: PageRecord) => new Uint8Array(await sharp(imagePath(page)).png().toBuffer());

  return {
    vision: async (context) => {
      const page = pageOf(context);
      const files = volumeFiles(paths, context.volume.id);
      const result = await runVisionPage(host.vision().client, imagePath(page), page.image_sha256, files.work, writingPrior(context.volume));
      const json = JSON.stringify(result);
      writeFileAtomically(files.vision(page.ordinal), json);
      return sha256Hex(json);
    },

    glossary: async ({ volume, pages }) => {
      const files = volumeFiles(paths, volume.id);
      const read = pages
        .filter(needsReading)
        .map((page) => ({ page, result: readJsonIfExists<PageVisionResult>(files.vision(page.ordinal)) }))
        .filter((entry): entry is { page: PageRecord; result: PageVisionResult } => entry.result !== null);
      const detected = volume.source_lang === null
        ? detectSourceLanguage(read.flatMap(({ result }) => result.regions.flatMap((region) => region.utterances.map((utterance) => utterance.text))))
        : { language: volume.source_lang, confidence: 1 };
      const language = detected?.language ?? fallbackLanguage;
      volumes.setLanguage(volume.id, language, detected?.confidence ?? 0, defaultReadingDirection(language));
      const direction = volume.reading_direction ?? defaultReadingDirection(language);
      const text: VolumeText = { language, direction, pages: read.map(({ page, result }) => pageText(page.ordinal, result.regions, direction)) };
      writeFileAtomically(files.text, JSON.stringify(text));

      const { complete, modelSha } = host.llm();
      const glossary = await buildGlossary(text.pages.flatMap((page) => page.lines), language, complete, modelSha);
      writeFileAtomically(files.glossary, JSON.stringify(glossary));
      return glossary.glossary.sha256;
    },

    translate: async (context) => {
      const page = pageOf(context);
      const files = volumeFiles(paths, context.volume.id);
      const text = readJson<VolumeText>(files.text);
      const index = text.pages.findIndex((entry) => entry.page === page.ordinal);
      if (index < 0) throw new Error(`Page ${page.ordinal} has no text`);
      // A failed glossary stage leaves no file; the volume is then translated without fixed terms.
      const glossary = readJsonIfExists<VolumeGlossary>(files.glossary);
      const frozen = glossary?.glossary ?? freezeGlossary([]);
      const earlier = text.pages.slice(0, index).map((entry) => readJsonIfExists<PageTranslationResult>(files.translation(entry.page)));
      const { complete, modelSha } = host.llm();
      const result = await translateVolumePage(text.pages, index, earlier, {
        terms: glossary?.terms ?? [],
        roleTable: frozen.roleTable,
        glossarySha: frozen.sha256,
        language: text.language,
        complete,
        modelSha,
        historyBudget,
      });
      const json = JSON.stringify(result);
      writeFileAtomically(files.translation(page.ordinal), json);
      flags.replacePageFlags(context.volume.id, page.id, translationFlagCodes, translationFlags(result));
      return sha256Hex(json);
    },

    render: async (context) => {
      const page = pageOf(context);
      const files = volumeFiles(paths, context.volume.id);
      const vision = needsReading(page) ? readJsonIfExists<PageVisionResult>(files.vision(page.ordinal)) : null;
      const translation = vision ? readJsonIfExists<PageTranslationResult>(files.translation(page.ordinal)) : null;
      const text = translation ? readJson<VolumeText>(files.text).pages.find((entry) => entry.page === page.ordinal) : undefined;
      let png: Uint8Array;
      if (vision && translation && text) {
        const { svg, overflow } = typesetPage(await shaper(), vision, text, translation);
        png = await composePage(vision.cleanedPath, svg);
        flags.replacePageFlags(context.volume.id, page.id, fitFlagCodes, overflow.map((unit) => ({
          code: "FIT_OVERFLOW",
          severity: "warn",
          class: "advisory",
          evidence: { unit },
        })));
      } else {
        // Blank pages and pages the pipeline could not read keep their original image.
        png = await originalAsPng(page);
      }
      writeFileAtomically(files.output(page.ordinal), png);
      return sha256Hex(png);
    },

    export: async ({ volume, pages }) => {
      const files = volumeFiles(paths, volume.id);
      for (const page of pages) {
        // A page whose render failed still appears in the export, untranslated.
        if (!existsSync(files.output(page.ordinal))) {
          writeFileAtomically(files.output(page.ordinal), await originalAsPng(page));
        }
      }
      const manga = (volume.reading_direction ?? "rtl") === "rtl";
      await exportVolume(volume.title, pages.map((page) => files.output(page.ordinal)), manga, files.cbz, files.pdf);
      return null;
    },
  };
};
