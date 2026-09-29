// Downloads locked model files into the data directory. Never loads or runs a model.
// usage: bun run models:fetch [pack|model-id ...]   (default: vision)   bun run models:fetch --list
import { dataPaths, resolveDataRoot } from "../core/data-paths.ts";
import { formatGb } from "../core/units.ts";
import { downloadFile } from "../models/download.ts";
import { modelDownloadItems, readModelsLock } from "../models/lock.ts";
import { expandModelSelection, modelPacks } from "../models/packs.ts";
import { createProgressPrinter } from "./progress-printer.ts";

const args = process.argv.slice(2);
const lock = readModelsLock();

if (args.includes("--list")) {
  for (const [id, model] of Object.entries(lock.models)) {
    const bytes = model.files.reduce((sum, file) => sum + file.size, 0);
    console.log(`${id.padEnd(20)} ${formatGb(bytes, 2).padStart(9)}  ${model.license.padEnd(10)} ${model.role}`);
  }
  console.log(`\n组合（pack）：${Object.keys(modelPacks).join(", ")}`);
  process.exit(0);
}

const modelIds = expandModelSelection(args.length > 0 ? args : ["vision"]);
const paths = dataPaths(resolveDataRoot());
const items = modelDownloadItems(lock, modelIds, paths);
const totalBytes = items.reduce((sum, item) => sum + item.size, 0);
console.log(`模型目录：${paths.models}`);
console.log(`将校验或下载 ${items.length} 个文件，共 ${formatGb(totalBytes, 2)}：${modelIds.join(", ")}`);

const printProgress = createProgressPrinter();
for (const item of items) {
  const outcome = await downloadFile(item, { onProgress: printProgress });
  console.log(`${outcome === "present" ? "已存在" : "已完成"}（sha256 校验通过）：${item.destination}`);
}
console.log("全部完成。");
