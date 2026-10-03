import type { Server } from "bun";
import { existsSync, mkdirSync, rmSync, statSync } from "fs";
import { basename, dirname, extname, join, resolve, sep } from "path";
import { buildUniqueFilePath, hasSupportedExtension, sanitizeArchiveEntryPath } from "../core/path-utils.ts";
import { ulid } from "../core/ulid.ts";
import type { VolumeRecord } from "../db/interfaces/index.ts";
import { importVolume } from "../jobs/import-volume.ts";
import { expectedVolumeTasks } from "../jobs/plan-volume-tasks.ts";
import { volumeFiles } from "../jobs/volume-files.ts";
import { archiveExtensions, defaultIngestLimits } from "../stages/ingest/read-sources.ts";
import type { ImportResult, ServerDeps, VolumeDetail, VolumeSummary } from "./interfaces/index.ts";
import { refuseForeignRequest } from "./request-guard.ts";

/** Comment lines keep proxies and the browser from closing an idle event stream. */
const heartbeatMs = 15_000;
const activeJobStates = ["queued", "running", "cancelling"];
const untitledZh = "未命名";

const failure = (status: number, errorZh: string) => Response.json({ errorZh }, { status });

type Handler<P extends string> = (request: Bun.BunRequest<P>, server: Server<undefined>) => Response | Promise<Response>;
const guarded = <P extends string>(handler: Handler<P>): Handler<P> => (request, server) => refuseForeignRequest(request) ?? handler(request, server);

/** RFC 6266 attachment header that keeps a Chinese title intact. */
const attachment = (fileName: string) => `attachment; filename="volume${extname(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

/**
 * The local HTTP API and the built web UI. Everything binds to 127.0.0.1; writes need the client header
 * (see request-guard). Uploads are read into the page store and removed; a job starts only on request.
 */
export const createApp = (deps: ServerDeps) => {
  const { paths, volumes, flags, jobs } = deps;

  const activeJob = (volumeId: string) => {
    const job = volumes.latestJob(volumeId);
    return job && activeJobStates.includes(job.state) ? job : null;
  };

  const summary = (volume: VolumeRecord): VolumeSummary => {
    const pages = volumes.pages(volume.id);
    const job = volumes.latestJob(volume.id);
    const counts = flags.openCounts(volume.id);
    const files = volumeFiles(paths, volume.id);
    return {
      id: volume.id,
      title: volume.title,
      sourceLanguage: volume.source_lang,
      readingDirection: volume.reading_direction,
      createdAt: volume.created_at,
      pageCount: pages.length,
      job: job && { id: job.job_id, state: job.state, done: job.done, failed: job.failed, expected: expectedVolumeTasks(pages) },
      openFlags: {
        warn: counts.filter((count) => count.severity === "warn").reduce((sum, count) => sum + count.count, 0),
        error: counts.filter((count) => count.severity === "error").reduce((sum, count) => sum + count.count, 0),
      },
      exports: { cbz: existsSync(files.cbz), pdf: existsSync(files.pdf) },
    };
  };

  const detail = (volume: VolumeRecord): VolumeDetail => {
    const counts = flags.openCounts(volume.id);
    const files = volumeFiles(paths, volume.id);
    const flagsOf = (ordinal: number, severity: "warn" | "error") =>
      counts.find((count) => count.ordinal === ordinal && count.severity === severity)?.count ?? 0;
    return {
      ...summary(volume),
      pages: volumes.pages(volume.id).map((page) => ({
        ordinal: page.ordinal,
        kind: page.kind,
        width: page.width,
        height: page.height,
        translated: existsSync(files.output(page.ordinal)),
        openFlags: { warn: flagsOf(page.ordinal, "warn"), error: flagsOf(page.ordinal, "error") },
      })),
    };
  };

  /**
   * Stores the dropped files (archives as they are, loose images under images/ with their folder paths),
   * imports them as one volume and deletes the upload.
   */
  const upload = async (request: Request) => {
    const form = await request.formData();
    const files = form.getAll("files").flatMap((value) => (typeof value === "string" ? [] : [value]));
    if (files.length === 0) {
      return failure(400, "没有收到文件");
    }
    const directory = join(paths.cache, "uploads", ulid());
    try {
      const archives: string[] = [];
      let hasImages = false;
      for (const file of files) {
        const relative = sanitizeArchiveEntryPath(file.name);
        if (!relative) continue;
        const isArchive = hasSupportedExtension(relative, archiveExtensions);
        const target = buildUniqueFilePath(isArchive ? directory : join(directory, "images"), isArchive ? basename(relative) : relative).absolutePath;
        mkdirSync(dirname(target), { recursive: true });
        await Bun.write(target, file);
        if (isArchive) archives.push(target);
        else hasImages = true;
      }
      const sources = [...archives.sort(), ...(hasImages ? [join(directory, "images")] : [])];
      const named = String(form.get("title") ?? "").trim();
      const firstName = sanitizeArchiveEntryPath(files[0]!.name) ?? "";
      const title = named
        || (archives.length === 1 && !hasImages ? basename(archives[0]!, extname(archives[0]!)) : "")
        || (firstName.includes("/") ? firstName.split("/")[0]! : "")
        || untitledZh;
      const result = await importVolume(paths, volumes, sources, title);
      if (!result.volumeId) {
        return failure(422, "没有找到可以识别的图片");
      }
      const body: ImportResult = {
        volumeId: result.volumeId,
        title,
        pages: result.pages,
        blank: result.blank,
        skipped: result.skipped.length,
      };
      return Response.json(body, { status: 201 });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };

  const events = (request: Request, server: Server<undefined>) => {
    // The stream lives as long as the page is open; the idle timeout would cut it.
    server.timeout(request, 0);
    const encoder = new TextEncoder();
    let close = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        const unsubscribe = jobs.onEvent((event) => send(event.type, event));
        const heartbeat = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), heartbeatMs);
        const status = setInterval(() => send("status", deps.status()), deps.statusIntervalMs);
        send("status", deps.status());
        close = () => {
          unsubscribe();
          clearInterval(heartbeat);
          clearInterval(status);
        };
        request.signal.addEventListener("abort", () => close());
      },
      cancel: () => close(),
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  };

  const serveStatic = (request: Request) => {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/") || !deps.staticRoot) {
      return failure(404, "没有这个地址");
    }
    const root = resolve(deps.staticRoot);
    const candidate = resolve(root, `.${decodeURIComponent(pathname)}`);
    if (candidate.startsWith(`${root}${sep}`) && existsSync(candidate) && statSync(candidate).isFile()) {
      return new Response(Bun.file(candidate));
    }
    // Client-side routes all load the app shell.
    return new Response(Bun.file(join(root, "index.html")));
  };

  const withVolume = <P extends string>(handle: (volume: VolumeRecord, request: Bun.BunRequest<P>) => Response | Promise<Response>) =>
    guarded<P>((request) => {
      const volume = volumes.volume((request.params as Record<string, string>).id!);
      return volume ? handle(volume, request) : failure(404, "找不到这本书");
    });

  const routes = {
    "/api/status": {
      GET: guarded(() => Response.json({ resources: deps.status(), missing: deps.missingDownloads() })),
    },
    "/api/events": {
      GET: guarded((request, server) => events(request, server)),
    },
    "/api/volumes": {
      GET: guarded(() => Response.json(volumes.list().map(summary))),
      POST: guarded((request) => upload(request)),
    },
    "/api/volumes/:id": {
      GET: withVolume((volume) => Response.json(detail(volume))),
      DELETE: withVolume((volume) => {
        const job = activeJob(volume.id);
        if (job) jobs.cancel(job.job_id);
        volumes.markDeleted(volume.id);
        return new Response(null, { status: 204 });
      }),
    },
    "/api/volumes/:id/start": {
      POST: withVolume((volume) => {
        const missing = deps.missingDownloads();
        if (missing.models.length > 0 || missing.runtimes.length > 0) {
          return failure(409, `还有文件没下载完：${[...missing.models, ...missing.runtimes].join("、")}。请先运行 bun run models:fetch vision fonts llm 和 bun run runtimes:fetch`);
        }
        if (activeJob(volume.id)) {
          return failure(409, "这本书已经在翻译了");
        }
        const jobId = volumes.createJob(volume.id, "translate_volume", {});
        jobs.submit(jobId);
        return Response.json({ jobId }, { status: 202 });
      }),
    },
    "/api/volumes/:id/cancel": {
      POST: withVolume((volume) => {
        const job = activeJob(volume.id);
        if (!job) return failure(409, "没有正在进行的翻译");
        jobs.cancel(job.job_id);
        return new Response(null, { status: 202 });
      }),
    },
    "/api/volumes/:id/pages/:ordinal/:variant": {
      GET: withVolume<"/api/volumes/:id/pages/:ordinal/:variant">((volume, request) => {
        const page = volumes.pages(volume.id).find((candidate) => candidate.ordinal === Number(request.params.ordinal));
        if (!page) return failure(404, "没有这一页");
        if (request.params.variant === "original") {
          // Page images are content-addressed, so they never change under the same URL.
          return new Response(Bun.file(join(paths.pages, page.image_file)), { headers: { "Cache-Control": "private, max-age=31536000, immutable" } });
        }
        const output = volumeFiles(paths, volume.id).output(page.ordinal);
        if (request.params.variant !== "translated" || !existsSync(output)) return failure(404, "这一页还没有译图");
        return new Response(Bun.file(output), { headers: { "Cache-Control": "no-cache" } });
      }),
    },
    "/api/volumes/:id/export/:format": {
      GET: withVolume<"/api/volumes/:id/export/:format">((volume, request) => {
        const files = volumeFiles(paths, volume.id);
        const path = request.params.format === "cbz" ? files.cbz : request.params.format === "pdf" ? files.pdf : null;
        if (!path || !existsSync(path)) return failure(404, "还没有导出文件");
        return new Response(Bun.file(path), { headers: { "Content-Disposition": attachment(`${volume.title}${extname(path)}`) } });
      }),
    },
  };

  return { routes, fetch: (request: Request) => refuseForeignRequest(request) ?? serveStatic(request) };
};

/** Starts the server on 127.0.0.1 only; uploads may be as large as the ingest limit allows. */
export const startServer = (deps: ServerDeps, port: number) => {
  const app = createApp(deps);
  return Bun.serve({
    hostname: "127.0.0.1",
    port,
    maxRequestBodySize: defaultIngestLimits.maxTotalBytes,
    routes: app.routes,
    fetch: app.fetch,
  });
};
