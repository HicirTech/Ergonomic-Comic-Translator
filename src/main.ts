import { Buffer } from "buffer";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "fs";
import { resolve, extname } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const projectRoot = process.cwd();
const inputDir = resolve(projectRoot, "comics");
const outputFile = resolve(projectRoot, "output", "ocr-results.json");
const requirementsFile = resolve(projectRoot, "requirements.txt");
const venvDir = resolve(projectRoot, ".venv");
const runnerScript = resolve(projectRoot, "src", "python", "paddleocr_runner.py");
const supportedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"]);

function collectImageFiles(dir: string): string[] {
  const items = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const item of items) {
    const fullPath = resolve(dir, item.name);

    if (item.isDirectory()) {
      files.push(...collectImageFiles(fullPath));
      continue;
    }

    if (item.isFile() && supportedExtensions.has(extname(item.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function ensureDirectory(filePath: string) {
  mkdirSync(resolve(filePath, ".."), { recursive: true });
}

function decodeBuffer(value: Uint8Array | ArrayBuffer | null | undefined) {
  if (!value) {
    return "";
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }

  return Buffer.from(new Uint8Array(value)).toString("utf8");
}

function runCommand(cmd: string[], errorMessage: string) {
  const result = Bun.spawnSync({
    cmd,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    const stderr = decodeBuffer(result.stderr).trim();
    throw new Error(`${errorMessage}${stderr ? `\n${stderr}` : ""}`);
  }

  return decodeBuffer(result.stdout).trim();
}

function findPythonLauncher() {
  const explicitPythonPath = process.env.OCR_PYTHON_PATH?.trim();
  if (explicitPythonPath) {
    if (!existsSync(explicitPythonPath)) {
      throw new Error(`OCR_PYTHON_PATH points to a missing executable: ${explicitPythonPath}`);
    }

    return [explicitPythonPath];
  }

  const candidates = process.platform === "win32"
    ? [["py", "-3"], ["python"], ["python3"]]
    : [["python3"], ["python"]];

  for (const candidate of candidates) {
    try {
      const result = Bun.spawnSync({
        cmd: [...candidate, "--version"],
        stdout: "pipe",
        stderr: "pipe",
      });

      if (result.exitCode === 0) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  throw new Error("No usable Python launcher found. Install Python 3 and make sure it is on PATH.");
}

function getVenvPythonPath() {
  return process.platform === "win32"
    ? resolve(venvDir, "Scripts", "python.exe")
    : resolve(venvDir, "bin", "python");
}

function ensureVirtualEnv() {
  const venvPython = getVenvPythonPath();
  if (existsSync(venvPython)) {
    return venvPython;
  }

  const launcher = findPythonLauncher();
  runCommand([...launcher, "-m", "venv", venvDir], "Failed to create project virtual environment");

  if (!existsSync(venvPython)) {
    throw new Error(`Virtual environment was created but Python executable was not found at ${venvPython}`);
  }

  return venvPython;
}

function ensureDependencies(pythonExecutable: string) {
  const check = Bun.spawnSync({
    cmd: [pythonExecutable, "-c", "import paddleocr"],
    stdout: "pipe",
    stderr: "pipe",
  });

  if (check.exitCode === 0) {
    return;
  }

  runCommand([pythonExecutable, "-m", "pip", "install", "--upgrade", "pip"], "Failed to upgrade pip inside the project virtual environment");
  runCommand([pythonExecutable, "-m", "pip", "install", "-r", requirementsFile], "Failed to install OCR dependencies inside the project virtual environment");
}

function runOcr(imagePaths: string[]) {
  const tempInputFile = resolve(tmpdir(), `comictranslator-ocr-${randomUUID()}.json`);
  writeFileSync(tempInputFile, JSON.stringify(imagePaths, null, 2), "utf8");

  try {
    const venvPython = ensureVirtualEnv();
    ensureDependencies(venvPython);

    const result = Bun.spawnSync({
      cmd: [venvPython, runnerScript, "--input", tempInputFile, "--output", outputFile],
      stdout: "pipe",
      stderr: "pipe",
    });

    if (result.exitCode !== 0) {
      const stderr = decodeBuffer(result.stderr).trim();
      throw new Error(`PaddleOCR failed with exit code ${result.exitCode}${stderr ? `\n${stderr}` : ""}`);
    }

    const stdout = decodeBuffer(result.stdout).trim();
    if (stdout) {
      console.log(stdout);
    }

    console.log(`OCR JSON output saved to: ${outputFile}`);
  } finally {
    rmSync(tempInputFile, { force: true });
  }
}

function main() {
  console.log("Starting OCR scan for comics directory:", inputDir);

  const files = collectImageFiles(inputDir);
  if (files.length === 0) {
    console.error("No supported image files found in comics/. Add PNG/JPG/WEBP files to comics/.");
    process.exit(1);
  }

  ensureDirectory(outputFile);
  runOcr(files);
}

main();