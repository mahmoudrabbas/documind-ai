/**
 * Storage-size formatting helpers.
 *
 * Pure module — no React, no DOM. Safe to unit-test directly.
 *
 * @module storage
 */

/**
 * The divisor a megabyte figure was most likely authored against.
 *
 * The API sends a bare `storageMb` with no unit base attached, and plan
 * limits are written both ways in practice: 1024 / 5120 from binary
 * thinking, 1000 / 5000 from marketing round numbers. Reading a figure that
 * divides cleanly by 1000 as decimal GB, and everything else as binary,
 * reproduces the author's intent in both cases.
 *
 * Guessing is unavoidable while the unit stays implicit. What matters is
 * that every call site guesses *identically* — see {@link mbToGb}.
 */
export function mbPerGb(mb: number): 1000 | 1024 {
  return mb % 1000 === 0 ? 1000 : 1024;
}

/**
 * Convert megabytes to gigabytes.
 *
 * Pass an explicit `divisor` when rendering two figures that are read as a
 * comparison, so both sides land on one base. The overview's usage panel
 * used to divide usage by 1024 while deriving the limit's base per
 * {@link mbPerGb}, which showed a tenant at exactly 100% of a 5000 MB plan
 * as "4.9 GB / 5 GB" — apparent headroom beside a full progress bar.
 */
export function mbToGb(mb: number, divisor: 1000 | 1024 = mbPerGb(mb)): number {
  return mb / divisor;
}
