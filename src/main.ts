import { getLogger } from "./logger.ts";
import { runOcrCli } from "./ocr";

void runOcrCli().catch((error: unknown) => {
  getLogger("ocr").error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});