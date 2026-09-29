import { describe, expect, it } from "bun:test";
import { join } from "path";
import { dataPaths, resolveDataRoot } from "../../src/core/data-paths.ts";

describe("resolveDataRoot", () => {
  it("prefers COMIC_TRANSLATOR_HOME", () => {
    const home = process.platform === "win32" ? "D:\\ct-data" : "/srv/ct-data";
    expect(resolveDataRoot({ COMIC_TRANSLATOR_HOME: home, LOCALAPPDATA: "C:\\x" }, "win32")).toBe(home);
  });

  it("rejects a relative COMIC_TRANSLATOR_HOME", () => {
    expect(() => resolveDataRoot({ COMIC_TRANSLATOR_HOME: "data" }, "linux")).toThrow();
  });

  it("uses LOCALAPPDATA on Windows", () => {
    expect(resolveDataRoot({ LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, "win32"))
      .toBe(join("C:\\Users\\u\\AppData\\Local", "ComicTranslator"));
  });

  it("fails fast on Windows without LOCALAPPDATA", () => {
    expect(() => resolveDataRoot({}, "win32")).toThrow();
  });

  it("uses XDG_DATA_HOME elsewhere", () => {
    expect(resolveDataRoot({ XDG_DATA_HOME: "/home/u/.data" }, "linux")).toBe(join("/home/u/.data", "comic-translator"));
  });
});

describe("dataPaths", () => {
  it("keeps the GPU lock under run/", () => {
    const paths = dataPaths("/data");
    expect(paths.gpuLock).toBe(join("/data", "run", "gpu.lock"));
    expect(paths.database).toBe(join("/data", "db", "ct.sqlite"));
  });
});
