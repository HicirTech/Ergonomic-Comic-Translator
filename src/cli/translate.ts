// Translates a volume from a vision run (bun run vision): names and terms first, then page by page.
// Loads an LLM on the GPU: only with the owner's go-ahead (see CLAUDE.md, G0).
// usage: bun run translate <vision-run-dir> [--lang ja|ko|zh-Hant|en] [--ltr] [--history 2000]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { dataPaths, resolveDataRoot } from "../core/data-paths.ts";
import { openResourceProbe } from "../gov/probe.ts";
import { ResourceMonitor } from "../gov/resource-monitor.ts";
import { buildGlossary } from "../pipeline/build-glossary.ts";
import type { PageVisionResult } from "../pipeline/interfaces/index.ts";
import { translateVolume } from "../pipeline/translate-volume.ts";
import { pageText } from "../pipeline/volume-text.ts";
import { openLlmSession } from "../sessions/llm-session.ts";
import type { SourceLanguage } from "../translate/interfaces/index.ts";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const runDirectory = args.find((arg, index) => !arg.startsWith("--") && !["--lang", "--history"].includes(args[index - 1] ?? ""));
if (!runDirectory) {
  console.error("用法：bun run translate <vision 结果目录> [--lang ja|ko|zh-Hant|en] [--ltr] [--history 2000]");
  process.exit(64);
}
const language = (option("--lang") ?? "ja") as SourceLanguage;
const historyBudget = Number(option("--history") ?? 2000);
const run = resolve(runDirectory);

const pages = readdirSync(join(run, "results")).filter((name) => name.endsWith(".json")).sort().map((name) => {
  const { page, result } = JSON.parse(readFileSync(join(run, "results", name), "utf8")) as { page: { ordinal: number }; result: PageVisionResult };
  return pageText(page.ordinal, result.regions, args.includes("--ltr") ? "ltr" : "rtl");
});
console.log(`读入 ${pages.length} 页，${pages.reduce((sum, page) => sum + page.units.length, 0)} 句`);

const paths = dataPaths(resolveDataRoot());
const probe = openResourceProbe();
const monitor = new ResourceMonitor(probe);
monitor.start();
const opening = await openLlmSession(paths, monitor, "translate cli");
if (!opening.ok) {
  monitor.stop();
  probe.close();
  console.error(opening.failure.messageZh);
  process.exit(opening.failure.kind === "busy" ? 3 : 2);
}
const session = opening.session;
session.signal.addEventListener("abort", () => console.error(`红灯，停止翻译并卸载模型：${session.signal.reason}`));

try {
  console.log(`已加载 ${session.tierId} ${session.tierLabel}（${session.device}）`);
  const { complete, modelSha } = session;
  const glossary = await buildGlossary(pages.flatMap((page) => page.lines), language, complete, modelSha);
  console.log(`人物与名词：${glossary.terms.length} 个（跳过 ${glossary.skippedChunks} 块，未定 ${glossary.unfixed} 个，冲突 ${glossary.conflicts.length} 处）`);
  mkdirSync(join(run, "translations"), { recursive: true });
  writeFileSync(join(run, "translations", "glossary.json"), JSON.stringify(glossary, null, 1));

  const results = await translateVolume(pages, {
    terms: glossary.terms,
    roleTable: glossary.glossary.roleTable,
    glossarySha: glossary.glossary.sha256,
    language,
    complete,
    modelSha,
    historyBudget,
  });
  for (const result of results) {
    writeFileSync(join(run, "translations", `${String(result.page).padStart(4, "0")}.json`), JSON.stringify(result));
  }
  const flagged = results.reduce((sum, result) => sum + Object.keys(result.flags).length, 0);
  console.log(`完成：${results.length} 页，${results.reduce((sum, result) => sum + result.units.length, 0)} 句，需要看看 ${flagged} 句，请求 ${results.reduce((sum, result) => sum + result.requests, 0)} 次`);
} catch (error) {
  // A red light stops the server on purpose; the aborted request is the expected result.
  if (!session.signal.aborted) throw error;
} finally {
  await session.close();
  monitor.stop();
  probe.close();
}
