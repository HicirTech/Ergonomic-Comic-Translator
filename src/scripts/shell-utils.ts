import { $ } from "bun";

export const decodeBuffer = (value: Uint8Array | ArrayBuffer | null | undefined) => {
  if (!value) {
    return "";
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }

  return Buffer.from(new Uint8Array(value)).toString("utf8");
};

export const commandAvailable = async (command: string) => {
  const result = await $`${command} --version`.nothrow().quiet();
  return result.exitCode === 0;
};

export const commandOutput = async (command: string, args: string[]) => {
  const result = await $`${command} ${args}`.nothrow().quiet();
  return result.exitCode === 0 ? decodeBuffer(result.stdout).trim() : null;
};
