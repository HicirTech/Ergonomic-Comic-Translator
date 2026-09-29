export const KiB = 1024;
export const MiB = 1024 * KiB;
export const GiB = 1024 * MiB;

/** Formats bytes as binary gigabytes with the "GB" label Windows Task Manager uses. */
export const formatGb = (bytes: number, digits = 1) => `${(bytes / GiB).toFixed(digits)} GB`;
