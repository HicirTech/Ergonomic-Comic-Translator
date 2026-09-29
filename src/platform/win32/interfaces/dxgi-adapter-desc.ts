/** One entry of IDXGIFactory1::EnumAdapters1, decoded from DXGI_ADAPTER_DESC1. */
export interface DxgiAdapterDesc {
  name: string;
  vendorId: number;
  deviceId: number;
  /** "0xHHHHHHHH_0xLLLLLLLL" in lower case, the same form PDH uses in its instance names. */
  luid: string;
  dedicatedVideoMemoryBytes: number;
  dedicatedSystemMemoryBytes: number;
  sharedSystemMemoryBytes: number;
  software: boolean;
}
