export const sha256Hex = (data: string | Uint8Array | ArrayBuffer) =>
  new Bun.CryptoHasher("sha256").update(data).digest("hex");

/** Streams a file through SHA-256 so multi-gigabyte model files never sit in memory. */
export const sha256File = async (path: string) => {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) {
    hasher.update(chunk);
  }
  return hasher.digest("hex");
};
