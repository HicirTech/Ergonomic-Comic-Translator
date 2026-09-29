import { homedir } from "os";
import { isAbsolute, join, resolve } from "path";

const windowsAppDirName = "ComicTranslator";
const posixAppDirName = "comic-translator";

/**
 * Resolves the per-user data directory that holds the database, models, runtimes, caches and locks.
 * Order: COMIC_TRANSLATOR_HOME, then %LOCALAPPDATA%\ComicTranslator on Windows,
 * then $XDG_DATA_HOME/comic-translator (default ~/.local/share) elsewhere.
 */
export const resolveDataRoot = (env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform) => {
  const configured = env.COMIC_TRANSLATOR_HOME?.trim();
  if (configured) {
    if (!isAbsolute(configured)) {
      throw new Error(`COMIC_TRANSLATOR_HOME must be an absolute path: ${configured}`);
    }
    return resolve(configured);
  }

  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA?.trim();
    if (!localAppData) {
      throw new Error("LOCALAPPDATA is not set; set COMIC_TRANSLATOR_HOME to choose a data directory.");
    }
    return join(localAppData, windowsAppDirName);
  }

  const xdgDataHome = env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
  return join(xdgDataHome, posixAppDirName);
};

/** Well-known locations inside a data root. */
export const dataPaths = (root: string) => ({
  root,
  database: join(root, "db", "ct.sqlite"),
  models: join(root, "models"),
  runtimes: join(root, "runtimes"),
  cache: join(root, "cache"),
  logs: join(root, "logs"),
  run: join(root, "run"),
  gpuLock: join(root, "run", "gpu.lock"),
  gpuLockOwner: join(root, "run", "gpu.lock.owner.json"),
});

export type DataPaths = ReturnType<typeof dataPaths>;
