import { CFunction, FFIType, read, type Pointer } from "bun:ffi";

const pointerSize = 8;
const releaseSlot = 2;

/** Encodes a GUID string ("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx") into its 16-byte in-memory layout. */
export const guidBytes = (text: string) => {
  const hex = text.replace(/[{}-]/g, "");
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, Number.parseInt(hex.slice(0, 8), 16), true);
  view.setUint16(4, Number.parseInt(hex.slice(8, 12), 16), true);
  view.setUint16(6, Number.parseInt(hex.slice(12, 16), 16), true);
  for (let index = 0; index < 8; index += 1) {
    bytes[8 + index] = Number.parseInt(hex.slice(16 + index * 2, 18 + index * 2), 16);
  }
  return bytes;
};

/** Binds slot `slot` of a COM object's vtable; the object pointer is passed as the implicit first argument. */
export const comMethod = (object: Pointer, slot: number, args: FFIType[], returns: FFIType) => {
  const vtable = read.ptr(object, 0) as unknown as Pointer;
  const method = read.ptr(vtable, slot * pointerSize) as unknown as Pointer;
  return CFunction({ ptr: method, args: [FFIType.ptr, ...args], returns });
};

export const comRelease = (object: Pointer) => {
  comMethod(object, releaseSlot, [], FFIType.u32)(object);
};

export const pointerFrom = (slot: BigUint64Array) => Number(slot[0]) as unknown as Pointer;
