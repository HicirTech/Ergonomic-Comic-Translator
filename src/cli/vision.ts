// Runs the vision half of the pipeline (detect, lines, OCR, masks, cleaning) over a volume, without any LLM.
// Loads ONNX models on the GPU: only with the owner's go-ahead (see CLAUDE.md, G0).
// usage: bun run vision <zip|cbz|folder|image...> [--out <dir>] [--cpu] [--prior v|h]
import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { dataPaths, resolveDataRoot } from "../core/data-paths.ts";
import { openResourceProbe } from "../gov/probe.ts";
import { ResourceMonitor } from "../gov/resource-monitor.ts";
import { runVisionPage } from "../pipeline/vision-page.ts";
import { openVisionSession } from "../sessions/vision-session.ts";
import { ingestEntries } from "../stages/ingest/ingest.ts";
import { readSources } from "../stages/ingest/read-sources.ts";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const inputs = args.filter((arg, index) => !arg.startsWith("--") && !["--out", "--prior"].includes(args[index - 1] ?? ""));
if (inputs.length === 0) {
  console.error("用法：bun run vision <zip|cbz|文件夹|图片...> [--out 目录] [--cpu] [--prior v|h]");
  process.exit(64);
}
const prior = option("--prior") === "h" ? "h" : "v";
const paths = dataPaths(resolveDataRoot());
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const out = resolve(option("--out") ?? join(paths.root, "runs", `vision-${stamp}`));
mkdirSync(join(out, "work"), { recursive: true });
mkdirSync(join(out, "results"), { recursive: true });

const { pages, skipped } = await ingestEntries(await readSources(inputs.map((input) => resolve(input))), paths.pages);
console.log(`读入 ${pages.length} 页，跳过 ${skipped.length} 个文件；结果目录：${out}`);

const probe = openResourceProbe();
const monitor = new ResourceMonitor(probe);
monitor.start();
const opening = await openVisionSession(paths, monitor, args.includes("--cpu"), "vision cli");
if (!opening.ok) {
  monitor.stop();
  probe.close();
  console.error(opening.failure.messageZh);
  process.exit(opening.failure.kind === "busy" ? 3 : 2);
}
const session = opening.session;
session.signal.addEventListener("abort", () => console.error(`红灯，停止并释放显卡：${session.signal.reason}`));

try {
  console.log(`模型已加载：${session.loads.map((load) => `${load.engine}@${load.ep} ${Math.round(load.loadMs)} ms`).join("，")}`);
  for (const page of pages) {
    while (!session.signal.aborted && monitor.latest?.assessment.light === "yellow") {
      await Bun.sleep(1000);
    }
    if (session.signal.aborted) break;
    const result = await runVisionPage(session.client, page.storedPath, page.sha256, join(out, "work"), prior);
    writeFileSync(join(out, "results", `${String(page.ordinal).padStart(4, "0")}.json`), JSON.stringify({ page, result }));
    const utterances = result.regions.reduce((sum, region) => sum + region.utterances.length, 0);
    const total = Object.values(result.timingsMs).reduce((sum, ms) => sum + ms, 0);
    console.log(`第 ${page.ordinal}/${pages.length} 页：${result.regions.length} 个区域，${utterances} 句，用时 ${(total / 1000).toFixed(1)} s`);
  }
} catch (error) {
  // A red light kills the workers on purpose; the in-flight request failing is the expected result.
  if (!session.signal.aborted) throw error;
} finally {
  await session.close();
  monitor.stop();
  probe.close();
}
