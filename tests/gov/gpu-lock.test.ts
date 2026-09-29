import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { dataPaths } from "../../src/core/data-paths.ts";
import { readGpuLockOwner, tryAcquireGpuLock } from "../../src/gov/gpu-lock.ts";

const lockModule = resolve(import.meta.dir, "../../src/gov/gpu-lock.ts").replaceAll("\\", "/");
const pathsModule = resolve(import.meta.dir, "../../src/core/data-paths.ts").replaceAll("\\", "/");

/** Tries the lock from a separate process, as a second model loader would. */
const acquireInChild = (root: string) => {
  const script = `
    const { tryAcquireGpuLock } = await import(${JSON.stringify(lockModule)});
    const { dataPaths } = await import(${JSON.stringify(pathsModule)});
    const attempt = tryAcquireGpuLock(dataPaths(${JSON.stringify(root)}), "child");
    console.log(JSON.stringify({ acquired: attempt.acquired, owner: attempt.acquired ? null : attempt.owner }));
    if (attempt.acquired) attempt.release();
  `;
  const child = Bun.spawnSync([process.execPath, "-e", script]);
  return JSON.parse(child.stdout.toString()) as { acquired: boolean; owner: { purpose: string } | null };
};

const roots: string[] = [];
const tempRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "ct-lock-"));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("tryAcquireGpuLock", () => {
  it("admits one holder at a time, across processes, and reports the holder", () => {
    const root = tempRoot();
    const paths = dataPaths(root);
    const first = tryAcquireGpuLock(paths, "vision worker");
    expect(first.acquired).toBe(true);

    const second = tryAcquireGpuLock(paths, "bench");
    expect(second).toEqual({ acquired: false, owner: expect.objectContaining({ pid: process.pid, purpose: "vision worker" }) });
    expect(acquireInChild(root)).toEqual({ acquired: false, owner: expect.objectContaining({ purpose: "vision worker" }) });

    if (first.acquired) first.release();
    expect(readGpuLockOwner(paths)).toBeNull();
    expect(acquireInChild(root)).toEqual({ acquired: true, owner: null });
  });

  it("is released by the OS when the holder exits without releasing", () => {
    const root = tempRoot();
    const script = `
      const { tryAcquireGpuLock } = await import(${JSON.stringify(lockModule)});
      const { dataPaths } = await import(${JSON.stringify(pathsModule)});
      const attempt = tryAcquireGpuLock(dataPaths(${JSON.stringify(root)}), "crashing holder");
      process.exit(attempt.acquired ? 0 : 1);
    `;
    expect(Bun.spawnSync([process.execPath, "-e", script]).exitCode).toBe(0);
    const attempt = tryAcquireGpuLock(dataPaths(root), "after crash");
    expect(attempt.acquired).toBe(true);
    if (attempt.acquired) attempt.release();
  });
});
