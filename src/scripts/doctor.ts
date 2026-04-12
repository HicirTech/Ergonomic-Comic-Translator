import { detectPythonLayer } from "./python-detect.ts";
import { detectSystemLayer } from "./system-detect.ts";

if (import.meta.main) {
  const main = async () => {
    const report = {
      system: await detectSystemLayer(),
      python: await detectPythonLayer(),
    };

    console.log(JSON.stringify(report, null, 2));
  };

  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}