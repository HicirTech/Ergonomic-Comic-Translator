// Real-page eval from textless pairs. Loads vision models; run only with the owner's go-ahead.
// The report stores ids, boxes and numbers. It does not store page text or image bytes.
// usage: bun run eval:real [--out <dir>] [--pages <n>] [--gpu] <zip|cbz|folder> [...]
import { isAbsolute, join, relative, resolve } from "path";
import { writeFileAtomically } from "../../src/core/atomic-write.ts";
import { dataPaths, resolveDataRoot } from "../../src/core/data-paths.ts";
import { openResourceProbe } from "../../src/gov/probe.ts";
import { ResourceMonitor } from "../../src/gov/resource-monitor.ts";
import { decodeRgb } from "../../src/imaging/page-image.ts";
import { runVisionPage } from "../../src/pipeline/vision-page.ts";
import { openVisionSession } from "../../src/sessions/vision-session.ts";
import { IngestLimitError } from "../../src/stages/ingest/ingest-limit-error.ts";
import { ingestEntries } from "../../src/stages/ingest/ingest.ts";
import { readSources } from "../../src/stages/ingest/read-sources.ts";
import { classifyPages } from "../../src/stages/profile/page-profile.ts";
import { makeThumbnail } from "../../src/stages/profile/thumbnail.ts";
import { formatRealSummaryZh } from "./format-real-summary-zh.ts";
import type { RealPairScore } from "./interfaces/index.ts";
import { parseRealEvalArgs, realEvalUsage } from "./parse-real-eval-options.ts";
import { buildRealReport, orientTextlessPair, scoreRealPair } from "./real-score.ts";

/** Same prior as a Japanese volume. */
const evalWritingPrior = "v" as const;

const repoRoot = resolve(import.meta.dir, "../..");

const insideRepo = (path: string) => {
  const fromRoot = relative(repoRoot, resolve(path));
  return fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot));
};

const args = process.argv.slice(2);
const parsed = parseRealEvalArgs(args);
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(64);
}
if (parsed.options.positionals.length === 0) {
  console.error(`${realEvalUsage}\n需要至少一个 zip、cbz 或文件夹`);
  process.exit(64);
}

const paths = dataPaths(resolveDataRoot());
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const out = resolve(parsed.options.out ?? join(paths.root, "eval", `real-${stamp}`));
if (insideRepo(out)) {
  console.error(`${realEvalUsage}\n输出目录必须在仓库外：${out}`);
  process.exit(64);
}

let ingested;
try {
  ingested = await ingestEntries(await readSources(parsed.options.positionals.map((input) => resolve(input))), paths.pages);
} catch (error) {
  if (error instanceof IngestLimitError) {
    console.error(`eval:real: ${error.message}`);
    process.exit(2);
  }
  throw error;
}
const { pages, skipped } = ingested;
console.log(`已入库 ${pages.length} 页，跳过 ${skipped.length} 个`);

const thumbnails = await Promise.all(pages.map((page) => makeThumbnail(page.storedPath, page.ordinal, page.width, page.height)));
const kinds = classifyPages(thumbnails);
const byOrdinal = new Map(pages.map((page) => [page.ordinal, page]));
const paired = [...kinds.entries()]
  .flatMap(([ordinal, kind]) => kind.kind === "textless_variant" ? [{ ordinal, variantOf: kind.variantOf }] : [])
  .sort((a, b) => a.variantOf - b.variantOf);
const limited = parsed.options.pages === null ? paired : paired.slice(0, parsed.options.pages);

const probe = openResourceProbe();
const monitor = new ResourceMonitor(probe);
monitor.start();
const opening = await openVisionSession(paths, monitor, !parsed.options.gpu, "real eval");
if (!opening.ok) {
  monitor.stop();
  probe.close();
  console.error(opening.failure.messageZh);
  process.exit(opening.failure.kind === "busy" ? 3 : 2);
}
const session = opening.session;
session.signal.addEventListener("abort", () => console.error(`红灯，停止并释放显卡：${session.signal.reason}`));

const scores: RealPairScore[] = [];
try {
  console.log(`模型已加载：${session.loads.map((load) => `${load.engine}@${load.ep} ${Math.round(load.loadMs)} ms`).join("，")}`);
  for (const pair of limited) {
    while (!session.signal.aborted && monitor.latest?.assessment.light === "yellow") await Bun.sleep(1000);
    if (session.signal.aborted) break;
    const earlier = byOrdinal.get(pair.variantOf);
    const later = byOrdinal.get(pair.ordinal);
    if (!earlier || !later) continue;
    const oriented = orientTextlessPair(await decodeRgb(earlier.storedPath), await decodeRgb(later.storedPath));
    const textPage = oriented.orderAgrees ? earlier : later;
    const textlessPage = oriented.orderAgrees ? later : earlier;
    const pageId = `p${String(textPage.ordinal).padStart(4, "0")}`;
    const vision = await runVisionPage(session.client, textPage.storedPath, pageId, join(out, "work"), evalWritingPrior);
    const cleaned = await decodeRgb(vision.cleanedPath);
    scores.push(scoreRealPair({
      id: pageId,
      textOrdinal: textPage.ordinal,
      textlessOrdinal: textlessPage.ordinal,
      textSha256: textPage.sha256,
      textlessSha256: textlessPage.sha256,
      orderAgrees: oriented.orderAgrees,
    }, oriented.text, cleaned, { mask: oriented.mask, boxes: oriented.boxes }, oriented.strokes, vision.regions));
    console.log(`第 ${scores.length}/${limited.length} 对：召回 ${scores.at(-1)!.detectionRecall.toFixed(3)}，损伤像素 ${scores.at(-1)!.damageCount}`);
  }
} catch (error) {
  if (!session.signal.aborted) throw error;
} finally {
  await session.close();
  monitor.stop();
  probe.close();
}

if (session.signal.aborted || scores.length !== limited.length) {
  console.error("eval:real: 评测未完成");
  process.exit(2);
}
const report = buildRealReport(parsed.options.gpu, scores);
writeFileAtomically(join(out, "report.json"), JSON.stringify(report, null, 1));
console.log(formatRealSummaryZh(report));
console.log(`报告：${join(out, "report.json")}`);
process.exit(0);
