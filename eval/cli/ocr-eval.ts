// Synthetic OCR and text-removal eval. Loads vision models; run only with the owner's go-ahead.
// usage: bun run eval:ocr [--out <dir>] [--seed <n>] [--pages <n>] [--gpu]
import { isAbsolute, join, relative, resolve } from "path";
import { writeFileAtomically } from "../../src/core/atomic-write.ts";
import { dataPaths, resolveDataRoot } from "../../src/core/data-paths.ts";
import { openResourceProbe } from "../../src/gov/probe.ts";
import { ResourceMonitor } from "../../src/gov/resource-monitor.ts";
import { decodeRgb } from "../../src/imaging/page-image.ts";
import { runVisionPage } from "../../src/pipeline/vision-page.ts";
import { openVisionSession } from "../../src/sessions/vision-session.ts";
import { loadLetteringShaper } from "../../src/typeset/lettering-font.ts";
import { formatSummaryZh } from "./format-summary-zh.ts";
import { ocrEvalUsage, parseOcrEvalArgs } from "./parse-ocr-eval-options.ts";
import { buildOcrReport } from "./summarize-ocr.ts";
import { scoreSyntheticPage } from "./score-page.ts";
import { blockCropOf, fourTurnLineCrop } from "../synthetic/line-geometry.ts";
import { isMissingGlyphError } from "../synthetic/missing-glyph.ts";
import { paintSyntheticPage } from "../synthetic/paint-page.ts";
import { planSyntheticPages } from "../synthetic/plan-pages.ts";
import type { SyntheticPage } from "../synthetic/interfaces/index.ts";
import type { OcrEvalReport } from "./interfaces/index.ts";

/** Same prior as a Japanese volume: vertical when the language is not known to be horizontal. */
const evalWritingPrior = "v" as const;

const repoRoot = resolve(import.meta.dir, "../..");

const insideRepo = (path: string) => {
  const fromRoot = relative(repoRoot, resolve(path));
  return fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot));
};

const args = process.argv.slice(2);
const parsed = parseOcrEvalArgs(args);
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(64);
}
if (parsed.options.positionals.length > 0) {
  console.error(`${ocrEvalUsage}\n不接受位置参数：${parsed.options.positionals.join(" ")}`);
  process.exit(64);
}

const paths = dataPaths(resolveDataRoot());
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const out = resolve(parsed.options.out ?? join(paths.root, "eval", `ocr-${stamp}`));
if (insideRepo(out)) {
  console.error(`${ocrEvalUsage}\n输出目录必须在仓库外：${out}`);
  process.exit(64);
}

const shaper = await loadLetteringShaper(paths);
let pages;
try {
  pages = planSyntheticPages(shaper, parsed.options.seed, parsed.options.pages);
} catch (error) {
  if (!isMissingGlyphError(error)) throw error;
  console.error(`ocr-eval: 字库缺少字形，${error instanceof Error ? error.message.replace(/^MISSING_GLYPH\s/u, "") : error}`);
  process.exit(3);
}

const painted: { page: SyntheticPage; mask: Uint8Array }[] = [];
for (const page of pages) {
  const image = await paintSyntheticPage(shaper, page);
  const directory = join(out, "pages");
  writeFileAtomically(join(directory, `${page.id}.json`), JSON.stringify(page, null, 1));
  writeFileAtomically(join(directory, `${page.id}-background.png`), image.backgroundPng);
  writeFileAtomically(join(directory, `${page.id}-page.png`), image.pagePng);
  writeFileAtomically(join(directory, `${page.id}-mask.png`), image.maskPng);
  painted.push({ page, mask: image.mask });
}
console.log(`已生成 ${pages.length} 页（种子 ${parsed.options.seed}）：${join(out, "pages")}`);

const probe = openResourceProbe();
const monitor = new ResourceMonitor(probe);
monitor.start();
const opening = await openVisionSession(paths, monitor, !parsed.options.gpu, "ocr eval");
if (!opening.ok) {
  monitor.stop();
  probe.close();
  console.error(opening.failure.messageZh);
  process.exit(opening.failure.kind === "busy" ? 3 : 2);
}
const session = opening.session;
session.signal.addEventListener("abort", () => console.error(`红灯，停止并释放显卡：${session.signal.reason}`));

const scores: OcrEvalReport["pages"][number][] = [];
try {
  console.log(`模型已加载：${session.loads.map((load) => `${load.engine}@${load.ep} ${Math.round(load.loadMs)} ms`).join("，")}`);
  for (const { page, mask } of painted) {
    while (!session.signal.aborted && monitor.latest?.assessment.light === "yellow") await Bun.sleep(1000);
    if (session.signal.aborted) break;
    const pagePath = join(out, "pages", `${page.id}-page.png`);
    const vision = await runVisionPage(session.client, pagePath, page.id, join(out, "work"), evalWritingPrior);
    const lineCrops = page.blocks.flatMap((block) => block.lines.map((line) => fourTurnLineCrop(line.polygon)));
    const lineReads = lineCrops.length === 0 ? [] : await session.client.recognizeLines(pagePath, lineCrops);
    const blockCrops = page.blocks.map(blockCropOf);
    const baberuReads = blockCrops.length === 0 ? [] : await session.client.readUtterances(pagePath, blockCrops, "baberu");
    const mangaReads = blockCrops.length === 0 ? [] : await session.client.readUtterances(pagePath, blockCrops, "manga-ocr");
    const background = await decodeRgb(join(out, "pages", `${page.id}-background.png`));
    const cleaned = await decodeRgb(vision.cleanedPath);
    scores.push(scoreSyntheticPage(page, vision, background, cleaned, mask, lineReads, baberuReads, mangaReads));
    console.log(`第 ${page.index + 1}/${pages.length} 页：${vision.regions.length} 个区域`);
  }
} catch (error) {
  if (!session.signal.aborted) throw error;
} finally {
  await session.close();
  monitor.stop();
  probe.close();
}

if (session.signal.aborted || scores.length !== pages.length) {
  console.error("ocr-eval: 评测未完成");
  process.exit(2);
}
const report = buildOcrReport(parsed.options.seed, parsed.options.gpu, scores);
writeFileAtomically(join(out, "report.json"), JSON.stringify(report, null, 1));
console.log(formatSummaryZh(report));
console.log(`报告：${join(out, "report.json")}`);
process.exit(report.passed ? 0 : 2);
