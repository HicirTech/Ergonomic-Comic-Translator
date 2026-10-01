import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import type { VisionClient } from "../../src/pipeline/interfaces/index.ts";
import { cleanPage } from "../../src/pipeline/clean-page.ts";

const passthrough = async <T>(_name: string, work: () => Promise<T>) => work();

describe("cleanPage", () => {
  it("creates a missing work directory before writing the flat image", async () => {
    const root = mkdtempSync(join(tmpdir(), "ct-clean-"));
    try {
      const image = join(root, "page.png");
      await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toFile(image);
      const work = join(root, "missing-work");
      const client = { inpaint: async () => {} } as unknown as VisionClient;
      const result = await cleanPage(client, image, "page", work, [], () => [], passthrough);
      expect(result.cleanedPath).toBe(join(work, "page.flat.png"));
      expect(existsSync(result.cleanedPath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
