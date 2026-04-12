import { existsSync, readFileSync } from "fs";
import { detectAmdGpu } from "./amd-detect.ts";
import { detectCudaEnvironment } from "./cuda-detect.ts";
import { detectNvidiaGpu } from "./nvidia-detect.ts";
import { commandAvailable, commandOutput } from "./shell-utils.ts";

export interface SystemLayerDetection {
  isLinux: boolean;
  isWsl2: boolean;
  brewAvailable: boolean;
  brewPrefix: string | null;
  poetryAvailable: boolean;
  pyenvAvailable: boolean;
  python3Available: boolean;
  python3Version: string | null;
  nvidia: Awaited<ReturnType<typeof detectNvidiaGpu>>;
  amd: Awaited<ReturnType<typeof detectAmdGpu>>;
  cuda: Awaited<ReturnType<typeof detectCudaEnvironment>>;
  gpuBackend: "nvidia" | "amd-zluda" | "none";
}

const detectWsl2 = () => {
  if (process.platform !== "linux") {
    return false;
  }

  const releaseFile = "/proc/sys/kernel/osrelease";
  if (!existsSync(releaseFile)) {
    return false;
  }

  const release = readFileSync(releaseFile, "utf8").toLowerCase();
  return release.includes("wsl2") || release.includes("microsoft");
};

export const detectSystemLayer = async (): Promise<SystemLayerDetection> => {
  const brewAvailable = await commandAvailable("brew");
  const poetryAvailable = await commandAvailable("poetry");
  const pyenvAvailable = await commandAvailable("pyenv");
  const python3Available = await commandAvailable("python3");

  const nvidia = await detectNvidiaGpu();
  const amd = await detectAmdGpu();
  const cuda = await detectCudaEnvironment();

  let gpuBackend: "nvidia" | "amd-zluda" | "none" = "none";
  if (nvidia.nvidiaSmiAvailable && nvidia.gpuPresent) {
    gpuBackend = "nvidia";
  } else if (amd.amdGpuPresent && amd.zludaAvailable) {
    gpuBackend = "amd-zluda";
  }

  return {
    isLinux: process.platform === "linux",
    isWsl2: detectWsl2(),
    brewAvailable,
    brewPrefix: brewAvailable ? await commandOutput("brew", ["--prefix"]) : null,
    poetryAvailable,
    pyenvAvailable,
    python3Available,
    python3Version: python3Available ? await commandOutput("python3", ["--version"]) : null,
    nvidia,
    amd,
    cuda,
    gpuBackend,
  };
};

if (import.meta.main) {
  const main = async () => {
    const detection = await detectSystemLayer();
    console.log(JSON.stringify(detection, null, 2));
  };

  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}