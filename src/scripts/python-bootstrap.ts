import { $ } from "bun";
import { projectRoot as defaultProjectRoot } from "../config.ts";
import { ensureSystemLayer } from "./system-bootstrap.ts";

const targetPythonVersion = "3.12.9";

const runOrThrow = async (command: ReturnType<typeof $>, errorMessage: string) => {
  const result = await command.nothrow();
  if (result.exitCode !== 0) {
    throw new Error(errorMessage);
  }
};

const getPyenvPythonPath = async () => {
  const prefixResult = await $`pyenv prefix ${targetPythonVersion}`.nothrow().quiet();
  if (prefixResult.exitCode !== 0) {
    throw new Error(`pyenv could not resolve Python ${targetPythonVersion}`);
  }

  const prefix = Buffer.from(prefixResult.stdout).toString("utf8").trim();
  return `${prefix}/bin/python`;
};

export const ensurePythonLayer = async ({ projectRoot = defaultProjectRoot }: { projectRoot?: string } = {}) => {
  await ensureSystemLayer();

  await runOrThrow($`pyenv install -s ${targetPythonVersion}`.cwd(projectRoot), `Failed to install Python ${targetPythonVersion} with pyenv.`);
  await runOrThrow($`pyenv local ${targetPythonVersion}`.cwd(projectRoot), `Failed to set local pyenv version to ${targetPythonVersion}.`);

  const pythonPath = await getPyenvPythonPath();
  await runOrThrow($`poetry config virtualenvs.in-project true --local`.cwd(projectRoot), "Failed to configure Poetry to use an in-project virtualenv.");
  await runOrThrow($`poetry env use ${pythonPath}`.cwd(projectRoot), "Failed to bind Poetry to the pyenv-managed Python interpreter.");
  await runOrThrow($`poetry install --no-interaction`.cwd(projectRoot), "Failed to install Poetry dependencies for PaddleOCR.");

  return pythonPath;
};

if (import.meta.main) {
  const main = async () => {
    const pythonPath = await ensurePythonLayer();
    console.log(pythonPath);
  };

  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}