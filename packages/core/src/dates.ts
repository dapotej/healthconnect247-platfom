/**
 * Dates and times. Nigeria is on West Africa Time (UTC+01:00) all year,
 * with no daylight saving, so a fixed offset is correct.
 */

export const LAGOS_OFFSET = '+01:00';
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** The calendar date in Lagos (YYYY-MM-DD) for an ISO timestamp. */
export function lagosDate(isoTimestamp: string): string {
  const ms = Date.parse(isoTimestamp);
  if (Number.isNaN(ms)) throw new Error(`Not a valid timestamp: ${isoTimestamp}`);
  return new Date(ms + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/**
 * Parse a date as written in Nigerian spreadsheets: DD/MM/YYYY, DD-MM-YYYY,
 * DD.MM.YYYY or ISO YYYY-MM-DD. Returns YYYY-MM-DD, or null if it isn't a
 * real calendar date (for example 31/02/1989).
 *
 * Day-first is assumed for slashed dates, as is standard in Nigeria.
 */
export function parseDate(input: string): string | null {
  const s = input.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isRealDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isRealDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  return null;
}

/**
 * Parse a date and time from a call-centre export. Accepts an ISO timestamp
 * with an offset, or a date (any format parseDate accepts) followed by HH:mm
 * or HH:mm:ss, which is taken to be Lagos time.
 *
 * Returns an ISO timestamp with the Lagos offset, or null.
 */
export function parseLagosDateTime(input: string): string | null {
  const s = input.trim();
  if (/[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const ms = Date.parse(s.replace(' ', 'T'));
    if (Number.isNaN(ms)) return null;
    return toLagosIso(ms);
  }
  const m = /^(.+?)[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return null;
  const date = parseDate(m[1]!);
  const [h, min, sec] = [Number(m[2]), Number(m[3]), Number(m[4] ?? '0')];
  if (!date || h > 23 || min > 59 || sec > 59) return null;
  return `${date}T${pad(h)}:${pad(min)}:${pad(sec)}${LAGOS_OFFSET}`;
}

/** Format epoch milliseconds as an ISO timestamp in Lagos time. */
export function toLagosIso(ms: number): string {
  const local = new Date(ms + LAGOS_OFFSET_MS).toISOString().slice(0, 19);
  return `${local}${LAGOS_OFFSET}`;
}

/** Number of calendar days from start to end, inclusive (YYYY-MM-DD). */
export function daysInclusive(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}
