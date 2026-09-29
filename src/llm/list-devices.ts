import type { LlamaDevice } from "./interfaces/index.ts";

const devicePattern = /^\s*([A-Za-z]+\d+):\s+(.+?)\s+\((\d+) MiB, \d+ MiB free\)\s*$/u;

export const parseListDevices = (output: string): LlamaDevice[] =>
  output.split(/\r?\n/u).flatMap((line) => {
    const match = devicePattern.exec(line);
    return match ? [{ name: match[1]!, description: match[2]!, totalMiB: Number(match[3]) }] : [];
  });

/**
 * The llama.cpp device for a DXGI adapter: same name, and among several identical cards the one whose
 * memory size is closest. The index order of Vulkan and DXGI differs, so names are matched, never indices.
 */
export const deviceForAdapter = (devices: readonly LlamaDevice[], adapterName: string, adapterMiB: number) =>
  devices
    .filter((device) => device.description.toLowerCase().includes(adapterName.toLowerCase()))
    .sort((a, b) => Math.abs(a.totalMiB - adapterMiB) - Math.abs(b.totalMiB - adapterMiB))[0] ?? null;
