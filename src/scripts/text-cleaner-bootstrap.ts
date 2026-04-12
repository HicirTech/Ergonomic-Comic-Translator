import { $ } from "bun";
import { existsSync, mkdirSync, createWriteStream } from "fs";
import { resolve } from "path";
import { projectRoot as defaultProjectRoot, tempRootDir } from "../config.ts";

const VENV_DIR_NAME = "text-cleaner-venv";

const MODEL_DOWNLOADS = [
  {
    name: "lama_large_512px.ckpt",
    url: "https://huggingface.co/dreMaz/AnimeMangaInpainting/resolve/main/lama_large_512px.ckpt",
    subDir: "inpainting",
  },
] as const;

const logStep = (message: string) => {
  console.log(`[text-cleaner-bootstrap] ${message}`);
};

const getVenvDir = () => resolve(tempRootDir, VENV_DIR_NAME);
const getVenvPython = () => resolve(getVenvDir(), "bin", "python");

export const ensureTextCleanerVenv = async ({ projectRoot = defaultProjectRoot }: { projectRoot?: string } = {}) => {
  const venvDir = getVenvDir();
  const venvPython = getVenvPython();

  if (existsSync(venvPython)) {
    logStep("text-cleaner venv already exists");
    await downloadModels(projectRoot);
    return venvPython;
  }

  logStep(`creating text-cleaner venv at ${venvDir}`);

  // Use pyenv Python 3.12 (same as the poetry venv) since PyTorch doesn't support newer Python versions
  const pyenvPython = `${process.env.HOME}/.pyenv/versions/3.12.9/bin/python3.12`;
  const systemPython = existsSync(pyenvPython) ? pyenvPython : "python3";

  const createResult = await $`${systemPython} -m venv ${venvDir}`.nothrow();
  if (createResult.exitCode !== 0) {
    throw new Error("Failed to create text-cleaner venv");
  }

  logStep("installing PyTorch with CUDA support");
  const torchResult =
    await $`${venvPython} -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu130`.nothrow();
  if (torchResult.exitCode !== 0) {
    throw new Error("Failed to install PyTorch with CUDA support");
  }

  const otherDeps = [
    "numpy==1.26.4",
    "opencv-python-headless",
    "einops",
    "pyclipper",
    "shapely",
    "scikit-image",
    "pydantic",
    "tqdm",
    "requests",
    "py3langid==0.2.2",
    "networkx",
    "Pillow",
    "colorama",
  ];

  logStep(`installing remaining dependencies: ${otherDeps.join(", ")}`);
  const depsResult = await $`${venvPython} -m pip install ${otherDeps}`.nothrow();
  if (depsResult.exitCode !== 0) {
    throw new Error("Failed to install text-cleaner dependencies");
  }

  logStep("text-cleaner venv ready");

  await downloadModels(projectRoot);

  return venvPython;
};

const downloadModels = async (projectRoot: string) => {
  const modelsDir = resolve(projectRoot, "src", "python", "models");

  for (const model of MODEL_DOWNLOADS) {
    const targetDir = resolve(modelsDir, model.subDir);
    const targetPath = resolve(targetDir, model.name);

    if (existsSync(targetPath)) {
      logStep(`model ${model.name} already exists`);
      continue;
    }

    mkdirSync(targetDir, { recursive: true });
    logStep(`downloading model ${model.name}...`);

    const response = await fetch(model.url, { redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download ${model.name}: HTTP ${response.status}`);
    }

    const partPath = `${targetPath}.part`;
    const writer = createWriteStream(partPath);
    const reader = response.body.getReader();

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    let downloaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      writer.write(value);
      downloaded += value.length;
      if (contentLength > 0) {
        const pct = ((downloaded / contentLength) * 100).toFixed(1);
        process.stdout.write(`\r[text-cleaner-bootstrap] ${model.name}: ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
      }
    }

    writer.end();
    await new Promise<void>((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    // Rename .part → final atomically
    const { renameSync } = await import("fs");
    renameSync(partPath, targetPath);

    if (contentLength > 0) {
      console.log(""); // newline after progress
    }
    logStep(`model ${model.name} downloaded`);
  }
};

export { getVenvPython as getTextCleanerPython };

if (import.meta.main) {
  void ensureTextCleanerVenv()
    .then((pythonPath) => {
      console.log(`text-cleaner Python: ${pythonPath}`);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
