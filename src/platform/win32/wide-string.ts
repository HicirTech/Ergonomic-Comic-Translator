/** NUL-terminated UTF-16LE buffer for W-suffixed Win32 APIs. */
export const toWideString = (value: string) => Buffer.from(`${value}\0`, "utf16le");

/** Reads a NUL-terminated UTF-16LE string from a DataView, stopping at maxChars. */
export const readWideString = (view: DataView, byteOffset: number, maxChars: number) => {
  let text = "";
  for (let index = 0; index < maxChars; index += 1) {
    const offset = byteOffset + index * 2;
    if (offset + 2 > view.byteLength) {
      break;
    }
    const code = view.getUint16(offset, true);
    if (code === 0) {
      break;
    }
    text += String.fromCharCode(code);
  }
  return text;
};
