import type { Subprocess } from "bun";
import { closeSync, mkdirSync, openSync } from "fs";
import { dirname } from "path";
import { buildLlamaServerArgs } from "./llama-server-args.ts";
import type { LlamaServerOptions } from "./interfaces/index.ts";

const healthPollMs = 500;

/** Asks the OS for a free loopback port (bind to port 0, read it back, close). */
export const findFreePort = () => {
  const server = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data: () => {} } });
  const { port } = server;
  server.stop(true);
  return port;
};

/**
 * One llama-server process: the model stays loaded while it runs, and unloading means ending it.
 * `start` resolves once /health answers 200; a process that exits while loading fails the start.
 */
export class LlamaServer {
  private child: Subprocess<"ignore", number, number> | null = null;

  constructor(
    private readonly options: LlamaServerOptions,
    private readonly logPath: string,
    private readonly hooks: { onSpawn?: (pid: number) => void; onExit?: (pid: number) => void } = {},
  ) {}

  get baseUrl() {
    return `http://127.0.0.1:${this.options.port}`;
  }

  get apiKey() {
    return this.options.apiKey;
  }

  get pid() {
    return this.child?.pid ?? null;
  }

  async start(readyTimeoutMs: number) {
    if (this.child) {
      throw new Error("llama-server is already running");
    }
    mkdirSync(dirname(this.logPath), { recursive: true });
    const log = openSync(this.logPath, "a");
    const child = Bun.spawn([this.options.executable, ...buildLlamaServerArgs(this.options)], {
      stdin: "ignore",
      stdout: log,
      stderr: log,
    });
    closeSync(log);
    this.child = child;
    this.hooks.onSpawn?.(child.pid);
    let exitCode: number | null = null;
    void child.exited.then((code) => {
      exitCode = code;
      this.hooks.onExit?.(child.pid);
      if (this.child === child) this.child = null;
    });

    const deadline = performance.now() + readyTimeoutMs;
    while (performance.now() < deadline) {
      if (exitCode !== null) {
        throw new Error(`llama-server exited with code ${exitCode} while loading; see ${this.logPath}`);
      }
      const ready = await fetch(`${this.baseUrl}/health`).then((response) => response.status === 200, () => false);
      if (ready) {
        return;
      }
      await Bun.sleep(healthPollMs);
    }
    await this.stop();
    throw new Error(`llama-server was not ready within ${readyTimeoutMs} ms; see ${this.logPath}`);
  }

  /** Ends the process (the only way to free its memory) and waits until it is gone. */
  async stop() {
    const child = this.child;
    if (!child) {
      return;
    }
    child.kill("SIGKILL");
    await child.exited;
    this.child = null;
  }
}
