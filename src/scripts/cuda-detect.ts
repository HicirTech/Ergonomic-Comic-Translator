import { $ } from "bun";
import { getZludaLibraryPath } from "./amd-detect.ts";
import { commandAvailable, decodeBuffer } from "./shell-utils.ts";

export interface CudaEnvironmentDetection {
  cudaSupported: boolean;
  nvidiaSmiAvailable: boolean;
  gpuPresent: boolean;
  cudaVersionFromDriver: string | null;
  nvccAvailable: boolean;
  nvccVersion: string | null;
  zludaCompat: boolean;
}

const parseCudaVersion = (output: string) => {
  const versionMatch = output.match(/release\s+([0-9.]+),/i);
  return versionMatch ? versionMatch[1] : null;
};

const parseNvidiaCudaVersion = (output: string) => {
  const match = output.match(/CUDA Version:\s*([0-9.]+)/i);
  return match ? match[1] : null;
};

const getNvidiaSmiInfo = async () => {
  const result = await $`nvidia-smi`.nothrow().quiet();
  if (result.exitCode !== 0) {
    return {
      nvidiaSmiAvailable: false,
      gpuPresent: false,
      cudaVersionFromDriver: null,
    };
  }

  const output = decodeBuffer(result.stdout);
  const gpuPresent = /\|\s+\d+\s+/.test(output);

  return {
    nvidiaSmiAvailable: true,
    gpuPresent,
    cudaVersionFromDriver: parseNvidiaCudaVersion(output),
  };
};

const getNvccVersion = async () => {
  const result = await $`nvcc --version`.nothrow().quiet();
  if (result.exitCode !== 0) {
    return {
      nvccAvailable: false,
      nvccVersion: null,
    };
  }

  return {
    nvccAvailable: true,
    nvccVersion: parseCudaVersion(decodeBuffer(result.stdout) + decodeBuffer(result.stderr)),
  };
};

export const detectCudaEnvironment = async (): Promise<CudaEnvironmentDetection> => {
  const nvidia = await getNvidiaSmiInfo();
  const nvcc = await getNvccVersion();
  const zludaPath = await getZludaLibraryPath();
  const zludaCompat = zludaPath !== null;

  const nativeCuda = nvidia.nvidiaSmiAvailable && nvidia.gpuPresent && nvidia.cudaVersionFromDriver !== null;

  return {
    cudaSupported: nativeCuda || zludaCompat,
    nvidiaSmiAvailable: nvidia.nvidiaSmiAvailable,
    gpuPresent: nvidia.gpuPresent || zludaCompat,
    cudaVersionFromDriver: nvidia.cudaVersionFromDriver,
    nvccAvailable: nvcc.nvccAvailable,
    nvccVersion: nvcc.nvccVersion,
    zludaCompat,
  };
};

if (import.meta.main) {
  const main = async () => {
    const detection = await detectCudaEnvironment();
    console.log(JSON.stringify(detection, null, 2));
  };

  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}