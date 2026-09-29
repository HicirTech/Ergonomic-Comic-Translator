import { dlopen, FFIType, ptr, type Pointer } from "bun:ffi";
import type { GlobalMemoryStatus } from "./interfaces/index.ts";
import { toWideString } from "./wide-string.ts";

const openKernel32 = () => dlopen("kernel32.dll", {
  GlobalMemoryStatusEx: { args: [FFIType.ptr], returns: FFIType.bool },
  GetPhysicallyInstalledSystemMemory: { args: [FFIType.ptr], returns: FFIType.bool },
  LoadLibraryW: { args: [FFIType.ptr], returns: FFIType.ptr },
  GetModuleHandleW: { args: [FFIType.ptr], returns: FFIType.ptr },
  GetModuleFileNameW: { args: [FFIType.ptr, FFIType.ptr, FFIType.u32], returns: FFIType.u32 },
  GetLastError: { args: [], returns: FFIType.u32 },
  GetDriveTypeW: { args: [FFIType.ptr], returns: FFIType.u32 },
  CreateFileW: {
    args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr],
    returns: FFIType.u64,
  },
  CloseHandle: { args: [FFIType.u64], returns: FFIType.bool },
  OpenProcess: { args: [FFIType.u32, FFIType.bool, FFIType.u32], returns: FFIType.u64 },
  K32GetProcessMemoryInfo: { args: [FFIType.u64, FFIType.ptr, FFIType.u32], returns: FFIType.bool },
});

let kernel32: ReturnType<typeof openKernel32> | null = null;
const lib = () => (kernel32 ??= openKernel32()).symbols;

const memoryStatusSize = 64;
const processMemoryCountersExSize = 80;
const processQueryLimitedInformation = 0x1000;
const maxPathChars = 32768;

export const invalidHandleValue = 0xffffffffffffffffn;
export const errorSharingViolation = 32;
export const errorLockViolation = 33;

export const globalMemoryStatus = (): GlobalMemoryStatus => {
  const buffer = new Uint8Array(memoryStatusSize);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, memoryStatusSize, true);
  if (!lib().GlobalMemoryStatusEx(ptr(buffer))) {
    throw new Error(`GlobalMemoryStatusEx failed (error ${lib().GetLastError()})`);
  }
  return {
    totalPhysBytes: Number(view.getBigUint64(8, true)),
    availPhysBytes: Number(view.getBigUint64(16, true)),
    commitLimitBytes: Number(view.getBigUint64(24, true)),
    commitAvailBytes: Number(view.getBigUint64(32, true)),
  };
};

/** Installed RAM per SMBIOS, including memory reserved for an integrated GPU; null when firmware does not report it. */
export const physicallyInstalledMemoryBytes = (): number | null => {
  const kilobytes = new BigUint64Array(1);
  return lib().GetPhysicallyInstalledSystemMemory(ptr(kilobytes)) ? Number(kilobytes[0]) * 1024 : null;
};

export const loadLibrary = (absolutePath: string): Pointer | null => lib().LoadLibraryW(ptr(toWideString(absolutePath)));

/** Full path of an already loaded module (for example "onnxruntime.dll"), or null when it is not loaded. */
export const loadedModulePath = (moduleName: string) => {
  const handle = lib().GetModuleHandleW(ptr(toWideString(moduleName)));
  if (!handle) {
    return null;
  }
  const buffer = Buffer.alloc(maxPathChars * 2);
  const length = lib().GetModuleFileNameW(handle, ptr(buffer), maxPathChars);
  return length > 0 ? buffer.subarray(0, length * 2).toString("utf16le") : null;
};

export const lastError = () => lib().GetLastError();

const driveRemote = 4;

/** True when the volume holding an absolute path is a network drive (DRIVE_REMOTE); UNC paths always are. */
export const isNetworkVolume = (absolutePath: string) => {
  if (absolutePath.startsWith("\\\\")) {
    return true;
  }
  const root = `${absolutePath.slice(0, 2)}\\`;
  return lib().GetDriveTypeW(ptr(toWideString(root))) === driveRemote;
};

export const createFile = (
  path: string,
  desiredAccess: number,
  shareMode: number,
  creationDisposition: number,
  flagsAndAttributes: number,
) => lib().CreateFileW(ptr(toWideString(path)), desiredAccess, shareMode, null, creationDisposition, flagsAndAttributes, null);

export const closeHandle = (handle: bigint) => lib().CloseHandle(handle);

/** Private commit (PrivateUsage) of a process, or null when the process cannot be opened. */
export const processPrivateBytes = (pid: number): number | null => {
  const handle = lib().OpenProcess(processQueryLimitedInformation, false, pid);
  if (handle === 0n) {
    return null;
  }
  try {
    const buffer = new Uint8Array(processMemoryCountersExSize);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, processMemoryCountersExSize, true);
    if (!lib().K32GetProcessMemoryInfo(handle, ptr(buffer), processMemoryCountersExSize)) {
      return null;
    }
    return Number(view.getBigUint64(72, true));
  } finally {
    lib().CloseHandle(handle);
  }
};
