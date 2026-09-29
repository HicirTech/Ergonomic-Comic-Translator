import { dlopen, FFIType } from "bun:ffi";

const lockExclusive = 2;
const lockNonBlocking = 4;

const openLibc = () => dlopen("libc.so.6", {
  flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
});

let libc: ReturnType<typeof openLibc> | null = null;

/** Non-blocking exclusive flock(2) on an open descriptor; false when another open file description holds it. */
export const tryFlockExclusive = (fd: number) => {
  libc ??= openLibc();
  return libc.symbols.flock(fd, lockExclusive | lockNonBlocking) === 0;
};
