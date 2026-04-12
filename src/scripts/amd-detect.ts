import { $ } from "bun";
import { existsSync, readdirSync, readFileSync } from "fs";
import { decodeBuffer } from "./shell-utils.ts";

export interface AmdGpuDetection {
  amdGpuPresent: boolean;
  gpuCount: number;
  gpuNames: string[];
  rocmSmiAvailable: boolean;
  rocmVersion: string | null;
  zludaAvailable: boolean;
  zludaPath: string | null;
  hipRuntimeAvailable: boolean;
  detectedVia: "rocm-smi" | "sysfs" | "lspci" | "wsl2-gpu-pv" | "none";
}

const detectAmdGpuFromSysfs = (): string[] => {
  const drmPath = "/sys/class/drm";
  if (!existsSync(drmPath)) {
    return [];
  }

  const names: string[] = [];

  try {
    const cards = readdirSync(drmPath).filter(
      (entry: string) => /^card\d+$/.test(entry) && existsSync(`${drmPath}/${entry}/device/vendor`),
    );

    for (const card of cards) {
      const vendorPath = `${drmPath}/${card}/device/vendor`;
      const vendor = readFileSync(vendorPath, "utf8").trim();
      // 0x1002 is AMD's PCI vendor ID
      if (vendor === "0x1002") {
        const namePath = `${drmPath}/${card}/device/product_name`;
        const ueventPath = `${drmPath}/${card}/device/uevent`;
        let gpuName = "AMD GPU";
        if (existsSync(namePath)) {
          gpuName = readFileSync(namePath, "utf8").trim();
        } else if (existsSync(ueventPath)) {
          const uevent = readFileSync(ueventPath, "utf8");
          const pciIdMatch = uevent.match(/PCI_ID=1002:([0-9A-Fa-f]+)/);
          if (pciIdMatch) {
            gpuName = `AMD GPU [${pciIdMatch[1]}]`;
          }
        }
        names.push(gpuName);
      }
    }
  } catch {
    // sysfs unavailable or unreadable
  }

  return names;
};

const detectAmdGpuFromLspci = async (): Promise<string[]> => {
  const result = await $`lspci`.nothrow().quiet();
  if (result.exitCode !== 0) {
    return [];
  }

  const output = decodeBuffer(result.stdout);
  const names: string[] = [];

  for (const line of output.split(/\r?\n/)) {
    if (/VGA|Display|3D/.test(line) && /\bAMD\b|\bATI\b|\bRadeon\b/i.test(line)) {
      const match = line.match(/:\s+(.+)$/);
      names.push(match ? match[1].trim() : "AMD GPU");
    }
  }

  return names;
};

const detectRocmSmi = async () => {
  const result = await $`rocm-smi --showproductname`.nothrow().quiet();
  if (result.exitCode !== 0) {
    return { rocmSmiAvailable: false, rocmGpuNames: [] as string[] };
  }

  const output = decodeBuffer(result.stdout);
  const names: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/Card Series:\s*(.+)/i) ?? line.match(/GPU\[\d+\]\s*:\s*(.+)/i);
    if (match) {
      names.push(match[1].trim());
    }
  }

  return { rocmSmiAvailable: true, rocmGpuNames: names };
};

const detectRocmVersion = async (): Promise<string | null> => {
  // Try /opt/rocm/.info/version first
  const versionFilePaths = ["/opt/rocm/.info/version", "/opt/rocm/include/rocm-core/rocm_version.h"];
  for (const filePath of versionFilePaths) {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf8").trim();
      const match = content.match(/^[\d.]+/);
      if (match) {
        return match[0];
      }
    }
  }

  // Fall back to rocminfo
  const result = await $`rocminfo`.nothrow().quiet();
  if (result.exitCode === 0) {
    const match = decodeBuffer(result.stdout).match(/Runtime Version:\s*([\d.]+)/i);
    if (match) {
      return match[1];
    }
  }

  return null;
};

const detectHipRuntime = async (): Promise<boolean> => {
  const result = await $`hipconfig --version`.nothrow().quiet();
  return result.exitCode === 0;
};

const resolveZludaPath = (): string | null => {
  // Check env variable first
  const envPath = process.env.ZLUDA_PATH?.trim();
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  // Common ZLUDA install locations
  const candidates = [
    "/opt/zluda/lib",
    "/opt/zluda",
    "/usr/local/lib/zluda",
    `${process.env.HOME}/.zluda/lib`,
    `${process.env.HOME}/zluda`,
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      // Check that ZLUDA actually has the key libraries
      const hasLibcuda = existsSync(`${candidate}/libcuda.so`) || existsSync(`${candidate}/libcuda.so.1`);
      if (hasLibcuda) {
        return candidate;
      }
    }
  }

  return null;
};

const detectZludaBinary = async (): Promise<boolean> => {
  const result = await $`zluda --version`.nothrow().quiet();
  if (result.exitCode === 0) {
    return true;
  }

  // Check if zluda binary exists at well-known locations
  const candidates = ["/opt/zluda/zluda", `${process.env.HOME}/.zluda/zluda`, "/usr/local/bin/zluda"];
  return candidates.some((path) => existsSync(path));
};

/**
 * WSL2 GPU-PV detection.
 *
 * Inside WSL2, all GPUs are paravirtualized behind Microsoft PCI vendor 0x1414.
 * Standard Linux tools (sysfs, lspci vendor IDs) cannot identify the real GPU
 * vendor. Instead we:
 *
 * 1. Count total GPU-PV 3D controllers from lspci class [0302].
 * 2. Subtract NVIDIA GPUs reported by nvidia-smi.
 * 3. Scan /usr/lib/wsl/drivers/ for AMD display driver INF files to confirm
 *    the remaining devices are AMD and extract their model names.
 */
const countWsl2GpuPvDevices = async (): Promise<number> => {
  const result = await $`lspci -d ::0302`.nothrow().quiet();
  if (result.exitCode !== 0) {
    return 0;
  }

  return decodeBuffer(result.stdout)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0).length;
};

const countNvidiaGpus = async (): Promise<number> => {
  const result = await $`nvidia-smi --query-gpu=name --format=csv,noheader`.nothrow().quiet();
  if (result.exitCode !== 0) {
    return 0;
  }

  return decodeBuffer(result.stdout)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0).length;
};

const extractAmdModelNamesFromWslDrivers = (): string[] => {
  const driversDir = "/usr/lib/wsl/drivers";
  if (!existsSync(driversDir)) {
    return [];
  }

  const names = new Set<string>();

  try {
    const entries = readdirSync(driversDir).filter((entry: string) => entry.endsWith(".inf") === false);

    for (const entry of entries) {
      const infDir = `${driversDir}/${entry}`;
      let infFiles: string[];
      try {
        infFiles = readdirSync(infDir).filter((f: string) => f.endsWith(".inf"));
      } catch {
        continue;
      }

      for (const infFile of infFiles) {
        const infPath = `${infDir}/${infFile}`;
        let content: string;
        try {
          content = readFileSync(infPath, "utf8");
        } catch {
          continue;
        }

        // Only consider files that are AMD display driver INFs
        if (!/AMD display/i.test(content)) {
          continue;
        }

        // Extract model names from Strings section, e.g.:
        //   AMD15BF.1 = "AMD Radeon(TM) 780M"
        for (const match of content.matchAll(/=\s*"(AMD\s+Radeon[^"]+)"/gi)) {
          names.add(match[1].replace(/\(TM\)/gi, "").replace(/\s+/g, " ").trim());
        }
      }
    }
  } catch {
    // drivers dir unreadable
  }

  return [...names];
};

const detectWsl2GpuPv = async (): Promise<string[]> => {
  const releaseFile = "/proc/sys/kernel/osrelease";
  if (!existsSync(releaseFile)) {
    return [];
  }

  const release = readFileSync(releaseFile, "utf8").toLowerCase();
  const isWsl2 = release.includes("wsl2") || release.includes("microsoft");
  if (!isWsl2) {
    return [];
  }

  const [totalGpuPv, nvidiaCount] = await Promise.all([countWsl2GpuPvDevices(), countNvidiaGpus()]);
  const nonNvidiaCount = Math.max(0, totalGpuPv - nvidiaCount);

  if (nonNvidiaCount === 0) {
    return [];
  }

  // Look for AMD driver evidence and model names in WSL driver store
  const amdModelNames = extractAmdModelNamesFromWslDrivers();

  if (amdModelNames.length === 0) {
    // AMD drivers present but no model names extracted — use generic label
    return Array.from({ length: nonNvidiaCount }, () => "AMD GPU (WSL2 GPU-PV)");
  }

  // If we found model names, use the first unique one for each detected GPU
  // (typically the same iGPU model on all non-NVIDIA slots)
  return Array.from({ length: nonNvidiaCount }, (_, i) =>
    amdModelNames[i % amdModelNames.length],
  );
};

export const detectAmdGpu = async (): Promise<AmdGpuDetection> => {
  const sysfsNames = detectAmdGpuFromSysfs();
  const rocmSmi = await detectRocmSmi();

  // Prefer rocm-smi names, fallback to sysfs, then lspci, then WSL2 GPU-PV
  let gpuNames: string[];
  let detectedVia: AmdGpuDetection["detectedVia"];

  if (rocmSmi.rocmGpuNames.length > 0) {
    gpuNames = rocmSmi.rocmGpuNames;
    detectedVia = "rocm-smi";
  } else if (sysfsNames.length > 0) {
    gpuNames = sysfsNames;
    detectedVia = "sysfs";
  } else {
    const lspciNames = await detectAmdGpuFromLspci();
    if (lspciNames.length > 0) {
      gpuNames = lspciNames;
      detectedVia = "lspci";
    } else {
      const wsl2Names = await detectWsl2GpuPv();
      gpuNames = wsl2Names;
      detectedVia = wsl2Names.length > 0 ? "wsl2-gpu-pv" : "none";
    }
  }

  const zludaPath = resolveZludaPath();
  const zludaBinary = await detectZludaBinary();

  const [rocmVersion, hipRuntimeAvailable] = await Promise.all([detectRocmVersion(), detectHipRuntime()]);

  return {
    amdGpuPresent: gpuNames.length > 0,
    gpuCount: gpuNames.length,
    gpuNames,
    rocmSmiAvailable: rocmSmi.rocmSmiAvailable,
    rocmVersion,
    zludaAvailable: zludaPath !== null || zludaBinary,
    zludaPath,
    hipRuntimeAvailable,
    detectedVia,
  };
};

/**
 * Returns the ZLUDA library path if ZLUDA is available, or null otherwise.
 * Used to build LD_LIBRARY_PATH for CUDA-based Python processes on AMD GPUs.
 */
export const getZludaLibraryPath = async (): Promise<string | null> => {
  const detection = await detectAmdGpu();
  if (!detection.amdGpuPresent || !detection.zludaAvailable) {
    return null;
  }

  return detection.zludaPath;
};

if (import.meta.main) {
  const main = async () => {
    const detection = await detectAmdGpu();
    console.log(JSON.stringify(detection, null, 2));
  };

  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
