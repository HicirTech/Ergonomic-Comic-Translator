// Real-page eval from textless pairs. Loads vision models; run only with the owner's go-ahead.
// The report stores ids, boxes and numbers. It does not store page text or image bytes.
// A page counts as textless only after OCR finds no readable text where it differs from its near-identical
// pages (ground-truth/confirm-textless.ts). classifyPages' greedy pairing is not used. Clusters are read
// one by one, so --pages n stops the OCR check too: the ground-truth counts then cover the clusters read.
// usage: bun run eval:real [--out <dir>] [--pages <n>] [--lines mobile|server] [--gpu] <zip|cbz|folder> [...]
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
import { makeThumbnail } from "../../src/stages/profile/thumbnail.ts";
import { clusterNearIdenticalPages } from "../ground-truth/cluster-pages.ts";
import { confirmCluster } from "../ground-truth/confirm-textless.ts";
import type { ClusterMember, ConfirmedPair, TextlessConfirmation } from "../ground-truth/interfaces/index.ts";
import { summarizeGroundTruth } from "../ground-truth/summarize-ground-truth.ts";
import { formatRealSummaryZh } from "./format-real-summary-zh.ts";
import type { RealPairScore } from "./interfaces/index.ts";
import { parseRealEvalArgs, realEvalUsage } from "./parse-real-eval-options.ts";
import { buildRealReport, scoreRealPair } from "./real-score.ts";

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
const clusters = clusterNearIdenticalPages(thumbnails);
const byOrdinal = new Map(pages.map((page) => [page.ordinal, page]));
console.log(`相似页簇 ${clusters.length} 个，共 ${clusters.reduce((sum, cluster) => sum + cluster.length, 0)} 页`);

const probe = openResourceProbe();
const monitor = new ResourceMonitor(probe);
monitor.start();
const opening = await openVisionSession(paths, monitor, !parsed.options.gpu, "real eval", { lineModel: parsed.options.lines });
if (!opening.ok) {
  monitor.stop();
  probe.close();
  console.error(opening.failure.messageZh);
  process.exit(opening.failure.kind === "busy" ? 3 : 2);
}
const session = opening.session;
session.signal.addEventListener("abort", () => console.error(`红灯，停止并释放显卡：${session.signal.reason}`));

const scores: RealPairScore[] = [];
const confirmations: TextlessConfirmation[] = [];
const limit = parsed.options.pages;
const limitReached = () => limit !== null && scores.length >= limit;
const waitWhileYellow = async () => {
  while (!session.signal.aborted && monitor.latest?.assessment.light === "yellow") await Bun.sleep(1000);
};

const scorePair = async (pair: ConfirmedPair, members: readonly ClusterMember[]) => {
  const textPage = byOrdinal.get(pair.textOrdinal)!;
  const textlessPage = byOrdinal.get(pair.textlessOrdinal)!;
  const imageOf = (ordinal: number) => members.find((member) => member.ordinal === ordinal)!.image;
  const pageId = `p${String(textPage.ordinal).padStart(4, "0")}`;
  const vision = await runVisionPage(session.client, textPage.storedPath, pageId, join(out, "work"), evalWritingPrior);
  return scoreRealPair({
    id: pageId,
    textOrdinal: textPage.ordinal,
    textlessOrdinal: textlessPage.ordinal,
    textSha256: textPage.sha256,
    textlessSha256: textlessPage.sha256,
  }, imageOf(textPage.ordinal), imageOf(textlessPage.ordinal), await decodeRgb(vision.cleanedPath), vision);
};

try {
  console.log(`模型已加载：${session.loads.map((load) => `${load.engine}@${load.ep} ${Math.round(load.loadMs)} ms`).join("，")}`);
  for (const [index, cluster] of clusters.entries()) {
    if (limitReached()) break;
    await waitWhileYellow();
    if (session.signal.aborted) break;
    const members = await Promise.all(cluster.map(async (ordinal): Promise<ClusterMember> => {
      const { storedPath } = byOrdinal.get(ordinal)!;
      return { ordinal, imagePath: storedPath, image: await decodeRgb(storedPath) };
    }));
    const confirmation = await confirmCluster(session.client, members);
    confirmations.push(confirmation);
    console.log(`第 ${index + 1}/${clusters.length} 簇：${members.length} 页，确认 ${confirmation.pairs.length} 对`);
    for (const pair of confirmation.pairs) {
      if (limitReached()) break;
      await waitWhileYellow();
      if (session.signal.aborted) break;
      scores.push(await scorePair(pair, members));
      console.log(`第 ${scores.length}${limit === null ? "" : `/${limit}`} 对：召回 ${scores.at(-1)!.detectionRecall.toFixed(3)}，损伤像素 ${scores.at(-1)!.damageCount}`);
    }
  }
} catch (error) {
  if (!session.signal.aborted) throw error;
} finally {
  await session.close();
  monitor.stop();
  probe.close();
}

if (session.signal.aborted) {
  console.error("eval:real: 评测未完成");
  process.exit(2);
}
const report = buildRealReport(
  { gpu: parsed.options.gpu, lines: parsed.options.lines, groundTruth: summarizeGroundTruth(pages.length, clusters, confirmations) },
  scores,
);
writeFileAtomically(join(out, "report.json"), JSON.stringify(report, null, 1));
console.log(formatRealSummaryZh(report));
console.log(`报告：${join(out, "report.json")}`);
process.exit(0);
