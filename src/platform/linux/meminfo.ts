import { existsSync, readFileSync } from "fs";

/** Parses /proc/meminfo ("MemTotal:  32768000 kB") into bytes per key. */
export const parseMeminfo = (text: string) => {
  const values = new Map<string, number>();
  for (const line of text.split("\n")) {
    const match = /^(\w+(?:\(\w+\))?):\s+(\d+)(?:\s+kB)?$/.exec(line.trim());
    if (match) {
      values.set(match[1]!, Number(match[2]) * (line.includes("kB") ? 1024 : 1));
    }
  }
  return values;
};

export const readMeminfo = () => parseMeminfo(readFileSync("/proc/meminfo", "utf8"));

/** Anonymous resident memory of a process (closest Linux analogue of Windows private bytes), or null. */
export const processAnonymousBytes = (pid: number) => {
  const path = `/proc/${pid}/status`;
  if (!existsSync(path)) {
    return null;
  }
  const status = readFileSync(path, "utf8");
  const match = /^RssAnon:\s+(\d+)\s+kB$/m.exec(status);
  return match ? Number(match[1]) * 1024 : null;
};
