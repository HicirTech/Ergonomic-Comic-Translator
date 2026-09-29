// Typesets translated pages onto the cleaned images and exports CBZ and PDF. CPU only, no models.
// usage: bun run render <run-dir> [--ltr] [--title <name>]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { basename, join, resolve } from "path";
import sharp from "sharp";
import { dataPaths, resolveDataRoot } from "../core/data-paths.ts";
import { exportVolume } from "../export/export-volume.ts";
import type { PageTranslationResult, PageVisionResult } from "../pipeline/interfaces/index.ts";
import { typesetPage } from "../pipeline/typeset-page.ts";
import { pageText } from "../pipeline/volume-text.ts";
import type { IngestedPage } from "../stages/ingest/interfaces/index.ts";
import { composePage } from "../typeset/compose-page.ts";
import { loadLetteringShaper } from "../typeset/lettering-font.ts";

const args = process.argv.slice(2);
const titleIndex = args.indexOf("--title");
const runDirectory = args.find((arg, index) => !arg.startsWith("--") && index !== titleIndex + 1);
if (!runDirectory) {
  console.error("用法：bun run render <结果目录> [--ltr] [--title 书名]");
  process.exit(64);
}
const run = resolve(runDirectory);
const direction = args.includes("--ltr") ? "ltr" : "rtl";
const paths = dataPaths(resolveDataRoot());
const shaper = await loadLetteringShaper(paths);

mkdirSync(join(run, "output"), { recursive: true });
const rendered: string[] = [];
let overflowCount = 0;
for (const name of readdirSync(join(run, "results")).filter((file) => file.endsWith(".json")).sort()) {
  const { page, result } = JSON.parse(readFileSync(join(run, "results", name), "utf8")) as { page: IngestedPage; result: PageVisionResult };
  const translationPath = join(run, "translations", `${String(page.ordinal).padStart(4, "0")}.json`);
  const outputPath = join(run, "output", `${String(page.ordinal).padStart(4, "0")}.png`);
  if (!existsSync(translationPath)) {
    // Untranslated pages keep their original image (as PNG, like every page of the export).
    writeFileSync(outputPath, await sharp(page.storedPath).png().toBuffer());
  } else {
    const translation = JSON.parse(readFileSync(translationPath, "utf8")) as PageTranslationResult;
    const { svg, overflow } = typesetPage(shaper, result, pageText(page.ordinal, result.regions, direction), translation);
    overflowCount += overflow.length;
    writeFileSync(outputPath, await composePage(result.cleanedPath, svg));
  }
  rendered.push(outputPath);
}
const title = titleIndex >= 0 ? args[titleIndex + 1]! : basename(run);
await exportVolume(title, rendered, direction === "rtl", join(run, "output", `${title}.cbz`), join(run, "output", `${title}.pdf`));
console.log(`已排版 ${rendered.length} 页（${overflowCount} 句用最小字号仍放不下）；CBZ 和 PDF 在 ${join(run, "output")}`);
