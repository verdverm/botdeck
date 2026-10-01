export type ByteArray = Uint8Array | readonly number[];

export interface JsNesCpuState {
  mem: ByteArray;
}

export interface JsNesState {
  cpu: JsNesCpuState;
  ppu?: unknown;
  apu?: unknown;
  mmap?: unknown;
}
