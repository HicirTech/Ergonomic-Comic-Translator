import { getLogger } from "../logger.ts";
import type log4js from "log4js";

type Logger = ReturnType<typeof log4js.getLogger>;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedCliArgs {
  /** The logger instance bound to the script name. */
  logger: Logger;
  /** Upload / OCR scope ID (first positional argument). */
  scope: string;
  /** Optional 1-based page number (second positional argument). */
  pageNumber: number | undefined;
  /** Remaining key-value flags (e.g. --lang Chinese). */
  flags: Record<string, string>;
}

interface CliConfig {
  /** Script name used for logging and usage messages. */
  name: string;
  /** One-line description of what the script does. */
  description: string;
  /** Optional named flags to accept, e.g. [{ key: "--lang", description: "Target language", default: "Chinese" }]. */
  flags?: CliFlag[];
}

interface CliFlag {
  key: string;
  description: string;
  default?: string;
}

// ── Implementation ────────────────────────────────────────────────────────────

const printUsage = (config: CliConfig, logger: Logger): never => {
  const flagsUsage = config.flags?.map((f) => ` [${f.key} <${f.key.replace("--", "")}>]`).join("") ?? "";
  logger.error(`Usage: bun run ${config.name} <id> [page]${flagsUsage}`);
  logger.error("  id   — OCR output scope (uploadId)");
  logger.error("  page — optional 1-based page number");
  if (config.flags) {
    for (const flag of config.flags) {
      const def = flag.default ? ` (default: ${flag.default})` : "";
      logger.error(`  ${flag.key} — ${flag.description}${def}`);
    }
  }
  process.exit(1);
};

/**
 * Parse CLI arguments with the standard pattern shared across all CLI scripts:
 *   bun run <script> <scope> [page] [--flag value ...]
 *
 * Exits with a usage message if required arguments are missing or invalid.
 */
export const parseCliArgs = (config: CliConfig): ParsedCliArgs => {
  const logger = getLogger(config.name);
  const raw = process.argv.slice(2);

  // Extract named flags first
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    const flagDef = config.flags?.find((f) => f.key === arg);
    if (flagDef) {
      const value = raw[i + 1];
      if (!value || value.startsWith("--")) {
        logger.error(`${arg} requires a value, e.g. ${arg} ${flagDef.default ?? "value"}`);
        process.exit(1);
      }
      flags[arg] = value;
      i++; // skip the value
    } else {
      positional.push(arg);
    }
  }

  // Apply flag defaults
  if (config.flags) {
    for (const flag of config.flags) {
      if (flags[flag.key] === undefined && flag.default !== undefined) {
        flags[flag.key] = flag.default;
      }
    }
  }

  if (positional.length === 0) printUsage(config, logger);

  const scope = positional[0];
  if (!scope) printUsage(config, logger);

  let pageNumber: number | undefined;
  if (positional[1] !== undefined) {
    pageNumber = Number.parseInt(positional[1], 10);
    if (!Number.isFinite(pageNumber) || pageNumber < 1) {
      logger.error(`Invalid page number: ${positional[1]}`);
      process.exit(1);
    }
  }

  return { logger, scope, pageNumber, flags };
};
