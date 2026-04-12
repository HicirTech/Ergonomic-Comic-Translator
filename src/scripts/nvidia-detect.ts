import { $ } from "bun";
import { commandAvailable, decodeBuffer } from "./shell-utils.ts";

export interface NvidiaGpuDetection {
  nvidiaSmiAvailable: boolean;
  gpuPresent: boolean;
  gpuCount: number;
  gpuNames: string[];
  driverVersion: string | null;
  cudaVersionFromDriver: string | null;
}

const parseNvidiaSmiHeader = (output: string) => {
  const driverMatch = output.match(/Driver Version:\s*([0-9.]+)/i);
  const cudaMatch = output.match(/CUDA Version:\s*([0-9.]+)/i);

  return {
    driverVersion: driverMatch ? driverMatch[1] : null,
    cudaVersionFromDriver: cudaMatch ? cudaMatch[1] : null,
  };
};

const queryGpuNames = async () => {
  const result = await $`nvidia-smi --query-gpu=name --format=csv,noheader`.nothrow().quiet();
  if (result.exitCode !== 0) {
    return [];
  }

  const names = decodeBuffer(result.stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return names;
};

export const detectNvidiaGpu = async (): Promise<NvidiaGpuDetection> => {
  const nvidiaSmiAvailable = await commandAvailable("nvidia-smi");
  if (!nvidiaSmiAvailable) {
    return {
      nvidiaSmiAvailable,
      gpuPresent: false,
      gpuCount: 0,
      gpuNames: [],
      driverVersion: null,
      cudaVersionFromDriver: null,
    };
  }

  const smiOutputResult = await $`nvidia-smi`.nothrow().quiet();
  const smiOutput = decodeBuffer(smiOutputResult.stdout);
  const header = parseNvidiaSmiHeader(smiOutput);
  const gpuNames = await queryGpuNames();

  return {
    nvidiaSmiAvailable,
    gpuPresent: gpuNames.length > 0,
    gpuCount: gpuNames.length,
    gpuNames,
    driverVersion: header.driverVersion,
    cudaVersionFromDriver: header.cudaVersionFromDriver,
  };
};

if (import.meta.main) {
  const main = async () => {
    const detection = await detectNvidiaGpu();
    console.log(JSON.stringify(detection, null, 2));
  };

  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}