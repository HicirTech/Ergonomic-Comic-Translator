import { $ } from "bun";
import { detectSystemLayer } from "./system-detect.ts";

const logStep = (message: string) => {
  console.log(`[system-bootstrap] ${message}`);
};

const installWithBrew = async (formula: string) => {
  const installed = await $`brew list --versions ${formula}`.nothrow().quiet();
  if (installed.exitCode === 0) {
    return;
  }

  logStep(`installing ${formula} with Homebrew`);
  const result = await $`brew install ${formula}`.nothrow();
  if (result.exitCode !== 0) {
    throw new Error(`Failed to install ${formula} with Homebrew.`);
  }
};

export const ensureSystemLayer = async () => {
  const detection = await detectSystemLayer();

  if (!detection.isLinux || !detection.isWsl2) {
    throw new Error("This project expects a Linux shell running inside WSL2.");
  }

  if (!detection.brewAvailable) {
    throw new Error("Homebrew is required on the WSL2 side before bootstrapping the project.");
  }

  await installWithBrew("poetry");
  await installWithBrew("pyenv");

  const hasNvidiaGpu = detection.nvidia.nvidiaSmiAvailable && detection.nvidia.gpuPresent;
  const hasAmdZluda = detection.amd.amdGpuPresent && detection.amd.zludaAvailable;

  if (!hasNvidiaGpu && !hasAmdZluda) {
    throw new Error(
      "No usable GPU is visible inside WSL2. " +
        "Either an NVIDIA GPU (with driver) or an AMD GPU (with ROCm + ZLUDA) is required. " +
        "Fix the system layer before continuing.",
    );
  }

  if (hasAmdZluda && !hasNvidiaGpu) {
    logStep(`AMD GPU detected with ZLUDA compatibility layer at: ${detection.amd.zludaPath ?? "(binary only)"}`);
    if (detection.amd.rocmVersion) {
      logStep(`ROCm version: ${detection.amd.rocmVersion}`);
    }
  }

  return detectSystemLayer();
};

if (import.meta.main) {
  const main = async () => {
    const detection = await ensureSystemLayer();
    console.log(JSON.stringify(detection, null, 2));
  };

  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}