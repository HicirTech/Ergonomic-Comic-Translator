// Translates a volume from a vision run (bun run vision): names and terms first, then page by page.
// Loads LLMs on the GPU: only with the owner's go-ahead (see CLAUDE.md, G0).
// usage: bun run translate <vision-run-dir> [--lang ja|ko|zh-Hant|en] [--ltr] [--history 2000]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { dataPaths, resolveDataRoot } from "../core/data-paths.ts";
import type { LlmRole } from "../gov/interfaces/index.ts";
import { openResourceProbe } from "../gov/probe.ts";
import { ResourceMonitor } from "../gov/resource-monitor.ts";
import { llmRoleFor } from "../gov/tiers.ts";
import { buildGlossary } from "../pipeline/build-glossary.ts";
import type { PageVisionResult } from "../pipeline/interfaces/index.ts";
import { translateVolume } from "../pipeline/translate-volume.ts";
import { pageText } from "../pipeline/volume-text.ts";
import type { LlmSession } from "../sessions/interfaces/index.ts";
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

/**
 * Runs `work` on a session opened for `role` and unloads it afterwards; exits when no session can open.
 * A red light stops the server on purpose: the aborted request then ends the work with null.
 */
const withSession = async <T>(role: LlmRole, work: (session: LlmSession) => Promise<T>): Promise<T | null> => {
  const opening = await openLlmSession(paths, monitor, "translate cli", role);
  if (!opening.ok) {
    monitor.stop();
    probe.close();
    console.error(opening.failure.messageZh);
    process.exit(opening.failure.kind === "busy" ? 3 : 2);
  }
  const { session } = opening;
  session.signal.addEventListener("abort", () => console.error(`红灯，停止翻译并卸载模型：${session.signal.reason}`));
  console.log(`已加载 ${session.tierId} ${session.tierLabel}（${session.device}）`);
  try {
    return await work(session);
  } catch (error) {
    if (!session.signal.aborted) throw error;
    return null;
  } finally {
    await session.close();
  }
};

try {
  const glossary = await withSession("general", ({ complete, modelSha }) => buildGlossary(pages.flatMap((page) => page.lines), language, complete, modelSha));
  if (glossary) {
    console.log(`人物与名词：${glossary.terms.length} 个（跳过 ${glossary.skippedChunks} 块，未定 ${glossary.unfixed} 个，冲突 ${glossary.conflicts.length} 处）`);
    mkdirSync(join(run, "translations"), { recursive: true });
    writeFileSync(join(run, "translations", "glossary.json"), JSON.stringify(glossary, null, 1));

    // The translator of this language may be another model than the one that fixed the names.
    const results = await withSession(llmRoleFor(language), (session) => translateVolume(pages, {
      terms: glossary.terms,
      roleTable: glossary.glossary.roleTable,
      glossarySha: glossary.glossary.sha256,
      language,
      complete: session.complete,
      modelSha: session.modelSha,
      contract: session.contract,
      historyBudget,
    }));
    if (results) {
      for (const result of results) {
        writeFileSync(join(run, "translations", `${String(result.page).padStart(4, "0")}.json`), JSON.stringify(result));
      }
      const flagged = results.reduce((sum, result) => sum + Object.keys(result.flags).length, 0);
      console.log(`完成：${results.length} 页，${results.reduce((sum, result) => sum + result.units.length, 0)} 句，需要看看 ${flagged} 句，请求 ${results.reduce((sum, result) => sum + result.requests, 0)} 次`);
    }
  }
} finally {
  monitor.stop();
  probe.close();
}
