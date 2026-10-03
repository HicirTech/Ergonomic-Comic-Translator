import type { OcrEvalOptions } from "./interfaces/index.ts";

export const defaultSeed = 1;
/** One page of each role, so every layout kind and every horizontal/vertical pair is present. */
export const defaultPageCount = 9;

const valueOptions = new Set(["--out", "--seed", "--pages"]);

const usage = "用法：bun run eval:ocr [--out 目录] [--seed 非负整数] [--pages 正整数] [--gpu]";

export const ocrEvalUsage = usage;

const parseWhole = (value: string) => (/^\d+$/u.test(value) ? Number(value) : null);

type OcrEvalParse = { ok: true; options: OcrEvalOptions } | { ok: false; error: string };

/**
 * Walks argv once. A value is consumed only when its option is present, so a missing option never
 * drops the following positional (the bug in src/cli/render.ts).
 */
export const parseOcrEvalArgs = (args: readonly string[]): OcrEvalParse => {
  const positionals: string[] = [];
  let out: string | null = null;
  let seed = defaultSeed;
  let pages = defaultPageCount;
  let gpu = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (valueOptions.has(arg)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) return { ok: false, error: `${usage}\n缺少 ${arg} 的值` };
      index += 1;
      if (arg === "--out") {
        out = value;
      } else if (arg === "--seed") {
        const parsed = parseWhole(value);
        if (parsed === null) return { ok: false, error: `${usage}\n--seed 需要非负整数` };
        seed = parsed;
      } else {
        const parsed = parseWhole(value);
        if (parsed === null || parsed < 1) return { ok: false, error: `${usage}\n--pages 需要正整数` };
        pages = parsed;
      }
    } else if (arg === "--gpu") {
      gpu = true;
    } else if (arg.startsWith("--")) {
      return { ok: false, error: `${usage}\n未知参数 ${arg}` };
    } else {
      positionals.push(arg);
    }
  }
  return { ok: true, options: { out, seed, pages, gpu, positionals } };
};
