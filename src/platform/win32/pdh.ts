import { dlopen, FFIType, ptr } from "bun:ffi";
import { parseGpuCounterInstance } from "./gpu-counter-instance.ts";
import type { PdhGpuSample } from "./interfaces/index.ts";
import { readWideString, toWideString } from "./wide-string.ts";

const pdhFmtDouble = 0x200;
const pdhMoreData = 0x800007d2;
// Rate counters report PDH_INVALID_DATA until two collections exist.
const pdhInvalidData = 0xc0000bba;
const pdhCstatusNewData = 1;
const counterItemSize = 24;
const maxInstanceNameChars = 256;

const counterPaths = {
  adapterDedicated: "\\GPU Adapter Memory(*)\\Dedicated Usage",
  adapterShared: "\\GPU Adapter Memory(*)\\Shared Usage",
  processDedicated: "\\GPU Process Memory(*)\\Dedicated Usage",
  processShared: "\\GPU Process Memory(*)\\Shared Usage",
  engineUtilization: "\\GPU Engine(*)\\Utilization Percentage",
} as const;

type CounterName = keyof typeof counterPaths;

const openPdh = () => dlopen("pdh.dll", {
  PdhOpenQueryW: { args: [FFIType.ptr, FFIType.u64, FFIType.ptr], returns: FFIType.u32 },
  PdhAddEnglishCounterW: { args: [FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.ptr], returns: FFIType.u32 },
  PdhCollectQueryData: { args: [FFIType.u64], returns: FFIType.u32 },
  PdhGetFormattedCounterArrayW: { args: [FFIType.u64, FFIType.u32, FFIType.ptr, FFIType.ptr, FFIType.ptr], returns: FFIType.u32 },
  PdhCloseQuery: { args: [FFIType.u64], returns: FFIType.u32 },
});

let pdh: ReturnType<typeof openPdh> | null = null;

const statusHex = (status: number) => `0x${(status >>> 0).toString(16)}`;

const readCounterArray = (counter: bigint) => {
  const { symbols } = pdh!;
  const size = new Uint32Array(1);
  const count = new Uint32Array(1);
  const probe = symbols.PdhGetFormattedCounterArrayW(counter, pdhFmtDouble, ptr(size), ptr(count), null);
  if ((probe === 0 && size[0] === 0) || probe === pdhInvalidData) {
    return [];
  }
  if (probe !== pdhMoreData && probe !== 0) {
    throw new Error(`PdhGetFormattedCounterArrayW size query failed (${statusHex(probe)})`);
  }

  const buffer = new Uint8Array(size[0]!);
  const status = symbols.PdhGetFormattedCounterArrayW(counter, pdhFmtDouble, ptr(size), ptr(count), ptr(buffer));
  if (status === pdhInvalidData) {
    return [];
  }
  if (status !== 0) {
    throw new Error(`PdhGetFormattedCounterArrayW failed (${statusHex(status)})`);
  }

  // Item names point into the same buffer, so resolve them relative to its base address.
  const base = ptr(buffer) as unknown as number;
  const view = new DataView(buffer.buffer);
  const items: { name: string; value: number }[] = [];
  for (let index = 0; index < count[0]!; index += 1) {
    const offset = index * counterItemSize;
    if (view.getUint32(offset + 8, true) > pdhCstatusNewData) {
      continue;
    }
    const nameOffset = Number(view.getBigUint64(offset, true)) - base;
    items.push({ name: readWideString(view, nameOffset, maxInstanceNameChars), value: view.getFloat64(offset + 16, true) });
  }
  return items;
};

/**
 * Opens one PDH query over the WDDM GPU counters. Memory counters are instantaneous; engine utilisation
 * is a rate, so call collect() at a steady interval (the governor samples every second).
 */
export const openGpuCounterQuery = () => {
  pdh ??= openPdh();
  const { symbols } = pdh;
  const querySlot = new BigUint64Array(1);
  const opened = symbols.PdhOpenQueryW(null, 0n, ptr(querySlot));
  if (opened !== 0) {
    throw new Error(`PdhOpenQueryW failed (${statusHex(opened)})`);
  }
  const query = querySlot[0]!;

  const counters = {} as Record<CounterName, bigint>;
  for (const [name, path] of Object.entries(counterPaths) as [CounterName, string][]) {
    const counterSlot = new BigUint64Array(1);
    const added = symbols.PdhAddEnglishCounterW(query, ptr(toWideString(path)), 0n, ptr(counterSlot));
    if (added !== 0) {
      symbols.PdhCloseQuery(query);
      throw new Error(`PdhAddEnglishCounterW(${path}) failed (${statusHex(added)})`);
    }
    counters[name] = counterSlot[0]!;
  }

  let collections = 0;

  const collect = (): PdhGpuSample => {
    const status = symbols.PdhCollectQueryData(query);
    if (status !== 0) {
      throw new Error(`PdhCollectQueryData failed (${statusHex(status)})`);
    }
    collections += 1;

    const adapters: PdhGpuSample["adapters"] = new Map();
    const addAdapter = (name: string, key: "dedicatedBytes" | "sharedBytes", value: number) => {
      const instance = parseGpuCounterInstance(name);
      if (!instance) {
        return;
      }
      const entry = adapters.get(instance.luid) ?? { dedicatedBytes: 0, sharedBytes: 0 };
      entry[key] += value;
      adapters.set(instance.luid, entry);
    };
    for (const item of readCounterArray(counters.adapterDedicated)) addAdapter(item.name, "dedicatedBytes", item.value);
    for (const item of readCounterArray(counters.adapterShared)) addAdapter(item.name, "sharedBytes", item.value);

    const processes = new Map<string, PdhGpuSample["processes"][number]>();
    const addProcess = (name: string, key: "dedicatedBytes" | "sharedBytes", value: number) => {
      const instance = parseGpuCounterInstance(name);
      if (!instance || instance.pid === null) {
        return;
      }
      const mapKey = `${instance.pid}@${instance.luid}`;
      const entry = processes.get(mapKey) ?? { pid: instance.pid, luid: instance.luid, dedicatedBytes: 0, sharedBytes: 0 };
      entry[key] += value;
      processes.set(mapKey, entry);
    };
    for (const item of readCounterArray(counters.processDedicated)) addProcess(item.name, "dedicatedBytes", item.value);
    for (const item of readCounterArray(counters.processShared)) addProcess(item.name, "sharedBytes", item.value);

    const engines: PdhGpuSample["engines"] = [];
    for (const item of readCounterArray(counters.engineUtilization)) {
      const instance = parseGpuCounterInstance(item.name);
      if (instance?.pid == null || instance.engineType === null) {
        continue;
      }
      engines.push({
        pid: instance.pid,
        luid: instance.luid,
        engineType: instance.engineType,
        utilPct: collections > 1 ? item.value : Number.NaN,
      });
    }

    return { adapters, processes: [...processes.values()], engines };
  };

  const close = () => {
    symbols.PdhCloseQuery(query);
  };

  return { collect, close };
};
