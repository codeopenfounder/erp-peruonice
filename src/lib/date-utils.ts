/**
 * Date utilities for Peru timezone (America/Lima = UTC-5).
 * POI is a Peruvian HR platform — all "today" references must use local time.
 */

const PERU_TZ = "America/Lima";

/** Get today's date in Peru timezone as "YYYY-MM-DD" */
export function getTodayPeru(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: PERU_TZ });
}

/** Get current date-time in Peru timezone as ISO string */
export function getNowPeru(): Date {
  const peruStr = new Date().toLocaleString("en-US", { timeZone: PERU_TZ });
  return new Date(peruStr);
}
