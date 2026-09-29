import { dlopen, FFIType, ptr } from "bun:ffi";
import { comMethod, comRelease, guidBytes, pointerFrom } from "./com.ts";
import type { DxgiAdapterDesc } from "./interfaces/index.ts";
import { readWideString } from "./wide-string.ts";

const iidDxgiFactory1 = guidBytes("770aae78-f26f-4dba-a829-253c83d1b387");

// vtable slots: IUnknown 0-2, IDXGIObject 3-6, IDXGIFactory 7-11, IDXGIFactory1 12-13
const enumAdapters1Slot = 12;
// IDXGIAdapter 7-9, IDXGIAdapter1::GetDesc1 = 10
const getDesc1Slot = 10;

const adapterDescSize = 312;
const descriptionChars = 128;
const dxgiErrorNotFound = 0x887a0002 | 0;
const dxgiAdapterFlagSoftware = 2;

const openDxgi = () => dlopen("dxgi.dll", {
  CreateDXGIFactory1: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
});

let dxgi: ReturnType<typeof openDxgi> | null = null;

const hex8 = (value: number) => `0x${(value >>> 0).toString(16).padStart(8, "0")}`;

const decodeDesc = (bytes: Uint8Array): DxgiAdapterDesc => {
  const view = new DataView(bytes.buffer);
  return {
    name: readWideString(view, 0, descriptionChars),
    vendorId: view.getUint32(256, true),
    deviceId: view.getUint32(260, true),
    dedicatedVideoMemoryBytes: Number(view.getBigUint64(272, true)),
    dedicatedSystemMemoryBytes: Number(view.getBigUint64(280, true)),
    sharedSystemMemoryBytes: Number(view.getBigUint64(288, true)),
    luid: `${hex8(view.getInt32(300, true))}_${hex8(view.getUint32(296, true))}`,
    software: (view.getUint32(304, true) & dxgiAdapterFlagSoftware) !== 0,
  };
};

/** Enumerates every DXGI adapter, including software and duplicate entries; filtering is the caller's job. */
export const enumerateDxgiAdapters = (): DxgiAdapterDesc[] => {
  dxgi ??= openDxgi();
  const factorySlot = new BigUint64Array(1);
  const created = dxgi.symbols.CreateDXGIFactory1(ptr(iidDxgiFactory1), ptr(factorySlot));
  if (created !== 0) {
    throw new Error(`CreateDXGIFactory1 failed (hr=0x${(created >>> 0).toString(16)})`);
  }

  const factory = pointerFrom(factorySlot);
  const adapters: DxgiAdapterDesc[] = [];
  try {
    const enumAdapters1 = comMethod(factory, enumAdapters1Slot, [FFIType.u32, FFIType.ptr], FFIType.i32);
    for (let index = 0; ; index += 1) {
      const adapterSlot = new BigUint64Array(1);
      const hr = enumAdapters1(factory, index, ptr(adapterSlot)) as number;
      if (hr === dxgiErrorNotFound) {
        break;
      }
      if (hr !== 0) {
        throw new Error(`IDXGIFactory1::EnumAdapters1(${index}) failed (hr=0x${(hr >>> 0).toString(16)})`);
      }

      const adapter = pointerFrom(adapterSlot);
      try {
        const desc = new Uint8Array(adapterDescSize);
        const hrDesc = comMethod(adapter, getDesc1Slot, [FFIType.ptr], FFIType.i32)(adapter, ptr(desc)) as number;
        if (hrDesc !== 0) {
          throw new Error(`IDXGIAdapter1::GetDesc1 failed (hr=0x${(hrDesc >>> 0).toString(16)})`);
        }
        adapters.push(decodeDesc(desc));
      } finally {
        comRelease(adapter);
      }
    }
  } finally {
    comRelease(factory);
  }
  return adapters;
};
