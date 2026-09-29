// Derives D1 ground truth (text-area masks and boxes) from pages and their textless variants.
// CPU only, no models. Output stays outside the repository: benchmark-derived data is never committed.
// usage: bun run gt:d1 <volume.zip|folder> [--out <dir>]
import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import sharp from "sharp";
import { dataPaths, resolveDataRoot } from "../../src/core/data-paths.ts";
import { decodeRgb } from "../../src/imaging/page-image.ts";
import { ingestEntries } from "../../src/stages/ingest/ingest.ts";
import { readSources } from "../../src/stages/ingest/read-sources.ts";
import { classifyPages } from "../../src/stages/profile/page-profile.ts";
import { makeThumbnail } from "../../src/stages/profile/thumbnail.ts";
import { deriveTextAreas } from "../ground-truth/textless-diff.ts";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const inputs = args.filter((arg, index) => !arg.startsWith("--") && index !== outIndex + 1);
if (inputs.length === 0) {
  console.error("用法：bun run gt:d1 <基准卷 zip|文件夹> [--out 目录]");
  process.exit(64);
}
const paths = dataPaths(resolveDataRoot());
const benchRoot = process.env.COMIC_TRANSLATOR_BENCH_DIR?.trim() || join(paths.root, "bench");
const out = resolve(outIndex >= 0 ? args[outIndex + 1]! : join(benchRoot, "gt-d1"));
mkdirSync(join(out, "masks"), { recursive: true });

const { pages } = await ingestEntries(await readSources(inputs.map((input) => resolve(input))), join(paths.cache, "pages"));
const thumbnails = await Promise.all(pages.map((page) => makeThumbnail(page.storedPath, page.ordinal, page.width, page.height)));
const kinds = classifyPages(thumbnails);
const byOrdinal = new Map(pages.map((page) => [page.ordinal, page]));

const summary: { ordinal: number; sha256: string; variantSha256: string; boxes: number[][] }[] = [];
for (const [ordinal, kind] of kinds) {
  if (kind.kind !== "textless_variant") continue;
  const original = byOrdinal.get(kind.variantOf)!;
  const variant = byOrdinal.get(ordinal)!;
  const { mask, boxes } = deriveTextAreas(await decodeRgb(original.storedPath), await decodeRgb(variant.storedPath));
  await sharp(mask.map((value) => value * 255), { raw: { width: original.width, height: original.height, channels: 1 } })
    .png()
    .toFile(join(out, "masks", `${original.sha256}.png`));
  summary.push({ ordinal: original.ordinal, sha256: original.sha256, variantSha256: variant.sha256, boxes: boxes.map((box) => [box.x0, box.y0, box.x1, box.y1]) });
}
summary.sort((a, b) => a.ordinal - b.ordinal);
writeFileSync(join(out, "ground-truth.json"), JSON.stringify({ pages: summary }, null, 1));
const blank = [...kinds.values()].filter((kind) => kind.kind === "blank").length;
console.log(`共 ${pages.length} 页：配对 ${summary.length} 对，空白 ${blank} 页，真值区域 ${summary.reduce((sum, page) => sum + page.boxes.length, 0)} 个；输出：${out}`);
