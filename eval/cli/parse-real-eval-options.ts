import type { RealEvalOptions } from "./interfaces/index.ts";
import { defaultLineModel, parseLineModel } from "./parse-line-model.ts";

const valueOptions = new Set(["--out", "--pages", "--lines"]);

const usage = "用法：bun run eval:real [--out 目录] [--pages 正整数] [--lines mobile|server] [--gpu] <zip|cbz|文件夹> [...]";

export const realEvalUsage = usage;

const parseWhole = (value: string) => (/^\d+$/u.test(value) ? Number(value) : null);

type RealEvalParse = { ok: true; options: RealEvalOptions } | { ok: false; error: string };

/**
 * Walks argv once. A value is consumed only when its option is present, so a missing option never
 * drops the following positional (the bug in src/cli/render.ts).
 */
export const parseRealEvalArgs = (args: readonly string[]): RealEvalParse => {
  const positionals: string[] = [];
  let out: string | null = null;
  let pages: number | null = null;
  let lines = defaultLineModel;
  let gpu = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (valueOptions.has(arg)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) return { ok: false, error: `${usage}\n缺少 ${arg} 的值` };
      index += 1;
      if (arg === "--out") {
        out = value;
      } else if (arg === "--pages") {
        const parsed = parseWhole(value);
        if (parsed === null || parsed < 1) return { ok: false, error: `${usage}\n--pages 需要正整数` };
        pages = parsed;
      } else {
        const model = parseLineModel(value);
        if (model === null) return { ok: false, error: `${usage}\n--lines 需要 mobile 或 server` };
        lines = model;
      }
    } else if (arg === "--gpu") {
      gpu = true;
    } else if (arg.startsWith("--")) {
      return { ok: false, error: `${usage}\n未知参数 ${arg}` };
    } else {
      positionals.push(arg);
    }
  }
  return { ok: true, options: { out, pages, lines, gpu, positionals } };
};
