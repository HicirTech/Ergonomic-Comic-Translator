const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID: 48-bit millisecond time + 80 random bits in Crockford base32; sorts by creation time. */
export const ulid = (nowMs: number = Date.now()) => {
  let time = "";
  let remaining = nowMs;
  for (let index = 0; index < 10; index += 1) {
    time = crockford[remaining % 32]! + time;
    remaining = Math.floor(remaining / 32);
  }
  const random = crypto.getRandomValues(new Uint8Array(16));
  let tail = "";
  for (let index = 0; index < 16; index += 1) {
    tail += crockford[random[index]! % 32]!;
  }
  return time + tail;
};
