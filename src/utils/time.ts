/**
 * Microsecond-precision timestamp utilities
 */

/**
 * Get current time in microseconds since epoch
 */
export function microtimeNow(): number {
  const [seconds, nanoseconds] = process.hrtime();
  return Math.floor(seconds * 1e6 + nanoseconds / 1e3);
}

export const microtime = {
  now: microtimeNow
};
