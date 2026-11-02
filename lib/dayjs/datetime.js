/**
 * Production-safe date/time helpers.
 * Default timezone: UTC (or APP_TIMEZONE env).
 * Every function accepts an optional { tz } option to override.
 */

import dayjs, {
  DEFAULT_TIMEZONE,
  UTC_TIMEZONE,
  TIMEZONES,
} from './dayjs.js';

// ---------- Accepted input formats (ordered: unambiguous → ambiguous) ----------
const DATE_FORMATS = [
  // ISO-ish with TZ
  'YYYY-MM-DDTHH:mm:ss.SSSZ',
  'YYYY-MM-DDTHH:mm:ssZ',
  // ISO-ish without TZ
  'YYYY-MM-DDTHH:mm:ss',
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DD HH:mm',
  'YYYY-MM-DDTHH:mm',
  // Date only — ISO first (unambiguous)
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  // Ambiguous — DD-MM (Saudi convention) before MM-DD
  'DD-MM-YYYY',
  'DD-MM-YYYY HH:mm',
  'DD-MM-YYYY HH:mm:ss',
  'DD/MM/YYYY',
  'DD/MM/YYYY HH:mm',
  // Slash variants
  'YYYY/MM/DD HH:mm',
  'YYYY/MM/DD HH:mm:ss',
];

// ---------- Output format constants ----------
export const FORMATS = Object.freeze({
  DATE: 'YYYY-MM-DD',
  DATETIME: 'YYYY-MM-DD HH:mm:ss',
  ISO: 'YYYY-MM-DDTHH:mm:ss',          // no TZ suffix (naive)
  ISO_TZ: 'YYYY-MM-DDTHH:mm:ssZ',      // with offset (+00:00, +03:00)
  ISO_UTC: 'YYYY-MM-DDTHH:mm:ss[Z]',   // literal Z (UTC)
  TIME: 'HH:mm:ss',
});

// ---------- Core parser ----------

/**
 * Safely parse any date input. Returns null when invalid.
 * @param {*} input
 * @param {object} [opts]
 * @param {string} [opts.format] - Explicit format (strict)
 * @param {string} [opts.tz]     - Timezone to interpret wall-clock in
 * @returns {import('dayjs').Dayjs | null}
 */
export function parse(input, opts = {}) {
  if (input === null || input === undefined || input === '') return null;

  if (dayjs.isDayjs(input)) {
    return input.isValid() ? (opts.tz ? input.tz(opts.tz) : input) : null;
  }

  let d = null;

  // Explicit format → strict
  if (opts.format) {
    d = dayjs(input, opts.format, true);
  }

  // Try known formats strictly
  if ((!d || !d.isValid()) && typeof input === 'string') {
    const raw = input.trim();
    for (const fmt of DATE_FORMATS) {
      const candidate = dayjs(raw, fmt, true);
      if (candidate.isValid()) {
        // Reinterpret parsed wall-clock in the requested TZ (if any)
        d = opts.tz
          ? dayjs.tz(candidate.format('YYYY-MM-DDTHH:mm:ss'), opts.tz)
          : candidate;
        break;
      }
    }
  }

  // Native fallback (ISO 8601 with Z/offset, RFC 2822, Date, number)
  if (!d || !d.isValid()) {
    d = dayjs(input);
  }

  if (!d.isValid()) return null;

  // If tz requested and not already applied, convert
  if (opts.tz && !d.$x?.$timezone) {
    d = d.tz ? d.tz(opts.tz) : d;
  }

  return d;
}

export function isValid(input) {
  return parse(input) !== null;
}

// ---------- Now ----------

/**
 * Current time in the given timezone (default: UTC).
 * @param {string} [tz=DEFAULT_TIMEZONE]
 */
export function now(tz = DEFAULT_TIMEZONE) {
  return dayjs().tz(tz);
}

/** Current time in UTC (explicit). */
export function nowUTC() {
  return dayjs().utc();
}

// ---------- Formatting ----------

/**
 * Format a date.
 * @param {*} input
 * @param {string} [fmt=FORMATS.DATETIME]
 * @param {object} [opts]
 * @param {string} [opts.tz]          - Timezone to render in (default: UTC)
 * @param {string} [opts.fallback=''] - Returned if invalid
 */
export function format(input, fmt = FORMATS.DATETIME, opts = {}) {
  const tz = opts.tz ?? DEFAULT_TIMEZONE;
  const d = parse(input);
  if (!d) return opts.fallback ?? '';
  return d.tz(tz).format(fmt);
}

/** Format as "YYYY-MM-DD HH:mm:ss" (default UTC). */
export function formatDateTime(input, opts = {}) {
  return format(input, FORMATS.DATETIME, opts);
}

/** Format as "YYYY-MM-DD". */
export function formatDate(input, opts = {}) {
  return format(input, FORMATS.DATE, opts);
}

/** Format as "YYYY-MM-DDTHH:mm:ss" (naive, no TZ suffix). */
export function formatISO(input, opts = {}) {
  return format(input, FORMATS.ISO, opts);
}

/** Format as "YYYY-MM-DDTHH:mm:ssZ" (with offset). */
export function formatISOWithTZ(input, opts = {}) {
  return format(input, FORMATS.ISO_TZ, opts);
}

/** Format as UTC ISO with literal "Z". */
export function formatISOUTC(input, opts = {}) {
  return format(input, FORMATS.ISO_UTC, { ...opts, tz: UTC_TIMEZONE });
}

// ---------- Timezone conversion ----------

/** Convert an input to a specific timezone. */
export function toTimezone(input, tz = DEFAULT_TIMEZONE) {
  const d = parse(input);
  return d ? d.tz(tz) : null;
}

/** Convert to UTC. */
export function toUTC(input) {
  const d = parse(input);
  return d ? d.utc() : null;
}

/** Convert to Saudi time. */
export function toSaudi(input) {
  return toTimezone(input, TIMEZONES.SAUDI);
}

// ---------- Arithmetic ----------

export function addDays(input, n, opts = {}) {
  const d = parse(input);
  return d ? d.add(n, 'day').tz(opts.tz ?? DEFAULT_TIMEZONE) : null;
}

export function subDays(input, n, opts = {}) {
  const d = parse(input);
  return d ? d.subtract(n, 'day').tz(opts.tz ?? DEFAULT_TIMEZONE) : null;
}

export function addMonths(input, n, opts = {}) {
  const d = parse(input);
  return d ? d.add(n, 'month').tz(opts.tz ?? DEFAULT_TIMEZONE) : null;
}

export function diffInDays(a, b) {
  const da = parse(a);
  const db = parse(b);
  return da && db ? da.diff(db, 'day') : null;
}

export function diffInHours(a, b) {
  const da = parse(a);
  const db = parse(b);
  return da && db ? da.diff(db, 'hour') : null;
}

export function diffInMinutes(a, b) {
  const da = parse(a);
  const db = parse(b);
  return da && db ? da.diff(db, 'minute') : null;
}

// ---------- Boundaries ----------

export function startOfDay(input, opts = {}) {
  const d = parse(input);
  return d ? d.tz(opts.tz ?? DEFAULT_TIMEZONE).startOf('day') : null;
}

export function endOfDay(input, opts = {}) {
  const d = parse(input);
  return d ? d.tz(opts.tz ?? DEFAULT_TIMEZONE).endOf('day') : null;
}

export function startOfMonth(input, opts = {}) {
  const d = parse(input);
  return d ? d.tz(opts.tz ?? DEFAULT_TIMEZONE).startOf('month') : null;
}

export function endOfMonth(input, opts = {}) {
  const d = parse(input);
  return d ? d.tz(opts.tz ?? DEFAULT_TIMEZONE).endOf('month') : null;
}

// ---------- Comparison ----------

export function isBefore(a, b) {
  const da = parse(a);
  const db = parse(b);
  return da && db ? da.isBefore(db) : false;
}

export function isAfter(a, b) {
  const da = parse(a);
  const db = parse(b);
  return da && db ? da.isAfter(db) : false;
}

export function isSameDay(a, b, opts = {}) {
  const da = parse(a);
  const db = parse(b);
  if (!da || !db) return false;
  const tz = opts.tz ?? DEFAULT_TIMEZONE;
  return da.tz(tz).isSame(db.tz(tz), 'day');
}

// ---------- Relative ----------

export function fromNow(input, opts = {}) {
  const d = parse(input);
  if (!d) return '';
  return d.tz(opts.tz ?? DEFAULT_TIMEZONE).fromNow();
}

// ---------- API endpoint helper: parseStartDate ----------

/**
 * Parse a user-supplied startDate from an API endpoint.
 * Accepts: "2025-01-01", "01-01-2025", "2025-01-01 3:30", ISO 8601, Date, timestamp.
 *
 * Ambiguous DD-MM-YYYY vs MM-DD-YYYY → **DD-MM-YYYY (Saudi convention)**.
 *
 * @param {*} input
 * @param {object} [opts]
 * @param {string} [opts.tz=DEFAULT_TIMEZONE] - Interpret wall-clock in this TZ
 * @param {boolean} [opts.strict=false] - Throw on unparseable
 * @returns {import('dayjs').Dayjs | null}
 * @throws {Error} when strict && unparseable
 */
export function parseStartDate(input, opts = {}) {
  const tz = opts.tz ?? DEFAULT_TIMEZONE;

  // Non-string inputs
  if (input instanceof Date || typeof input === 'number' || dayjs.isDayjs(input)) {
    const d = parse(input);
    if (d) return d.tz(tz);
    return handleInvalidStartDate(input, opts);
  }

  if (typeof input !== 'string' || input.trim() === '') {
    return handleInvalidStartDate(input, opts);
  }

  const raw = input.trim();

  // Strict match against known formats
  for (const fmt of DATE_FORMATS) {
    const candidate = dayjs(raw, fmt, true);
    if (candidate.isValid()) {
      return dayjs.tz(candidate.format('YYYY-MM-DDTHH:mm:ss'), tz);
    }
  }

  // Native fallback (ISO with Z/offset, RFC 2822)
  const native = dayjs(raw);
  if (native.isValid()) return native.tz(tz);

  return handleInvalidStartDate(input, opts);
}

function handleInvalidStartDate(input, opts) {
  if (opts.strict) {
    const err = new Error(`Invalid startDate: ${JSON.stringify(input)}`);
    err.code = 'INVALID_START_DATE';
    err.statusCode = 400;
    throw err;
  }
  return null;
}

// ---------- Re-exports ----------
export { dayjs, DEFAULT_TIMEZONE, UTC_TIMEZONE, TIMEZONES };

export default {
  // raw configured instance
  dayjs,

  // parsing
  parse,
  parseStartDate,
  isValid,

  // formatting
  format,
  formatDate,
  formatDateTime,
  formatISO,
  formatISOWithTZ,
  formatISOUTC,

  // timezone
  toTimezone,
  toUTC,
  toSaudi,
  now,
  nowUTC,

  // arithmetic
  addDays,
  subDays,
  addMonths,
  diffInDays,
  diffInHours,
  diffInMinutes,

  // boundaries
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,

  // comparison
  isBefore,
  isAfter,
  isSameDay,

  // relative
  fromNow,

  // constants
  FORMATS,
  DEFAULT_TIMEZONE,
  UTC_TIMEZONE,
  TIMEZONES,
};



/**
 * 
 * 
 * import dt, { TIMEZONES } from './src/lib/datetime.mjs';

// ---------- Default: UTC ----------
dt.now().format();                          // "2026-10-13T20:30:45+00:00"
dt.formatDateTime(new Date());              // "2026-10-13 20:30:45"  ← UTC
dt.formatISOUTC(new Date());                // "2026-10-13T20:30:45Z"

// ---------- Override to Saudi ----------
dt.formatDateTime(new Date(), { tz: TIMEZONES.SAUDI });  // "2026-10-13 23:30:45"
dt.toSaudi(new Date());                                  // dayjs in Asia/Riyadh

// ---------- Override to any timezone ----------
dt.formatDateTime('2026-10-13T20:00:00Z', { tz: 'Africa/Cairo' });   // "2026-10-13 22:00:00"
dt.formatDateTime('2026-10-13T20:00:00Z', { tz: 'Europe/London' });  // "2026-10-13 20:00:00"
dt.formatDateTime('2026-10-13T20:00:00Z', { tz: 'America/New_York' });// "2026-10-13 15:00:00"

// ---------- Parse user input from API ----------
dt.parseStartDate('2025-01-01').format('YYYY-MM-DD HH:mm:ss');        // "2025-01-01 00:00:00"
dt.parseStartDate('01-01-2025').format('YYYY-MM-DD HH:mm:ss');        // "2025-01-01 00:00:00"
dt.parseStartDate('2025-01-01 3:30').format('YYYY-MM-DD HH:mm:ss');   // "2025-01-01 03:30:00"

// Parse as Saudi time (interprets 00:00 as Saudi midnight → UTC 21:00 prev day)
dt.parseStartDate('2025-01-01', { tz: TIMEZONES.SAUDI })
  .utc().format('YYYY-MM-DD HH:mm:ss');  // "2024-12-31 21:00:00"

// ---------- Express route ----------
// router.post('/medications', (req, res) => {
//   try {
//     const startDate = dt.parseStartDate(req.body.startDate, { strict: true });
//     const forDb = dt.formatISOUTC(startDate);     // "2025-01-01T00:00:00Z"
//     const forUi = dt.formatDateTime(startDate, { tz: TIMEZONES.SAUDI });
//     res.json({ startDate: forDb, startDateLocal: forUi });
//   } catch (err) {
//     res.status(400).json({ error: err.code, message: err.message });
//   }
// });
 */