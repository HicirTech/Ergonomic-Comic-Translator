import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { DataPaths } from "../core/data-paths.ts";
import { nowIso } from "../core/time-utils.ts";
import { tryFlockExclusive } from "../platform/linux/libc.ts";
import {
  closeHandle,
  createFile,
  errorLockViolation,
  errorSharingViolation,
  invalidHandleValue,
  lastError,
} from "../platform/win32/kernel32.ts";
import type { GpuLockAttempt, GpuLockOwner } from "./interfaces/index.ts";

const genericRead = 0x80000000;
const genericWrite = 0x40000000;
const shareNone = 0;
const openAlways = 4;
const fileAttributeNormal = 0x80;

/** Opens the lock file without sharing; Windows refuses any further open until the handle closes or the process dies. */
const acquireWin32 = (lockPath: string) => {
  const handle = createFile(lockPath, genericRead | genericWrite, shareNone, openAlways, fileAttributeNormal);
  if (handle === invalidHandleValue) {
    const error = lastError();
    if (error === errorSharingViolation || error === errorLockViolation) {
      return null;
    }
    throw new Error(`Cannot open GPU lock ${lockPath} (Win32 error ${error})`);
  }
  return () => {
    closeHandle(handle);
  };
};

/** flock(2) is released by the kernel when the descriptor closes or the process dies. */
const acquirePosix = (lockPath: string) => {
  const fd = openSync(lockPath, "a+");
  if (!tryFlockExclusive(fd)) {
    closeSync(fd);
    return null;
  }
  return () => {
    closeSync(fd);
  };
};

export const readGpuLockOwner = (paths: DataPaths): GpuLockOwner | null =>
  existsSync(paths.gpuLockOwner) ? (JSON.parse(readFileSync(paths.gpuLockOwner, "utf8")) as GpuLockOwner) : null;

/**
 * Tries to take the machine-wide GPU lock: one model-loading process at a time across the product,
 * the benchmark bench, development scripts and coding agents. The OS releases it if the holder crashes.
 */
export const tryAcquireGpuLock = (paths: DataPaths, purpose: string): GpuLockAttempt => {
  mkdirSync(dirname(paths.gpuLock), { recursive: true });
  const releaseOsLock = process.platform === "win32" ? acquireWin32(paths.gpuLock) : acquirePosix(paths.gpuLock);
  if (!releaseOsLock) {
    return { acquired: false, owner: readGpuLockOwner(paths) };
  }

  const owner: GpuLockOwner = { pid: process.pid, purpose, acquiredAt: nowIso() };
  const temporary = `${paths.gpuLockOwner}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(owner));
  renameSync(temporary, paths.gpuLockOwner);

  let released = false;
  return {
    acquired: true,
    release: () => {
      if (released) {
        return;
      }
      released = true;
      rmSync(paths.gpuLockOwner, { force: true });
      releaseOsLock();
    },
  };
};
