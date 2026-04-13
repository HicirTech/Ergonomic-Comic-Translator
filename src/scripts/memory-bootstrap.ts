/**
 * memory-bootstrap.ts — creates an isolated Python venv and installs
 * mem0ai + qdrant-client so the memory module can run without Docker or a
 * separate Qdrant server.
 *
 * Usage:
 *   bun run memory:bootstrap
 *
 * The venv is created at <tempRootDir>/memory-venv and reused on subsequent
 * runs.  Ollama must already be running; pull the embedding model separately:
 *   ollama pull nomic-embed-text
 */

import { $ } from "bun";
import { existsSync } from "fs";
import { resolve } from "path";
import { tempRootDir } from "../config.ts";

const VENV_DIR_NAME = "memory-venv";

// Pinned to avoid supply-chain drift; bump deliberately when needed.
const MEMORY_DEPS = [
  "mem0ai==1.0.11",
  "qdrant-client==1.17.1",
];

const logStep = (message: string) => {
  console.log(`[memory-bootstrap] ${message}`);
};

const getVenvDir = () => resolve(tempRootDir, VENV_DIR_NAME);
export const getMemoryPython = () => resolve(getVenvDir(), "bin", "python");

export const ensureMemoryVenv = async () => {
  const venvDir = getVenvDir();
  const venvPython = getMemoryPython();

  if (existsSync(venvPython)) {
    logStep("memory venv already exists");
    return venvPython;
  }

  logStep(`creating memory venv at ${venvDir}`);

  // Prefer pyenv-managed Python 3.12 to match the project's pinned version;
  // fall back to the system python3 if pyenv is not available or HOME is not set.
  const homeDir = process.env.HOME;
  const pyenvPython = homeDir ? `${homeDir}/.pyenv/versions/3.12.9/bin/python3.12` : "";
  const systemPython = (pyenvPython && existsSync(pyenvPython)) ? pyenvPython : "python3";

  const createResult = await $`${systemPython} -m venv ${venvDir}`.nothrow();
  if (createResult.exitCode !== 0) {
    throw new Error("Failed to create memory venv");
  }

  logStep("upgrading pip");
  const pipUpgrade = await $`${venvPython} -m pip install --upgrade pip`.nothrow();
  if (pipUpgrade.exitCode !== 0) {
    throw new Error("Failed to upgrade pip in memory venv");
  }

  logStep(`installing dependencies: ${MEMORY_DEPS.join(", ")}`);
  const depsResult = await $`${venvPython} -m pip install ${MEMORY_DEPS}`.nothrow();
  if (depsResult.exitCode !== 0) {
    throw new Error("Failed to install memory dependencies");
  }

  logStep("memory venv ready");
  logStep("NOTE: memory is enabled by default. Make sure Ollama is running and pull the embedding model:");
  logStep("  ollama pull nomic-embed-text");
  logStep("To disable memory, set MEMORY_ENABLED=false in your environment.");

  return venvPython;
};

if (import.meta.main) {
  void ensureMemoryVenv()
    .then((pythonPath) => {
      console.log(`memory Python: ${pythonPath}`);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
