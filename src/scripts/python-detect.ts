import { $ } from "bun";
import { existsSync } from "fs";
import { resolve } from "path";
import { projectRoot as defaultProjectRoot } from "../config.ts";
import { commandAvailable, decodeBuffer } from "./shell-utils.ts";

export interface PythonLayerDetection {
  poetryAvailable: boolean;
  pyprojectPresent: boolean;
  poetryConfigPresent: boolean;
  pythonVersionFilePresent: boolean;
  environmentReady: boolean;
  environmentPath: string | null;
  pythonExecutable: string | null;
  paddleInstalled: boolean;
  paddleOcrInstalled: boolean;
}

const poetryOutput = async (projectRoot: string, args: string[]) => {
  const result = await $`poetry ${args}`.cwd(projectRoot).nothrow().quiet();
  return result.exitCode === 0 ? decodeBuffer(result.stdout).trim() : null;
};

const poetryPythonImport = async (projectRoot: string, moduleName: string) => {
  const result = await $`poetry run python -c ${`import ${moduleName}`}`.cwd(projectRoot).nothrow().quiet();
  return result.exitCode === 0;
};

export const detectPythonLayer = async ({ projectRoot = defaultProjectRoot }: { projectRoot?: string } = {}): Promise<PythonLayerDetection> => {
  const poetryAvailable = await commandAvailable("poetry");
  const pyprojectPresent = existsSync(resolve(projectRoot, "pyproject.toml"));
  const poetryConfigPresent = existsSync(resolve(projectRoot, "poetry.toml"));
  const pythonVersionFilePresent = existsSync(resolve(projectRoot, ".python-version"));

  if (!poetryAvailable || !pyprojectPresent) {
    return {
      poetryAvailable,
      pyprojectPresent,
      poetryConfigPresent,
      pythonVersionFilePresent,
      environmentReady: false,
      environmentPath: null,
      pythonExecutable: null,
      paddleInstalled: false,
      paddleOcrInstalled: false,
    };
  }

  const environmentPath = await poetryOutput(projectRoot, ["env", "info", "--path"]);
  const pythonExecutable = await poetryOutput(projectRoot, ["env", "info", "--executable"]);
  const environmentReady = Boolean(environmentPath && pythonExecutable);

  return {
    poetryAvailable,
    pyprojectPresent,
    poetryConfigPresent,
    pythonVersionFilePresent,
    environmentReady,
    environmentPath,
    pythonExecutable,
    paddleInstalled: environmentReady ? await poetryPythonImport(projectRoot, "paddle") : false,
    paddleOcrInstalled: environmentReady ? await poetryPythonImport(projectRoot, "paddleocr") : false,
  };
};

if (import.meta.main) {
  const main = async () => {
    const detection = await detectPythonLayer();
    console.log(JSON.stringify(detection, null, 2));
  };

  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}